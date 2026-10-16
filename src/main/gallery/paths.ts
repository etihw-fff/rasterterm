import { join } from "node:path";

import { app } from "electron";

// Libraryに保存する動画ファイルのディレクトリ。
export const getLibraryMediaDirectory = (): string => {
  return join(app.getPath("videos"), "RasterTerm", "Library", "media");
};

// 動画の登録情報を保存するJSONファイル。
export const getLibraryIndexPath = (): string => {
  return join(app.getPath("userData"), "library.json");
};
