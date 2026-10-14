import { app, ipcMain } from "electron";

const startedAt = Date.now();

export function registerIpcHandlers(): void {
  ipcMain.handle("rasterterm:get-startup-info", () => {
    return {
      path: app.isPackaged ? app.getPath("exe") : app.getAppPath(),
      startedAt,
    };
  });
}
