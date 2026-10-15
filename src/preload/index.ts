import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

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

  // 現在保存されている設定を取得する。
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke("rasterterm:get-settings") as Promise<AppSettings>,

  // 設定変更の通知を受け取る。
  onSettingsChanged: (listener: (settings: AppSettings) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, settings: AppSettings): void => {
      listener(settings);
    };

    ipcRenderer.on("rasterterm:settings-changed", handler);

    // 監視を解除するための関数を返す。
    return () => {
      ipcRenderer.removeListener("rasterterm:settings-changed", handler);
    };
  },
});
