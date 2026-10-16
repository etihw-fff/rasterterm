import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import type { LibraryIndex, LibraryItem } from "../../shared/library";
import { LIBRARY_VERSION } from "../../shared/library";
import { getLibraryIndexPath } from "./paths";

const SUPPORTED_STORED_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".gif"]);
const isSafeStoredName = (name: string): boolean =>
  name !== "." &&
  name !== ".." &&
  basename(name) === name &&
  !/[<>:"/\\|?*]/.test(name) &&
  !name.split("").some((character) => character.charCodeAt(0) < 32) &&
  !/[. ]$/.test(name) &&
  !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
  SUPPORTED_STORED_EXTENSIONS.has(extname(name).toLowerCase());
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// unknown型の値が通常のオブジェクトか確認する。
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

// 登録動画1件分のデータを検証する。
const isLibraryItem = (value: unknown): value is LibraryItem => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.originalName === "string" &&
    value.originalName.length > 0 &&
    typeof value.storedName === "string" &&
    isSafeStoredName(value.storedName) &&
    typeof value.sha256 === "string" &&
    SHA256_PATTERN.test(value.sha256) &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    typeof value.addedAt === "string" &&
    !Number.isNaN(Date.parse(value.addedAt))
  );
};

// Library全体の構造と重複を検証する。
const isLibraryIndex = (value: unknown): value is LibraryIndex => {
  if (!isRecord(value) || value.version !== LIBRARY_VERSION || !Array.isArray(value.items)) {
    return false;
  }

  const items: unknown[] = value.items;

  if (!items.every(isLibraryItem)) {
    return false;
  }

  const ids = new Set(items.map((item) => item.id));
  const storedNames = new Set(items.map((item) => item.storedName));
  const hashes = new Set(items.map((item) => item.sha256));

  return (
    ids.size === items.length && storedNames.size === items.length && hashes.size === items.length
  );
};

// 保存済みのLibrary登録情報を取得する。
export const loadLibraryIndex = async (): Promise<LibraryIndex> => {
  const filePath = getLibraryIndexPath();

  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        version: LIBRARY_VERSION,
        items: [],
      };
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(content);

  if (!isLibraryIndex(parsed)) {
    throw new Error("Libraryの登録情報が不正です。");
  }

  return parsed;
};

// Library登録情報をJSONファイルに保存する。
export const saveLibraryIndex = async (index: LibraryIndex): Promise<void> => {
  if (!isLibraryIndex(index)) {
    throw new Error("保存するLibraryの登録情報が不正です。");
  }

  const filePath = getLibraryIndexPath();
  const directory = dirname(filePath);

  await mkdir(directory, { recursive: true });

  const temporaryPath = join(directory, `.library-${randomUUID()}.tmp`);
  const content = `${JSON.stringify(index, null, 2)}\n`;

  try {
    // 元ファイルを直接書き換えず、一時ファイルへ書き込む。
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
    });

    // 書き込みが完了してから、保存先のファイルを置き換える。
    await rename(temporaryPath, filePath);
  } finally {
    // 書き込みや置き換えに失敗した場合の一時ファイルも削除する。
    await rm(temporaryPath, { force: true });
  }
};
