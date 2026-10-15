import type { MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type AppSettings, DEFAULT_SETTINGS } from "../shared/settings";
import { registerApplicationMenu } from "./menu";

const mocks = vi.hoisted(() => ({
  buildFromTemplate:
    vi.fn<(template: MenuItemConstructorOptions[]) => MenuItemConstructorOptions[]>(),
  setApplicationMenu: vi.fn(),
  showErrorBox: vi.fn(),
  saveSettings: vi.fn<(settings: AppSettings) => Promise<void>>(),
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
  dialog: {
    showErrorBox: mocks.showErrorBox,
  },
}));

vi.mock("./settings", () => ({
  saveSettings: mocks.saveSettings,
}));

// メニュー内の設定項目を取得する。
const getSettingItem = (
  category: "Display Mode" | "Loop Style",
  label: string,
): MenuItemConstructorOptions => {
  const template = mocks.buildFromTemplate.mock.lastCall?.[0];

  if (!template) {
    throw new Error("メニューが作成されていません。");
  }

  const settingsMenu = template.find((item) => item.label === "設定");

  if (!settingsMenu || !Array.isArray(settingsMenu.submenu)) {
    throw new Error("設定メニューが見つかりません。");
  }

  const groups = settingsMenu.submenu;
  const group = groups.find((item) => item.label === category);

  if (!group || !Array.isArray(group.submenu)) {
    throw new Error(`${category}が見つかりません。`);
  }

  const items = group.submenu;
  const result = items.find((item) => item.label === label);

  if (!result) {
    throw new Error(`${label}が見つかりません。`);
  }

  return result;
};

// テスト内でメニュー項目のclick処理を呼び出す。
const activate = (item: MenuItemConstructorOptions): void => {
  if (!item.click) {
    throw new Error("click処理がありません。");
  }

  const args = [{}, undefined, {}] as unknown as Parameters<
    NonNullable<MenuItemConstructorOptions["click"]>
  >;

  item.click(...args);
};

describe("OS標準アプリケーションメニュー", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.buildFromTemplate.mockImplementation((template) => template);
    mocks.saveSettings.mockResolvedValue(undefined);
  });

  test("初期設定に応じたチェック状態でメニューを作成する", () => {
    const onChanged = vi.fn<(settings: AppSettings) => void>();

    registerApplicationMenu(DEFAULT_SETTINGS, onChanged);

    expect(mocks.setApplicationMenu).toHaveBeenCalledTimes(1);

    expect(getSettingItem("Display Mode", "Fit").checked).toBe(true);
    expect(getSettingItem("Display Mode", "Scroll").checked).toBe(false);

    expect(getSettingItem("Loop Style", "Transition").checked).toBe(true);
    expect(getSettingItem("Loop Style", "Direct").checked).toBe(false);

    expect(mocks.saveSettings).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test("Display Modeを変更すると保存して通知する", async () => {
    const onChanged = vi.fn<(settings: AppSettings) => void>();

    registerApplicationMenu(DEFAULT_SETTINGS, onChanged);

    activate(getSettingItem("Display Mode", "Scroll"));

    const expected: AppSettings = {
      displayMode: "scroll",
      loopStyle: "transition",
    };

    await vi.waitFor(() => {
      expect(mocks.saveSettings).toHaveBeenCalledExactlyOnceWith(expected);
      expect(onChanged).toHaveBeenCalledExactlyOnceWith(expected);
      expect(getSettingItem("Display Mode", "Scroll").checked).toBe(true);
      expect(getSettingItem("Display Mode", "Fit").checked).toBe(false);
    });
  });

  test("Loop Styleを変更すると保存して通知する", async () => {
    const onChanged = vi.fn<(settings: AppSettings) => void>();

    registerApplicationMenu(DEFAULT_SETTINGS, onChanged);

    activate(getSettingItem("Loop Style", "Direct"));

    const expected: AppSettings = {
      displayMode: "fit",
      loopStyle: "direct",
    };

    await vi.waitFor(() => {
      expect(mocks.saveSettings).toHaveBeenCalledExactlyOnceWith(expected);
      expect(onChanged).toHaveBeenCalledExactlyOnceWith(expected);
      expect(getSettingItem("Loop Style", "Direct").checked).toBe(true);
      expect(getSettingItem("Loop Style", "Transition").checked).toBe(false);
    });
  });

  test("保存に失敗した場合は通知せず元の選択状態に戻す", async () => {
    const onChanged = vi.fn<(settings: AppSettings) => void>();

    mocks.saveSettings.mockRejectedValueOnce(new Error("アクセス拒否"));

    registerApplicationMenu(DEFAULT_SETTINGS, onChanged);

    activate(getSettingItem("Display Mode", "Scroll"));

    await vi.waitFor(() => {
      expect(mocks.showErrorBox).toHaveBeenCalledWith(
        "RasterTerm",
        expect.stringContaining("アクセス拒否"),
      );
    });

    expect(onChanged).not.toHaveBeenCalled();
    expect(getSettingItem("Display Mode", "Fit").checked).toBe(true);
    expect(getSettingItem("Display Mode", "Scroll").checked).toBe(false);
  });

  test("保存中の設定変更が重複しない", async () => {
    const onChanged = vi.fn<(settings: AppSettings) => void>();

    let resolveSave!: () => void;

    mocks.saveSettings.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    registerApplicationMenu(DEFAULT_SETTINGS, onChanged);

    activate(getSettingItem("Display Mode", "Scroll"));

    // 保存中はメニューが一時的に無効になる。
    expect(getSettingItem("Display Mode", "Fit").enabled).toBe(false);
    expect(getSettingItem("Loop Style", "Direct").enabled).toBe(false);

    // 無効化中の処理を直接呼んでも、二重保存を防止する。
    activate(getSettingItem("Loop Style", "Direct"));

    expect(mocks.saveSettings).toHaveBeenCalledTimes(1);

    resolveSave();

    await vi.waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(getSettingItem("Display Mode", "Scroll").enabled).toBe(true);
      expect(getSettingItem("Loop Style", "Direct").enabled).toBe(true);
    });
  });
});
