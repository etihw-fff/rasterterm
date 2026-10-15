import { beforeEach, describe, expect, test, vi } from "vitest";

import { type AppSettings, DEFAULT_SETTINGS } from "../shared/settings";
import { registerIpcHandlers } from "./ipc";

// ElectronのIPC・ウィンドウ・ダイアログを再現する。
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn<(channel: string, listener: (...args: unknown[]) => unknown) => void>(),
  getAppPath: vi.fn<() => string>(),
  getPath: vi.fn<(name: string) => string>(),
  fromWebContents: vi.fn<(sender: unknown) => unknown>(),
  showMessageBox: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: mocks.getAppPath,
    getPath: mocks.getPath,
  },
  BrowserWindow: {
    fromWebContents: mocks.fromWebContents,
  },
  dialog: {
    showMessageBox: mocks.showMessageBox,
  },
  ipcMain: {
    handle: mocks.handle,
  },
}));

// 登録されたIPCの処理関数を取得する。
const getHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const handler = mocks.handlers.get(channel);

  if (handler === undefined) {
    throw new Error(`IPCが登録されていません: ${channel}`);
  }

  return handler;
};

describe("Main ProcessのIPC通信", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.handlers.clear();

    mocks.handle.mockImplementation((channel, listener) => {
      mocks.handlers.set(channel, listener);
    });

    mocks.getAppPath.mockReturnValue("/rasterterm");
    mocks.showMessageBox.mockResolvedValue(undefined);
  });

  test("必要な3種類のIPCが登録される", () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }));

    expect(mocks.handle).toHaveBeenCalledTimes(3);

    expect(mocks.handlers.has("rasterterm:get-startup-info")).toBe(true);
    expect(mocks.handlers.has("rasterterm:get-settings")).toBe(true);
    expect(mocks.handlers.has("rasterterm:show-error")).toBe(true);
  });

  test("Rendererから現在の設定を取得できる", () => {
    let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

    registerIpcHandlers(() => ({ ...currentSettings }));

    const handler = getHandler("rasterterm:get-settings");

    expect(handler({})).toStrictEqual(DEFAULT_SETTINGS);

    // Main側で設定が更新された場合。
    currentSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
    };

    // 次の取得では更新後の設定が返る。
    expect(handler({})).toStrictEqual(currentSettings);
  });

  test("Rendererから起動情報を取得できる", () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }));

    const handler = getHandler("rasterterm:get-startup-info");
    const result = handler({});

    if (
      typeof result !== "object" ||
      result === null ||
      !("path" in result) ||
      !("startedAt" in result)
    ) {
      throw new Error("起動情報の形式が不正です。");
    }

    expect(result.path).toBe("/rasterterm");
    expect(typeof result.startedAt).toBe("number");
    expect(result.startedAt).toBeGreaterThan(0);

    expect(mocks.getAppPath).toHaveBeenCalledTimes(1);
  });

  test("不正なエラーメッセージを拒否する", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }));

    const handler = getHandler("rasterterm:show-error");

    const invalidMessages: unknown[] = ["", 123, null, "x".repeat(4097)];

    for (const message of invalidMessages) {
      await expect(handler({ sender: {} }, message)).rejects.toThrow(
        "エラーメッセージが不正です。",
      );
    }

    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  test("表示先ウィンドウがない場合はエラーになる", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }));

    mocks.fromWebContents.mockReturnValue(null);

    const handler = getHandler("rasterterm:show-error");

    await expect(handler({ sender: {} }, "テストエラー")).rejects.toThrow(
      "エラーダイアログの表示先ウィンドウが見つかりません。",
    );

    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  test("有効なエラーをOS標準ダイアログに渡す", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }));

    const sender = {};
    const mainWindow = {};

    mocks.fromWebContents.mockReturnValue(mainWindow);

    const handler = getHandler("rasterterm:show-error");

    await expect(handler({ sender }, "動画の読み込みに失敗しました。")).resolves.toBeUndefined();

    expect(mocks.fromWebContents).toHaveBeenCalledWith(sender);

    expect(mocks.showMessageBox).toHaveBeenCalledExactlyOnceWith(mainWindow, {
      type: "error",
      title: "RasterTerm",
      message: "動画の読み込みに失敗しました。",
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
    });
  });
});
