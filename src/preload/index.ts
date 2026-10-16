import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from "electron";

import type { GalleryEvent } from "../shared/gallery-events";
import type { AppSettings } from "../shared/settings";

type StartupInfo = {
  path: string;
  startedAt: number;
};

contextBridge.exposeInMainWorld("rasterterm", {
  getStartupInfo: (): Promise<StartupInfo> =>
    ipcRenderer.invoke("rasterterm:get-startup-info") as Promise<StartupInfo>,

  showError: (message: string): Promise<void> =>
    ipcRenderer.invoke("rasterterm:show-error", message) as Promise<void>,

  importDroppedVideo: (file: File): Promise<void> => {
    const filePath = webUtils.getPathForFile(file);

    if (filePath.length === 0) {
      return Promise.reject(new Error("ドロップされたファイルの保存先を取得できませんでした。"));
    }

    return ipcRenderer.invoke("rasterterm:import-dropped-video", filePath) as Promise<void>;
  },

  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke("rasterterm:get-settings") as Promise<AppSettings>,

  onSettingsChanged: (listener: (settings: AppSettings) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, settings: AppSettings): void => {
      listener(settings);
    };

    ipcRenderer.on("rasterterm:settings-changed", handler);

    return () => {
      ipcRenderer.removeListener("rasterterm:settings-changed", handler);
    };
  },

  // ギャラリーの選択・削除をRendererへ通知する。
  onGalleryEvent: (listener: (event: GalleryEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, event: GalleryEvent): void => {
      listener(event);
    };

    ipcRenderer.on("rasterterm:gallery-event", handler);

    return () => {
      ipcRenderer.removeListener("rasterterm:gallery-event", handler);
    };
  },
});
