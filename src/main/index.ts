import { app, BrowserWindow, dialog } from "electron";

import type { GalleryEvent } from "../shared/gallery-events";
import {
  showGalleryAddDialog,
  showGalleryDeleteDialog,
  showGallerySelectDialog,
} from "./gallery/dialogs";
import { importLibraryVideos, migrateLibraryFileNames } from "./gallery/import";
import { listLibraryVideos } from "./gallery/operations";
import { startGalleryVideoServer } from "./gallery/server";
import { registerIpcHandlers } from "./ipc";
import type { ApplicationMenuController } from "./menu";
import { registerApplicationMenu } from "./menu";
import { loadSettings } from "./settings";
import { createMainWindow } from "./window";

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const getActiveWindow = (): BrowserWindow | undefined => {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
};

const broadcastGalleryEvent = (event: GalleryEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("rasterterm:gallery-event", event);
    }
  }
};

async function initializeApp(): Promise<void> {
  await app.whenReady();

  try {
    // 動画の配信は、このPCのループバック接続だけで行う。
    const videoServer = await startGalleryVideoServer();

    app.once("before-quit", () => {
      void videoServer.close().catch((error: unknown) => {
        console.error("Gallery video server shutdown failed:", getErrorMessage(error));
      });
    });

    await migrateLibraryFileNames();
    let currentSettings = await loadSettings();
    const initialGalleryItems = await listLibraryVideos();

    let menuController: ApplicationMenuController | null = null;

    const refreshGalleryMenu = async (): Promise<void> => {
      const items = await listLibraryVideos();

      menuController?.setGalleryHasItems(items.length > 0);
    };

    const playGalleryVideo = (id: string): void => {
      broadcastGalleryEvent({
        type: "play",
        id,
        url: videoServer.urlForId(id),
      });
    };

    registerIpcHandlers(
      () => ({ ...currentSettings }),
      async (filePath: string): Promise<void> => {
        const result = await importLibraryVideos([filePath]);

        await refreshGalleryMenu();

        const failed = result.failed[0];

        if (failed !== undefined) {
          throw new Error(failed.message);
        }

        const item = result.added[0] ?? result.reused[0];

        if (item === undefined) {
          throw new Error("動画をLibraryへ登録できませんでした。");
        }

        playGalleryVideo(item.id);
      },
    );

    menuController = registerApplicationMenu(
      currentSettings,
      (nextSettings) => {
        currentSettings = { ...nextSettings };

        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.webContents.isDestroyed()) {
            window.webContents.send("rasterterm:settings-changed", { ...currentSettings });
          }
        }
      },
      {
        add: async () => {
          const window = getActiveWindow();

          if (window === undefined) {
            return;
          }

          const result = await showGalleryAddDialog(window);

          await refreshGalleryMenu();

          const firstPlayable = result?.added[0];

          if (firstPlayable !== undefined) {
            playGalleryVideo(firstPlayable.id);
          }
        },

        select: async () => {
          const window = getActiveWindow();

          if (window === undefined) {
            return;
          }

          const id = await showGallerySelectDialog(window);

          if (id !== null) {
            playGalleryVideo(id);
          }
        },

        delete: async () => {
          const window = getActiveWindow();

          if (window === undefined) {
            return;
          }

          const result = await showGalleryDeleteDialog(window);

          await refreshGalleryMenu();

          if (result !== null && result.deleted.length > 0) {
            broadcastGalleryEvent({
              type: "removed",
              ids: result.deleted.map((item) => item.id),
            });
          }
        },
      },
      initialGalleryItems.length > 0,
    );
  } catch (error: unknown) {
    dialog.showErrorBox("RasterTerm", `アプリの初期化に失敗しました。\n${getErrorMessage(error)}`);

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
