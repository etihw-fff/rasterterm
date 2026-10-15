import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AppSettings } from "../shared/settings";

type StartupInfo = {
  path: string;
  startedAt: number;
};

type RasterTermBridge = {
  getStartupInfo: () => Promise<StartupInfo>;
  showError: (message: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
};

type SettingsHandler = (event: unknown, settings: AppSettings) => void;

// ElectronのPreload APIをモックに置き換える。
const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(name: string, api: unknown) => void>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, handler: SettingsHandler) => void>(),
  removeListener: vi.fn<(channel: string, handler: SettingsHandler) => void>(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

// Preloadから公開されたAPIを取得する。
const getBridge = (): RasterTermBridge => {
  const call = mocks.exposeInMainWorld.mock.lastCall;

  if (call === undefined) {
    throw new Error("Preload APIが公開されていません。");
  }

  const [name, api] = call;

  if (name !== "rasterterm" || typeof api !== "object" || api === null) {
    throw new Error("公開されたPreload APIが不正です。");
  }

  return api as RasterTermBridge;
};

describe("PreloadのIPC通信", () => {
  beforeEach(async () => {
    // 各テストでPreloadの初期化をやり直す。
    vi.resetModules();
    vi.resetAllMocks();

    await import("./index");
  });

  test("必要な4種類のAPIをRendererへ公開する", () => {
    expect(mocks.exposeInMainWorld).toHaveBeenCalledTimes(1);

    const bridge = getBridge();

    expect(Object.keys(bridge).sort()).toStrictEqual(
      ["getStartupInfo", "showError", "getSettings", "onSettingsChanged"].sort(),
    );

    expect(typeof bridge.getStartupInfo).toBe("function");
    expect(typeof bridge.showError).toBe("function");
    expect(typeof bridge.getSettings).toBe("function");
    expect(typeof bridge.onSettingsChanged).toBe("function");
  });

  test("起動情報を正しいIPCチャンネルから取得する", async () => {
    const info: StartupInfo = {
      path: "/rasterterm",
      startedAt: 123456789,
    };

    mocks.invoke.mockResolvedValueOnce(info);

    const bridge = getBridge();

    await expect(bridge.getStartupInfo()).resolves.toStrictEqual(info);

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("rasterterm:get-startup-info");
  });

  test("エラーメッセージをMain Processへ送る", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);

    const bridge = getBridge();

    await expect(bridge.showError("動画の読み込みに失敗しました。")).resolves.toBeUndefined();

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      "rasterterm:show-error",
      "動画の読み込みに失敗しました。",
    );
  });

  test("保存済み設定を正しいIPCチャンネルから取得する", async () => {
    const settings: AppSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
    };

    mocks.invoke.mockResolvedValueOnce(settings);

    const bridge = getBridge();

    await expect(bridge.getSettings()).resolves.toStrictEqual(settings);

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("rasterterm:get-settings");
  });

  test("設定変更通知を登録し、設定値だけをRendererへ渡す", () => {
    const bridge = getBridge();
    const listener = vi.fn<(settings: AppSettings) => void>();

    bridge.onSettingsChanged(listener);

    expect(mocks.on).toHaveBeenCalledTimes(1);

    const registration = mocks.on.mock.lastCall;

    if (registration === undefined) {
      throw new Error("設定変更イベントが登録されていません。");
    }

    const [channel, handler] = registration;

    expect(channel).toBe("rasterterm:settings-changed");

    const settings: AppSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
    };

    // Main Processからの通知を再現する。
    const electronEvent = { sender: "main-process" };

    handler(electronEvent, settings);

    // ElectronのイベントオブジェクトはRendererへ渡さない。
    expect(listener).toHaveBeenCalledExactlyOnceWith(settings);
  });

  test("登録解除時に同じイベント処理関数を削除する", () => {
    const bridge = getBridge();
    const listener = vi.fn<(settings: AppSettings) => void>();

    const unsubscribe = bridge.onSettingsChanged(listener);

    const registration = mocks.on.mock.lastCall;

    if (registration === undefined) {
      throw new Error("設定変更イベントが登録されていません。");
    }

    const [, handler] = registration;

    unsubscribe();

    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(
      "rasterterm:settings-changed",
      handler,
    );
  });

  test("IPC通信に失敗した場合はエラーを呼び出し元へ伝える", async () => {
    const bridge = getBridge();

    mocks.invoke.mockRejectedValueOnce(new Error("IPC通信エラー"));

    await expect(bridge.getSettings()).rejects.toThrow("IPC通信エラー");

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("rasterterm:get-settings");
  });
});
