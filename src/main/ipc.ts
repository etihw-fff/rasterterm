import { app, BrowserWindow, dialog, ipcMain } from "electron";

import type { AppSettings } from "../shared/settings";

const startedAt = Date.now();

export function registerIpcHandlers(getSettings: () => AppSettings): void {
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
