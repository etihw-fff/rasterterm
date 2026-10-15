import { app, BrowserWindow, dialog } from "electron";

import { registerIpcHandlers } from "./ipc";
import { registerApplicationMenu } from "./menu";
import { loadSettings } from "./settings";
import { createMainWindow } from "./window";

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

async function initializeApp(): Promise<void> {
  await app.whenReady();

  try {
    // 起動時に保存済みの設定を読み込む。
    let currentSettings = await loadSettings();

    // Rendererが現在の設定を取得できるようにする。
    registerIpcHandlers(() => ({ ...currentSettings }));

    // メニューを登録し、設定変更をRendererへ通知する。
    registerApplicationMenu(currentSettings, (nextSettings) => {
      currentSettings = { ...nextSettings };

      for (const mainWindow of BrowserWindow.getAllWindows()) {
        if (!mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send("rasterterm:settings-changed", {
            ...currentSettings,
          });
        }
      }
    });
  } catch (error: unknown) {
    dialog.showErrorBox(
      "RasterTerm",
      `設定ファイルを読み込めませんでした。\n${getErrorMessage(error)}`,
    );

    app.quit();
    return;
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

void initializeApp().catch((error: unknown) => {
  dialog.showErrorBox("RasterTerm", `アプリの起動に失敗しました。\n${getErrorMessage(error)}`);

  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
