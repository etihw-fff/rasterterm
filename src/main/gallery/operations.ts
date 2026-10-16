import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rmdir } from "node:fs/promises";
import { join } from "node:path";

import { shell } from "electron";

import type { LibraryIndex, LibraryItem } from "../../shared/library";
import { loadLibraryIndex, saveLibraryIndex } from "./library";
import { getLibraryMediaDirectory } from "./paths";
import { runGalleryOperation } from "./queue";

export type ResolvedLibraryVideo = {
  item: LibraryItem;
  filePath: string;
};

export type LibraryDeleteFailure = {
  id: string;
  message: string;
};

export type LibraryDeleteResult = {
  deleted: LibraryItem[];
  failed: LibraryDeleteFailure[];
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

// 現在登録されている動画を一覧で返す。
export const listLibraryVideos = (): Promise<LibraryItem[]> => {
  return runGalleryOperation(async () => {
    const index = await loadLibraryIndex();

    return index.items.map((item) => ({ ...item }));
  });
};

// 指定された登録IDから、安全に再生用ファイルパスを取得する。
export const resolveLibraryVideo = (id: string): Promise<ResolvedLibraryVideo> => {
  return runGalleryOperation(async () => {
    const index = await loadLibraryIndex();
    const item = index.items.find((entry) => entry.id === id);

    if (item === undefined) {
      throw new Error("指定された動画はLibraryに登録されていません。");
    }

    // storedNameはlibrary.tsで検証済みのファイル名。
    const filePath = join(getLibraryMediaDirectory(), item.storedName);
    const info = await lstat(filePath);

    if (!info.isFile() || info.isSymbolicLink() || info.size !== item.size) {
      throw new Error("登録されている動画ファイルが不正です。");
    }

    return {
      item: { ...item },
      filePath,
    };
  });
};

// 登録IDを指定して、動画をOSのゴミ箱へ移動する。
export const deleteLibraryVideos = (ids: readonly string[]): Promise<LibraryDeleteResult> => {
  // 同じIDが繰り返し指定されても1回だけ処理する。
  const uniqueIds = [...new Set(ids)];

  return runGalleryOperation(async () => {
    let currentIndex = await loadLibraryIndex();

    const result: LibraryDeleteResult = {
      deleted: [],
      failed: [],
    };

    const mediaDirectory = getLibraryMediaDirectory();

    for (const id of uniqueIds) {
      const item = currentIndex.items.find((entry) => entry.id === id);

      if (item === undefined) {
        result.failed.push({
          id,
          message: "指定された動画はLibraryに登録されていません。",
        });

        continue;
      }

      const originalPath = join(mediaDirectory, item.storedName);

      // 同じ名前の動画をゴミ箱へ移せるよう、退避先は専用フォルダとする。
      // 一時フォルダ名にUUIDを使い、動画そのもののファイル名は変更しない。
      const stagedDirectory = join(mediaDirectory, `.pending-delete-${randomUUID()}`);
      const stagedPath = join(stagedDirectory, item.storedName);

      const nextIndex: LibraryIndex = {
        ...currentIndex,
        items: currentIndex.items.filter((entry) => entry.id !== id),
      };

      let staged = false;
      let indexSaved = false;
      let stagingDirectoryCreated = false;

      try {
        await mkdir(stagedDirectory);
        stagingDirectoryCreated = true;

        // 元ファイルを一時的に退避する。元の名前は維持する。
        await rename(originalPath, stagedPath);
        staged = true;

        // 登録情報から対象動画を除く。
        await saveLibraryIndex(nextIndex);
        indexSaved = true;

        // 完全削除ではなくOS標準のゴミ箱へ移動する。
        await shell.trashItem(stagedPath);
        staged = false;

        currentIndex = nextIndex;
        result.deleted.push({ ...item });
      } catch (error: unknown) {
        let message = getErrorMessage(error);
        let fileRestored = !staged;

        // ゴミ箱への移動や保存に失敗した場合はファイルを戻す。
        if (staged) {
          try {
            await rename(stagedPath, originalPath);
            fileRestored = true;
          } catch (restoreError: unknown) {
            fileRestored = false;
            message += ` / ファイルの復元に失敗: ${getErrorMessage(restoreError)}`;
            message += ` / 退避先: ${stagedPath}`;
          }
        }

        // JSONの保存後に失敗した場合は、登録情報も戻す。
        if (indexSaved) {
          if (fileRestored) {
            try {
              await saveLibraryIndex(currentIndex);
            } catch (restoreError: unknown) {
              message += ` / 登録情報の復元に失敗: ${getErrorMessage(restoreError)}`;
              currentIndex = nextIndex;
            }
          } else {
            // ファイルを戻せないときは、削除後の登録状態を維持する。
            currentIndex = nextIndex;
          }
        }

        result.failed.push({
          id,
          message,
        });
      } finally {
        if (stagingDirectoryCreated) {
          try {
            // 空の専用フォルダのみ除去。復元に失敗した動画は削除しない。
            await rmdir(stagedDirectory);
          } catch (error: unknown) {
            console.warn("ゴミ箱移動用フォルダの後片付けに失敗しました:", getErrorMessage(error));
          }
        }
      }
    }

    return result;
  });
};
