import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { browser } from "@wdio/globals";

type AppSettings = {
  displayMode: "fit" | "scroll";
  loopStyle: "transition" | "direct";
};

type TestWindow = Window & {
  rasterterm?: {
    getSettings: () => Promise<AppSettings>;
    onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  };
  testSettingsEvents?: AppSettings[];
  unsubscribeTestSettings?: () => void;
};

// Rendererから現在の設定を取得する。
const getSettings = async (): Promise<AppSettings> => {
  return browser.execute(async () => {
    const bridge = (window as TestWindow).rasterterm;

    if (bridge === undefined) {
      throw new Error("Preload APIが見つかりません。");
    }

    return bridge.getSettings();
  });
};

// OS標準メニューの指定項目を実行する。
const selectMenuItem = async (
  category: "Display Mode" | "Loop Style",
  label: string,
): Promise<void> => {
  await browser.electron.execute(
    (electron, groupLabel: string, itemLabel: string) => {
      const menu = electron.Menu.getApplicationMenu();

      const settingsMenu = menu?.items.find((item) => item.label === "設定");

      const group = settingsMenu?.submenu?.items.find((item) => item.label === groupLabel);

      const target = group?.submenu?.items.find((item) => item.label === itemLabel);

      if (target === undefined || typeof target.click !== "function") {
        throw new Error(`メニュー項目が見つかりません: ${groupLabel} / ${itemLabel}`);
      }

      // メニューに登録されているclick処理を実行する。
      Reflect.apply(target.click, target, []);
    },
    category,
    label,
  );
};

// IPC反映が完了するまで確認する。
const waitForSettings = async (expected: AppSettings): Promise<void> => {
  await browser.waitUntil(
    async () => {
      const actual = await getSettings();

      return actual.displayMode === expected.displayMode && actual.loopStyle === expected.loopStyle;
    },
    {
      timeout: 10000,
      interval: 100,
      timeoutMsg: "設定変更がRendererに反映されませんでした。",
    },
  );
};

describe("RasterTerm 設定連携 E2E", () => {
  it("OS標準メニューとPreloadから現在の設定を取得できる", async () => {
    const settings = await getSettings();

    const validDisplayModes: readonly string[] = ["fit", "scroll"];
    const validLoopStyles: readonly string[] = ["transition", "direct"];

    assert.ok(validDisplayModes.includes(settings.displayMode));
    assert.ok(validLoopStyles.includes(settings.loopStyle));

    const menuState = await browser.electron.execute((electron) => {
      const menu = electron.Menu.getApplicationMenu();

      return {
        hasFileMenu: menu?.items.some((item) => item.label === "ファイル"),
        hasSettingsMenu: menu?.items.some((item) => item.label === "設定"),
        hasGalleryMenu: menu?.items.some((item) => item.label === "ギャラリー"),
      };
    });

    assert.equal(menuState.hasFileMenu, true);
    assert.equal(menuState.hasSettingsMenu, true);
    assert.equal(menuState.hasGalleryMenu, true);
  });

  it("メニュー変更を保存し、Rendererへ通知する", async () => {
    const originalSettings = await getSettings();

    // 普段の設定ファイルを書き換えないための一時フォルダ。
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "rasterterm-e2e-settings-"));

    let originalUserDataPath: string | null = null;

    try {
      // 設定保存先をテスト専用フォルダへ変更する。
      originalUserDataPath = await browser.electron.execute((electron, directory: string) => {
        const previous = electron.app.getPath("userData");
        electron.app.setPath("userData", directory);
        return previous;
      }, temporaryDirectory);

      // Rendererで設定変更通知を記録する。
      await browser.execute(() => {
        const appWindow = window as TestWindow;
        const bridge = appWindow.rasterterm;

        if (bridge === undefined) {
          throw new Error("Preload APIが見つかりません。");
        }

        appWindow.testSettingsEvents = [];

        appWindow.unsubscribeTestSettings = bridge.onSettingsChanged((settings) => {
          appWindow.testSettingsEvents?.push(settings);
        });
      });

      // 現在とは反対の設定を選ぶ。
      const nextSettings: AppSettings = {
        displayMode: originalSettings.displayMode === "fit" ? "scroll" : "fit",
        loopStyle: originalSettings.loopStyle === "transition" ? "direct" : "transition",
      };

      // Display Modeを変更する。
      await selectMenuItem("Display Mode", nextSettings.displayMode === "fit" ? "Fit" : "Scroll");

      await waitForSettings({
        ...originalSettings,
        displayMode: nextSettings.displayMode,
      });

      // Loop Styleを変更する。
      await selectMenuItem(
        "Loop Style",
        nextSettings.loopStyle === "transition" ? "Transition" : "Direct",
      );

      await waitForSettings(nextSettings);

      // MainからRendererへ2回通知されたことを確認する。
      const receivedEvents = await browser.execute(() => {
        return (window as TestWindow).testSettingsEvents ?? [];
      });

      assert.equal(receivedEvents.length, 2);
      assert.deepEqual(receivedEvents[1], nextSettings);

      // 設定がJSONファイルへ保存されたことを確認する。
      const content = await readFile(join(temporaryDirectory, "settings.json"), "utf8");

      const savedSettings: unknown = JSON.parse(content);

      assert.deepEqual(savedSettings, nextSettings);
    } finally {
      try {
        // 元の設定に戻す。
        if (originalUserDataPath !== null) {
          await selectMenuItem(
            "Display Mode",
            originalSettings.displayMode === "fit" ? "Fit" : "Scroll",
          );

          await waitForSettings({
            displayMode: originalSettings.displayMode,
            loopStyle: (await getSettings()).loopStyle,
          });

          await selectMenuItem(
            "Loop Style",
            originalSettings.loopStyle === "transition" ? "Transition" : "Direct",
          );

          await waitForSettings(originalSettings);
        }
      } finally {
        // 通知の監視を解除する。
        await browser.execute(() => {
          const appWindow = window as TestWindow;

          appWindow.unsubscribeTestSettings?.();

          delete appWindow.unsubscribeTestSettings;
          delete appWindow.testSettingsEvents;
        });

        // 保存先を元に戻す。
        if (originalUserDataPath !== null) {
          await browser.electron.execute((electron, originalPath: string) => {
            electron.app.setPath("userData", originalPath);
          }, originalUserDataPath);
        }

        // テスト用のファイルを削除する。
        await rm(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      }
    }
  });
});
