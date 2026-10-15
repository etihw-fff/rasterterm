import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type AppSettings, DEFAULT_SETTINGS } from "../shared/settings";
import { loadSettings, saveSettings } from "./settings";

// Electronのapp.getPathを模倣する関数。
const mocks = vi.hoisted(() => ({
  getPath: vi.fn<(name: string) => string>(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: mocks.getPath,
  },
}));

describe("アプリ設定の保存と読み込み", () => {
  let directory: string;

  beforeEach(async () => {
    vi.resetAllMocks();

    // テストごとに独立した一時ディレクトリを用意する。
    directory = await mkdtemp(join(tmpdir(), "rasterterm-settings-"));

    mocks.getPath.mockReturnValue(directory);
  });

  afterEach(async () => {
    // テスト用のファイルとディレクトリを削除する。
    await rm(directory, { recursive: true, force: true });
  });

  test("設定ファイルが存在しなければ初期値を返す", async () => {
    const settings = await loadSettings();

    expect(settings).toStrictEqual(DEFAULT_SETTINGS);
    expect(mocks.getPath).toHaveBeenCalledWith("userData");
  });

  test("設定をJSONに保存し、同じ内容を読み込める", async () => {
    const settings: AppSettings = {
      displayMode: "scroll",
      loopStyle: "direct",
    };

    await saveSettings(settings);

    const content = await readFile(join(directory, "settings.json"), "utf8");
    const parsed: unknown = JSON.parse(content);

    expect(parsed).toStrictEqual(settings);
    await expect(loadSettings()).resolves.toStrictEqual(settings);
  });

  test("保存先ディレクトリが存在しなくても作成して保存する", async () => {
    const nestedDirectory = join(directory, "nested", "data");

    mocks.getPath.mockReturnValue(nestedDirectory);

    await saveSettings(DEFAULT_SETTINGS);

    await expect(loadSettings()).resolves.toStrictEqual(DEFAULT_SETTINGS);
  });

  test("設定ファイルのJSONが壊れている場合はエラーになる", async () => {
    await writeFile(join(directory, "settings.json"), "{ invalid JSON", "utf8");

    await expect(loadSettings()).rejects.toThrow(SyntaxError);
  });

  test("設定ファイルに不正な設定値がある場合はエラーになる", async () => {
    const invalidSettings = {
      displayMode: "unknown",
      loopStyle: "direct",
    };

    await writeFile(join(directory, "settings.json"), JSON.stringify(invalidSettings), "utf8");

    await expect(loadSettings()).rejects.toThrow("設定ファイルの内容が不正です。");
  });

  test("不正な設定値を保存しようとすると拒否する", async () => {
    const invalidSettings = {
      displayMode: "fit",
      loopStyle: "unknown",
    } as unknown as AppSettings;

    await expect(saveSettings(invalidSettings)).rejects.toThrow("保存する設定値が不正です。");
  });
});
