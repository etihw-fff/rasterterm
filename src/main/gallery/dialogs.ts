import { basename, resolve } from "node:path";

import { app, type BrowserWindow, dialog } from "electron";

import type { LibraryItem } from "../../shared/library";
import type { LibraryImportResult } from "./import";
import { importLibraryVideos } from "./import";
import type { LibraryDeleteResult } from "./operations";
import { deleteLibraryVideos, listLibraryVideos, resolveLibraryVideo } from "./operations";
import { getLibraryMediaDirectory } from "./paths";

const VIDEO_FILTER = [
  {
    name: "動画ファイル",
    extensions: ["mp4", "mov", "webm"],
  },
];

const PLAYABLE_FILTER = [
  {
    name: "再生可能な動画",
    extensions: ["mp4", "mov", "webm"],
  },
];

const showNotice = async (window: BrowserWindow, message: string): Promise<void> => {
  await dialog.showMessageBox(window, {
    type: "info",
    title: "RasterTerm",
    message,
    buttons: ["OK"],
  });
};

const findRegisteredItem = (
  items: readonly LibraryItem[],
  selectedPath: string,
): LibraryItem | undefined => {
  const mediaDirectory = getLibraryMediaDirectory();
  const normalizedPath = resolve(selectedPath);

  return items.find((item) => resolve(mediaDirectory, item.storedName) === normalizedPath);
};

export const showGalleryAddDialog = async (
  window: BrowserWindow,
): Promise<LibraryImportResult | null> => {
  const selection = await dialog.showOpenDialog({
    title: "ギャラリーに動画を追加",
    buttonLabel: "追加",
    defaultPath: app.getPath("videos"),
    properties: ["openFile", "multiSelections"],
    filters: VIDEO_FILTER,
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const result = await importLibraryVideos(selection.filePaths);

  if (result.failed.length > 0 || result.duplicates.length > 0) {
    const lines: string[] = [];
    if (result.added.length > 0) {
      lines.push(`${String(result.added.length)}件の動画をギャラリーに追加しました。`);
    }
    if (result.duplicates.length === 1 && result.added.length === 0 && result.failed.length === 0) {
      lines.push(`「${basename(result.duplicates[0] ?? "")}」は既にギャラリーに登録されています。`);
    } else if (result.duplicates.length > 0) {
      lines.push("以下の動画は既に登録されているため、重複して追加しませんでした。");
      lines.push(...result.duplicates.map((path) => `・${basename(path)}`));
    }
    if (result.failed.length > 0) {
      lines.push("以下の動画は追加できませんでした。");
      lines.push(
        ...result.failed.map((failure) => `・${basename(failure.filePath)}：${failure.message}`),
      );
    }
    await showNotice(window, lines.join("\n"));
  }

  return result;
};

export const showGallerySelectDialog = async (window: BrowserWindow): Promise<string | null> => {
  const items = await listLibraryVideos();

  if (items.length === 0) {
    await showNotice(window, "ギャラリーに動画がありません。");
    return null;
  }

  const selection = await dialog.showOpenDialog({
    title: "ギャラリーから動画を選択",
    buttonLabel: "再生",
    defaultPath: getLibraryMediaDirectory(),
    properties: ["openFile"],
    filters: PLAYABLE_FILTER,
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const selectedPath = selection.filePaths[0];

  if (selectedPath === undefined) {
    return null;
  }

  const item = findRegisteredItem(items, selectedPath);

  if (item === undefined) {
    throw new Error("Libraryに登録されていない動画は選択できません。");
  }

  if (
    ![".mp4", ".mov", ".webm"].some((extension) =>
      item.storedName.toLowerCase().endsWith(extension),
    )
  ) {
    throw new Error("対応していない動画形式です。");
  }

  await resolveLibraryVideo(item.id);

  return item.id;
};

export const showGalleryDeleteDialog = async (
  window: BrowserWindow,
): Promise<LibraryDeleteResult | null> => {
  const items = await listLibraryVideos();

  if (items.length === 0) {
    await showNotice(window, "ギャラリーに動画がありません。");
    return null;
  }

  const selection = await dialog.showOpenDialog({
    title: "ギャラリーから動画を削除",
    buttonLabel: "ゴミ箱に移動",
    defaultPath: getLibraryMediaDirectory(),
    properties: ["openFile", "multiSelections"],
    filters: VIDEO_FILTER,
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const ids = selection.filePaths.map((filePath) => {
    const item = findRegisteredItem(items, filePath);

    if (item === undefined) {
      throw new Error("Libraryに登録されていないファイルは削除できません。");
    }

    return item.id;
  });

  const result = await deleteLibraryVideos(ids);

  if (result.failed.length > 0) {
    const itemNames = new Map(items.map((item) => [item.id, item.originalName]));
    const lines = ["一部の動画をゴミ箱へ移動できませんでした。"];
    if (result.deleted.length > 0) {
      lines.push(`${String(result.deleted.length)}件の動画はゴミ箱へ移動しました。`);
    }
    lines.push(
      ...result.failed.map(
        (failure) => `・${itemNames.get(failure.id) ?? "動画"}：${failure.message}`,
      ),
    );
    await showNotice(window, lines.join("\n"));
  }

  return result;
};
