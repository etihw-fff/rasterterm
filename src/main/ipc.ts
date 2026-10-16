import { isAbsolute } from "node:path";

import { app, BrowserWindow, dialog, ipcMain } from "electron";

import type { AppSettings } from "../shared/settings";

const startedAt = Date.now();

export function registerIpcHandlers(
  getSettings: () => AppSettings,
  importDroppedVideo: (filePath: string) => Promise<void>,
): void {
  ipcMain.handle("rasterterm:get-startup-info", () => {
    return {
      path: app.isPackaged ? app.getPath("exe") : app.getAppPath(),
      startedAt,
    };
  });

  // Rendererが現在の設定を取得するためのIPC。
  ipcMain.handle("rasterterm:get-settings", () => {
    return getSettings();
  });

  ipcMain.handle(
    "rasterterm:import-dropped-video",
    async (event, filePath: unknown): Promise<void> => {
      if (
        typeof filePath !== "string" ||
        filePath.length === 0 ||
        filePath.length > 4096 ||
        filePath.includes("\0") ||
        !isAbsolute(filePath)
      ) {
        throw new Error("動画ファイルのパスが不正です。");
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      const senderWebContents = window?.webContents;

      if (senderWebContents !== event.sender || senderWebContents.mainFrame !== event.senderFrame) {
        throw new Error("許可されていないウィンドウからの操作です。");
      }

      await importDroppedVideo(filePath);
    },
  );

  ipcMain.handle("rasterterm:show-error", async (event, message: unknown): Promise<void> => {
    if (typeof message !== "string" || message.length === 0 || message.length > 4096) {
      throw new Error("エラーメッセージが不正です。");
    }

    const window = BrowserWindow.fromWebContents(event.sender);

    if (window === null) {
      throw new Error("エラーダイアログの表示先ウィンドウが見つかりません。");
    }

    await dialog.showMessageBox(window, {
      type: "error",
      title: "RasterTerm",
      message,
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
    });
  });
}
