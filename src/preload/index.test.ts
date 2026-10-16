import { beforeEach, describe, expect, test, vi } from "vitest";

import type { GalleryEvent } from "../shared/gallery-events";
import type { AppSettings } from "../shared/settings";

type StartupInfo = {
  path: string;
  startedAt: number;
};

type RasterTermBridge = {
  getStartupInfo: () => Promise<StartupInfo>;
  showError: (message: string) => Promise<void>;
  importDroppedVideo: (file: File) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  onGalleryEvent: (listener: (event: GalleryEvent) => void) => () => void;
};

type IpcHandler = (event: unknown, payload: unknown) => void;

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn<(name: string, api: unknown) => void>(),
  getPathForFile: vi.fn<(file: File) => string>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, handler: IpcHandler) => void>(),
  removeListener: vi.fn<(channel: string, handler: IpcHandler) => void>(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  webUtils: {
    getPathForFile: mocks.getPathForFile,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

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
    vi.resetModules();
    vi.resetAllMocks();

    await import("./index");
  });

  test("必要な6種類のAPIをRendererへ公開する", () => {
    expect(mocks.exposeInMainWorld).toHaveBeenCalledTimes(1);

    const bridge = getBridge();

    expect(Object.keys(bridge).sort()).toStrictEqual(
      [
        "getStartupInfo",
        "showError",
        "importDroppedVideo",
        "getSettings",
        "onSettingsChanged",
        "onGalleryEvent",
      ].sort(),
    );

    expect(typeof bridge.getStartupInfo).toBe("function");
    expect(typeof bridge.showError).toBe("function");
    expect(typeof bridge.importDroppedVideo).toBe("function");
    expect(typeof bridge.getSettings).toBe("function");
    expect(typeof bridge.onSettingsChanged).toBe("function");
    expect(typeof bridge.onGalleryEvent).toBe("function");
  });

  test("起動情報を正しいIPCチャンネルから取得する", async () => {
    const info: StartupInfo = {
      path: "/rasterterm",
      startedAt: 123456789,
    };

    mocks.invoke.mockResolvedValueOnce(info);

    await expect(getBridge().getStartupInfo()).resolves.toStrictEqual(info);

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("rasterterm:get-startup-info");
  });

  test("エラーメッセージをMain Processへ送る", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);

    await expect(getBridge().showError("動画の読み込みに失敗しました。")).resolves.toBeUndefined();

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      "rasterterm:show-error",
      "動画の読み込みに失敗しました。",
    );
  });

  test("ドロップされた動画の実ファイルパスをIPCでMainに渡す", async () => {
    const file = new File(["video"], "sample.webm", { type: "video/webm" });
    mocks.getPathForFile.mockReturnValue("/tmp/sample.webm");
    mocks.invoke.mockResolvedValue(undefined);

    await expect(getBridge().importDroppedVideo(file)).resolves.toBeUndefined();
    expect(mocks.getPathForFile).toHaveBeenCalledExactlyOnceWith(file);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      "rasterterm:import-dropped-video",
      "/tmp/sample.webm",
    );
  });

  test("実ファイルパスを取得できない場合はMainへ送らない", async () => {
    const file = new File(["video"], "sample.webm", { type: "video/webm" });
    mocks.getPathForFile.mockReturnValue("");

    await expect(getBridge().importDroppedVideo(file)).rejects.toThrow(
      "ドロップされたファイルの保存先を取得できませんでした。",
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  test("保存済み設定を取得する", async () => {
    const settings: AppSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
      fontSize: 10,
    };

    mocks.invoke.mockResolvedValueOnce(settings);

    await expect(getBridge().getSettings()).resolves.toStrictEqual(settings);

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("rasterterm:get-settings");
  });

  test("設定変更通知をRendererへ渡す", () => {
    const listener = vi.fn<(settings: AppSettings) => void>();

    getBridge().onSettingsChanged(listener);

    const registration = mocks.on.mock.lastCall;

    if (registration === undefined) {
      throw new Error("設定変更イベントが登録されていません。");
    }

    const [channel, handler] = registration;

    expect(channel).toBe("rasterterm:settings-changed");

    const settings: AppSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
      fontSize: 10,
    };

    handler({}, settings);

    expect(listener).toHaveBeenCalledExactlyOnceWith(settings);
  });

  test("設定変更通知の監視を解除する", () => {
    const listener = vi.fn<(settings: AppSettings) => void>();
    const unsubscribe = getBridge().onSettingsChanged(listener);

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

  test("IPC通信エラーを呼び出し元へ伝える", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("IPC通信エラー"));

    await expect(getBridge().getSettings()).rejects.toThrow("IPC通信エラー");
  });

  test("ギャラリーの再生・削除イベントをRendererへ渡す", () => {
    const listener = vi.fn<(event: GalleryEvent) => void>();

    getBridge().onGalleryEvent(listener);

    const registration = mocks.on.mock.lastCall;

    if (registration === undefined) {
      throw new Error("ギャラリーイベントが登録されていません。");
    }

    const [channel, handler] = registration;

    expect(channel).toBe("rasterterm:gallery-event");

    const playEvent: GalleryEvent = {
      type: "play",
      id: "video-1",
    };

    const removedEvent: GalleryEvent = {
      type: "removed",
      ids: ["video-1", "video-2"],
    };

    handler({}, playEvent);
    handler({}, removedEvent);

    expect(listener).toHaveBeenNthCalledWith(1, playEvent);
    expect(listener).toHaveBeenNthCalledWith(2, removedEvent);
  });

  test("ギャラリー通知の監視を解除する", () => {
    const listener = vi.fn<(event: GalleryEvent) => void>();
    const unsubscribe = getBridge().onGalleryEvent(listener);

    const registration = mocks.on.mock.lastCall;

    if (registration === undefined) {
      throw new Error("ギャラリーイベントが登録されていません。");
    }

    const [, handler] = registration;

    unsubscribe();

    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(
      "rasterterm:gallery-event",
      handler,
    );
  });
});
