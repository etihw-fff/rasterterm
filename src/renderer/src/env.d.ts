import type { AppSettings } from "../../shared/settings";

export {};

declare global {
  interface Window {
    rasterterm: {
      getStartupInfo: () => Promise<{
        path: string;
        startedAt: number;
      }>;

      showError: (message: string) => Promise<void>;

      getSettings: () => Promise<AppSettings>;

      onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
    };
  }
}
