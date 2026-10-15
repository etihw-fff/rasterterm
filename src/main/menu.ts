import { dialog, Menu, type MenuItemConstructorOptions } from "electron";

import type { AppSettings } from "../shared/settings";
import { saveSettings } from "./settings";

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export function registerApplicationMenu(
  initialSettings: AppSettings,
  onSettingsChanged: (settings: AppSettings) => void,
): void {
  let currentSettings: AppSettings = { ...initialSettings };
  let saving = false;

  async function changeSettings(nextSettings: AppSettings): Promise<void> {
    if (saving) {
      return;
    }

    if (
      nextSettings.displayMode === currentSettings.displayMode &&
      nextSettings.loopStyle === currentSettings.loopStyle
    ) {
      return;
    }

    saving = true;
    updateMenu();

    try {
      await saveSettings(nextSettings);

      currentSettings = { ...nextSettings };

      // 保存に成功した設定をアプリ本体へ通知する。
      onSettingsChanged({ ...currentSettings });
    } catch (error: unknown) {
      dialog.showErrorBox("RasterTerm", `設定を保存できませんでした。\n${getErrorMessage(error)}`);
    } finally {
      saving = false;
      updateMenu();
    }
  }

  function updateMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),

      {
        label: "ファイル",
        submenu: [
          {
            label: "閉じる",
            role: "close",
          },
        ],
      },

      {
        label: "設定",
        submenu: [
          {
            label: "Display Mode",
            submenu: [
              {
                label: "Fit",
                type: "radio",
                checked: currentSettings.displayMode === "fit",
                enabled: !saving,
                click: () => {
                  void changeSettings({
                    ...currentSettings,
                    displayMode: "fit",
                  });
                },
              },
              {
                label: "Scroll",
                type: "radio",
                checked: currentSettings.displayMode === "scroll",
                enabled: !saving,
                click: () => {
                  void changeSettings({
                    ...currentSettings,
                    displayMode: "scroll",
                  });
                },
              },
            ],
          },

          {
            label: "Loop Style",
            submenu: [
              {
                label: "Transition",
                type: "radio",
                checked: currentSettings.loopStyle === "transition",
                enabled: !saving,
                click: () => {
                  void changeSettings({
                    ...currentSettings,
                    loopStyle: "transition",
                  });
                },
              },
              {
                label: "Direct",
                type: "radio",
                checked: currentSettings.loopStyle === "direct",
                enabled: !saving,
                click: () => {
                  void changeSettings({
                    ...currentSettings,
                    loopStyle: "direct",
                  });
                },
              },
            ],
          },
        ],
      },

      {
        label: "ギャラリー",
        submenu: [
          {
            label: "追加...",
            enabled: false,
          },
          {
            label: "選択...",
            enabled: false,
          },
          {
            label: "削除...",
            enabled: false,
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);

    Menu.setApplicationMenu(menu);
  }

  updateMenu();
}
