import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, link, lstat, mkdir, rm, stat, unlink } from "node:fs/promises";
import { basename, extname, join, parse } from "node:path";
import { pipeline } from "node:stream/promises";

import type { LibraryIndex, LibraryItem } from "../../shared/library";
import { LIBRARY_VERSION } from "../../shared/library";
import { loadLibraryIndex, saveLibraryIndex } from "./library";
import { getLibraryMediaDirectory } from "./paths";
import { runGalleryOperation } from "./queue";

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

export type LibraryImportFailure = {
  filePath: string;
  message: string;
};

export type LibraryImportResult = {
  added: LibraryItem[];
  duplicates: string[];
  reused: LibraryItem[];
  failed: LibraryImportFailure[];
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const isFileExistsError = (error: unknown): boolean => {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
};

// 追加後も元の名前で表示できるようにする。同名異内容では連番を付ける。
const friendlyName = (originalName: string, number: number): string => {
  const { name, ext } = parse(originalName);
  const sanitizedName = Array.from(name, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "_" : character;
  }).join("");
  const base = sanitizedName.replace(/[<>:"/\\|?*]/g, "_").replace(/[. ]+$/g, "") || "video";
  const safeBase = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? `_${base}` : base;
  return `${safeBase}${number === 1 ? "" : ` (${String(number)})`}${ext}`;
};

// linkは上書きしないため、ファイル名が他ファイルと衝突しても安全。
const reserveFriendlyName = async (
  originalPath: string,
  originalName: string,
  mediaDirectory: string,
  reservedNames: readonly string[],
): Promise<{ name: string; path: string }> => {
  for (let number = 1; number <= 10000; number += 1) {
    const name = friendlyName(originalName, number);
    if (reservedNames.some((item) => item.toLowerCase() === name.toLowerCase())) {
      continue;
    }

    const destination = join(mediaDirectory, name);
    try {
      await link(originalPath, destination);
      return { name, path: destination };
    } catch (error: unknown) {
      if (isFileExistsError(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("保存可能なファイル名を確保できませんでした。");
};

// 以前にUUID名で登録した動画は、既存データを失わず1件ずつ名前を移行する。
export const migrateLibraryFileNames = (): Promise<void> =>
  runGalleryOperation(async () => {
    let index = await loadLibraryIndex();
    const mediaDirectory = getLibraryMediaDirectory();

    for (const item of [...index.items]) {
      if (!SUPPORTED_EXTENSIONS.has(extname(item.storedName).toLowerCase())) {
        continue;
      }
      if (item.storedName !== `${item.id}${extname(item.storedName)}`) {
        continue;
      }

      const oldPath = join(mediaDirectory, item.storedName);
      try {
        const info = await lstat(oldPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size !== item.size) {
          throw new Error("登録済み動画の形式またはサイズが一致しません。");
        }

        const reserved = index.items
          .filter((entry) => entry.id !== item.id)
          .map((entry) => entry.storedName);
        const target = await reserveFriendlyName(
          oldPath,
          item.originalName,
          mediaDirectory,
          reserved,
        );
        const updated = {
          ...index,
          items: index.items.map((entry) =>
            entry.id === item.id ? { ...entry, storedName: target.name } : entry,
          ),
        };

        try {
          await saveLibraryIndex(updated);
        } catch (error: unknown) {
          await rm(target.path, { force: true });
          throw error;
        }

        index = updated;
        // Save before removing the old path; no registered video is discarded.
        try {
          await unlink(oldPath);
        } catch (error: unknown) {
          console.warn("古いLibraryファイル名の後片付けに失敗しました:", getErrorMessage(error));
        }
      } catch (error: unknown) {
        // An unreadable/modified item must not prevent the other videos or app from loading.
        console.warn(
          "動画名の移行をスキップしました。登録情報は保持します:",
          item.storedName,
          getErrorMessage(error),
        );
      }
    }
  });

// 大きな動画も全体をメモリへ読み込まずにハッシュを計算する。
const calculateSha256 = async (filePath: string): Promise<string> => {
  const hash = createHash("sha256");

  await pipeline(createReadStream(filePath), hash);

  return hash.digest("hex");
};

// 直列化キューの内部で実行する取り込み処理。
const importLibraryVideosUnqueued = async (
  filePaths: readonly string[],
): Promise<LibraryImportResult> => {
  let index = await loadLibraryIndex();

  const result: LibraryImportResult = {
    added: [],
    duplicates: [],
    reused: [],
    failed: [],
  };

  const mediaDirectory = getLibraryMediaDirectory();

  for (const sourcePath of filePaths) {
    let destinationPath: string | null = null;
    let displayPath: string | null = null;
    let cleanupDestination = false;
    let cleanupDisplay = false;

    try {
      const extension = extname(sourcePath).toLowerCase();

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error("対応していない動画形式です。");
      }

      const sourceInfo = await stat(sourcePath);

      if (!sourceInfo.isFile()) {
        throw new Error("通常のファイルではありません。");
      }

      if (sourceInfo.size === 0) {
        throw new Error("0バイトのファイルは登録できません。");
      }

      await mkdir(mediaDirectory, { recursive: true });

      const id = randomUUID();
      const originalName = basename(sourcePath);
      const temporaryName = `.import-${id}${extension}`;

      destinationPath = join(mediaDirectory, temporaryName);
      cleanupDestination = true;

      // コピー先が存在していても上書きしない。
      try {
        await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
      } catch (error: unknown) {
        if (isFileExistsError(error)) {
          cleanupDestination = false;
        }

        throw error;
      }

      const copiedInfo = await stat(destinationPath);

      if (!copiedInfo.isFile() || !Number.isSafeInteger(copiedInfo.size) || copiedInfo.size <= 0) {
        throw new Error("コピーした動画ファイルが不正です。");
      }

      // 保存先にコピーされたファイルからSHA-256を計算する。
      const sha256 = await calculateSha256(destinationPath);

      const alreadyRegistered = index.items.find((item) => item.sha256 === sha256);

      if (alreadyRegistered !== undefined) {
        const registeredPath = join(mediaDirectory, alreadyRegistered.storedName);
        try {
          const registeredFile = await lstat(registeredPath);
          if (
            !registeredFile.isFile() ||
            registeredFile.isSymbolicLink() ||
            registeredFile.size !== alreadyRegistered.size
          ) {
            throw new Error("登録済み動画のファイルが変更されています。");
          }
        } catch (error: unknown) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            // Recover a missing Library copy from the same video without changing its ID.
            await link(destinationPath, registeredPath);
          } else {
            throw error;
          }
        }

        await rm(destinationPath, { force: true });
        cleanupDestination = false;

        result.duplicates.push(sourcePath);
        result.reused.push({ ...alreadyRegistered });
        continue;
      }

      const reserved = index.items.map((entry) => entry.storedName);
      const target = await reserveFriendlyName(
        destinationPath,
        originalName,
        mediaDirectory,
        reserved,
      );
      displayPath = target.path;
      cleanupDisplay = true;

      const item: LibraryItem = {
        id,
        originalName,
        storedName: target.name,
        sha256,
        size: copiedInfo.size,
        addedAt: new Date().toISOString(),
      };

      const nextIndex: LibraryIndex = {
        version: LIBRARY_VERSION,
        items: [...index.items, item],
      };

      // 保存に成功したものだけを登録完了とする。
      await saveLibraryIndex(nextIndex);

      index = nextIndex;
      cleanupDisplay = false;
      cleanupDestination = false;
      try {
        await rm(destinationPath, { force: true });
      } catch (error: unknown) {
        console.warn("取り込み一時ファイルの削除に失敗しました:", getErrorMessage(error));
      }

      result.added.push(item);
    } catch (error: unknown) {
      let message = getErrorMessage(error);

      if (cleanupDisplay && displayPath !== null) {
        try {
          await rm(displayPath, { force: true });
        } catch (cleanupError: unknown) {
          message += ` / 登録先ファイルの後片付けに失敗: ${getErrorMessage(cleanupError)}`;
        }
      }

      if (cleanupDestination && destinationPath !== null) {
        try {
          await rm(destinationPath, { force: true });
        } catch (cleanupError: unknown) {
          message += ` / コピーの後片付けにも失敗しました: ${getErrorMessage(cleanupError)}`;
        }
      }

      result.failed.push({
        filePath: sourcePath,
        message,
      });
    }
  }

  return result;
};

// 公開API。複数の呼び出しを必ず順番に処理する。
export const importLibraryVideos = (filePaths: readonly string[]): Promise<LibraryImportResult> => {
  const selectedPaths = [...filePaths];

  return runGalleryOperation(() => importLibraryVideosUnqueued(selectedPaths));
};
