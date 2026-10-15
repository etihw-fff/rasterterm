import { contextBridge, ipcRenderer } from "electron";

type StartupInfo = {
  path: string;
  startedAt: number;
};

contextBridge.exposeInMainWorld("rasterterm", {
  getStartupInfo: (): Promise<StartupInfo> =>
    ipcRenderer.invoke("rasterterm:get-startup-info") as Promise<StartupInfo>,
  showError: (message: string): Promise<void> =>
    ipcRenderer.invoke("rasterterm:show-error", message) as Promise<void>,
});
