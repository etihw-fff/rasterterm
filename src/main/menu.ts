import { dialog, Menu, type MenuItemConstructorOptions } from "electron";

import type { AppSettings } from "../shared/settings";
import { saveSettings } from "./settings";

export type GalleryMenuActions = {
  add: () => Promise<void>;
  select: () => Promise<void>;
  delete: () => Promise<void>;
};

export type ApplicationMenuController = {
  setGalleryHasItems: (hasItems: boolean) => void;
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export function registerApplicationMenu(
  initialSettings: AppSettings,
  onSettingsChanged: (settings: AppSettings) => void,
  galleryActions?: GalleryMenuActions,
  initialGalleryHasItems = false,
): ApplicationMenuController {
  let currentSettings: AppSettings = { ...initialSettings };
  let saving = false;
  let galleryBusy = false;
  let galleryHasItems = initialGalleryHasItems;

  async function changeSettings(nextSettings: AppSettings): Promise<void> {
    if (saving || galleryBusy) {
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
      onSettingsChanged({ ...currentSettings });
    } catch (error: unknown) {
      dialog.showErrorBox("RasterTerm", `設定を保存できませんでした。\n${getErrorMessage(error)}`);
    } finally {
      saving = false;
      updateMenu();
    }
  }

  async function runGalleryAction(operation: () => Promise<void>): Promise<void> {
    if (saving || galleryBusy) {
      return;
    }

    galleryBusy = true;
    updateMenu();

    try {
      await operation();
    } catch (error: unknown) {
      dialog.showErrorBox(
        "RasterTerm",
        `ギャラリーの操作に失敗しました。\n${getErrorMessage(error)}`,
      );
    } finally {
      galleryBusy = false;
      updateMenu();
    }
  }

  function updateMenu(): void {
    const settingsEnabled = !saving && !galleryBusy;
    const galleryEnabled = galleryActions !== undefined && settingsEnabled;

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
                enabled: settingsEnabled,
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
                enabled: settingsEnabled,
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
                enabled: settingsEnabled,
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
                enabled: settingsEnabled,
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
            enabled: galleryEnabled,
            click: () => {
              if (galleryActions !== undefined) {
                void runGalleryAction(galleryActions.add);
              }
            },
          },
          {
            label: "選択...",
            enabled: galleryEnabled && galleryHasItems,
            click: () => {
              if (galleryActions !== undefined && galleryHasItems) {
                void runGalleryAction(galleryActions.select);
              }
            },
          },
          {
            label: "削除...",
            enabled: galleryEnabled && galleryHasItems,
            click: () => {
              if (galleryActions !== undefined && galleryHasItems) {
                void runGalleryAction(galleryActions.delete);
              }
            },
          },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  updateMenu();

  return {
    setGalleryHasItems: (hasItems: boolean): void => {
      galleryHasItems = hasItems;
      updateMenu();
    },
  };
}
