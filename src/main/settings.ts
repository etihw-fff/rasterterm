import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app } from "electron";

import { type AppSettings, DEFAULT_SETTINGS, isFontSize } from "../shared/settings";

const SETTINGS_FILE = "settings.json";

// 設定ファイルの保存先を取得する。
const getSettingsPath = (): string => {
  return join(app.getPath("userData"), SETTINGS_FILE);
};

// 設定データが正しい形式か検証する。
const isAppSettings = (value: unknown): value is AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const settings = value as Record<string, unknown>;

  const validDisplayMode = settings.displayMode === "fit" || settings.displayMode === "scroll";

  const validLoopStyle = settings.loopStyle === "transition" || settings.loopStyle === "direct";

  return validDisplayMode && validLoopStyle && isFontSize(settings.fontSize);
};

// 保存済みの設定を読み込む。
export const loadSettings = async (): Promise<AppSettings> => {
  const filePath = getSettingsPath();

  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    // 初回起動など、設定ファイルが存在しない場合。
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ...DEFAULT_SETTINGS };
    }

    // それ以外の読み込みエラーは呼び出し元へ伝える。
    throw error;
  }

  // JSONを解析する。
  const parsed: unknown = JSON.parse(content);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("設定ファイルの内容が不正です。");
  }

  // Older settings may omit fontSize; previously allowed 22/24/26px values now use 20px.
  const savedSize = "fontSize" in parsed ? parsed.fontSize : undefined;
  const settings: unknown = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    ...(savedSize === 22 || savedSize === 24 || savedSize === 26 ? { fontSize: 20 } : {}),
  };
  if (!isAppSettings(settings)) {
    throw new Error("設定ファイルの内容が不正です。");
  }

  return settings;
};

// 設定をファイルに保存する。
export const saveSettings = async (settings: AppSettings): Promise<void> => {
  if (!isAppSettings(settings)) {
    throw new Error("保存する設定値が不正です。");
  }

  const filePath = getSettingsPath();

  // 保存先のディレクトリが存在しなければ作成する。
  await mkdir(dirname(filePath), { recursive: true });

  // JSON形式で保存する。
  const content = `${JSON.stringify(settings, null, 2)}\n`;

  // Write the new JSON completely before replacing the existing settings.
  const temporaryPath = join(dirname(filePath), `.settings-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};
