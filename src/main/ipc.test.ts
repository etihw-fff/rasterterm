import { resolve } from "node:path";

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
  importDroppedVideo: vi.fn<(filePath: string) => Promise<void>>(),
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
    mocks.importDroppedVideo.mockResolvedValue(undefined);
  });

  test("必要な4種類のIPCが登録される", () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

    expect(mocks.handle).toHaveBeenCalledTimes(4);

    expect(mocks.handlers.has("rasterterm:get-startup-info")).toBe(true);
    expect(mocks.handlers.has("rasterterm:get-settings")).toBe(true);
    expect(mocks.handlers.has("rasterterm:show-error")).toBe(true);
    expect(mocks.handlers.has("rasterterm:import-dropped-video")).toBe(true);
  });

  test("Rendererから現在の設定を取得できる", () => {
    let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

    registerIpcHandlers(() => ({ ...currentSettings }), mocks.importDroppedVideo);

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
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

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

  test("有効なドロップ元パスはMainで処理する", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

    const frame = {};
    const webContents = { mainFrame: frame };
    mocks.fromWebContents.mockReturnValue({ webContents });

    await expect(
      getHandler("rasterterm:import-dropped-video")(
        { sender: webContents, senderFrame: frame },
        resolve("sample.webm"),
      ),
    ).resolves.toBeUndefined();

    expect(mocks.importDroppedVideo).toHaveBeenCalledExactlyOnceWith(resolve("sample.webm"));
  });

  test("相対パスや不正な入力ではLibrary操作を行わない", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);
    const handler = getHandler("rasterterm:import-dropped-video");

    for (const path of ["", "../sample.webm", 17, null, "a".repeat(4097), "/tmp/\0.webm"]) {
      await expect(handler({ sender: {} }, path)).rejects.toThrow("動画ファイルのパスが不正です。");
    }

    expect(mocks.importDroppedVideo).not.toHaveBeenCalled();
  });

  test("別ウィンドウまたはサブフレームからの要求は拒否する", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);
    const handler = getHandler("rasterterm:import-dropped-video");
    const webContents = { mainFrame: {} };
    mocks.fromWebContents.mockReturnValue({ webContents });

    await expect(
      handler({ sender: {}, senderFrame: webContents.mainFrame }, resolve("sample.webm")),
    ).rejects.toThrow("許可されていないウィンドウからの操作です。");

    await expect(
      handler({ sender: webContents, senderFrame: {} }, resolve("sample.webm")),
    ).rejects.toThrow("許可されていないウィンドウからの操作です。");

    expect(mocks.importDroppedVideo).not.toHaveBeenCalled();
  });

  test("Libraryへの取り込みで失敗した場合はIPC呼び出し元に伝える", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);
    const webContents = { mainFrame: {} };
    mocks.fromWebContents.mockReturnValue({ webContents });
    mocks.importDroppedVideo.mockRejectedValueOnce(new Error("コピーに失敗しました。"));

    await expect(
      getHandler("rasterterm:import-dropped-video")(
        { sender: webContents, senderFrame: webContents.mainFrame },
        resolve("sample.webm"),
      ),
    ).rejects.toThrow("コピーに失敗しました。");
  });

  test("不正なエラーメッセージを拒否する", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

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
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

    mocks.fromWebContents.mockReturnValue(null);

    const handler = getHandler("rasterterm:show-error");

    await expect(handler({ sender: {} }, "テストエラー")).rejects.toThrow(
      "エラーダイアログの表示先ウィンドウが見つかりません。",
    );

    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  test("有効なエラーをOS標準ダイアログに渡す", async () => {
    registerIpcHandlers(() => ({ ...DEFAULT_SETTINGS }), mocks.importDroppedVideo);

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
