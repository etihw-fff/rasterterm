import { type BrowserWindow } from "electron";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryItem } from "../../shared/library";
import { showGalleryAddDialog, showGalleryDeleteDialog, showGallerySelectDialog } from "./dialogs";
import type { LibraryImportResult } from "./import";
import type { LibraryDeleteResult, ResolvedLibraryVideo } from "./operations";

type OpenDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

const mocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn<(...args: unknown[]) => Promise<OpenDialogResult>>(),
  showMessageBox: vi.fn<(...args: unknown[]) => Promise<void>>(),
  getPath: vi.fn<(name: string) => string>(),
  getLibraryMediaDirectory: vi.fn<() => string>(),
  importLibraryVideos: vi.fn<(paths: readonly string[]) => Promise<LibraryImportResult>>(),
  listLibraryVideos: vi.fn<() => Promise<LibraryItem[]>>(),
  resolveLibraryVideo: vi.fn<(id: string) => Promise<ResolvedLibraryVideo>>(),
  deleteLibraryVideos: vi.fn<(ids: readonly string[]) => Promise<LibraryDeleteResult>>(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: mocks.getPath,
  },
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
    showMessageBox: mocks.showMessageBox,
  },
}));

vi.mock("./paths", () => ({
  getLibraryMediaDirectory: mocks.getLibraryMediaDirectory,
}));

vi.mock("./import", () => ({
  importLibraryVideos: mocks.importLibraryVideos,
}));

vi.mock("./operations", () => ({
  listLibraryVideos: mocks.listLibraryVideos,
  resolveLibraryVideo: mocks.resolveLibraryVideo,
  deleteLibraryVideos: mocks.deleteLibraryVideos,
}));

const mediaDirectory = "/temporary/RasterTerm/Library/media";
const window = {} as BrowserWindow;

const firstItem: LibraryItem = {
  id: "video-1",
  originalName: "first.mp4",
  storedName: "video-1.mp4",
  sha256: "a".repeat(64),
  size: 100,
  addedAt: "2026-10-16T00:00:00.000Z",
};

const secondItem: LibraryItem = {
  id: "video-2",
  originalName: "second.webm",
  storedName: "video-2.webm",
  sha256: "b".repeat(64),
  size: 200,
  addedAt: "2026-10-16T00:00:00.000Z",
};

const imported: LibraryImportResult = {
  added: [firstItem],
  duplicates: [],
  reused: [],
  failed: [],
};

describe("ギャラリーのOS標準ダイアログ", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.getPath.mockReturnValue("/temporary");
    mocks.getLibraryMediaDirectory.mockReturnValue(mediaDirectory);

    mocks.showMessageBox.mockResolvedValue(undefined);
    mocks.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    mocks.importLibraryVideos.mockResolvedValue(imported);
    mocks.listLibraryVideos.mockResolvedValue([firstItem, secondItem]);

    mocks.resolveLibraryVideo.mockImplementation((id) => {
      const item = [firstItem, secondItem].find((entry) => entry.id === id);

      if (item === undefined) {
        return Promise.reject(new Error("動画が存在しません。"));
      }

      return Promise.resolve({
        item,
        filePath: `${mediaDirectory}/${item.storedName}`,
      });
    });

    mocks.deleteLibraryVideos.mockResolvedValue({
      deleted: [firstItem],
      failed: [],
    });
  });

  test("追加ダイアログをキャンセルすると取り込みを行わない", async () => {
    await expect(showGalleryAddDialog(window)).resolves.toBeNull();

    expect(mocks.importLibraryVideos).not.toHaveBeenCalled();

    expect(mocks.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ギャラリーに動画を追加",
        properties: ["openFile", "multiSelections"],
      }),
    );
  });

  test("複数の動画を選んでLibraryへ取り込める", async () => {
    const paths = ["/temporary/first.mp4", "/temporary/second.mov"];

    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: paths,
    });

    await expect(showGalleryAddDialog(window)).resolves.toStrictEqual(imported);

    expect(mocks.importLibraryVideos).toHaveBeenCalledExactlyOnceWith(paths);

    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });

  test("重複や失敗がある場合は件数と理由を通知する", async () => {
    const result: LibraryImportResult = {
      added: [firstItem],
      duplicates: ["/temporary/duplicate.mp4"],
      reused: [secondItem],
      failed: [
        {
          filePath: "/temporary/broken.mov",
          message: "読み込み失敗",
        },
      ],
    };

    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/temporary/first.mp4"],
    });

    mocks.importLibraryVideos.mockResolvedValueOnce(result);

    await showGalleryAddDialog(window);

    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);

    const message = mocks.showMessageBox.mock.lastCall?.[1];

    expect(message).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("1件の動画をギャラリーに追加しました。") as string,
      }),
    );

    expect(message).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("broken.mov：読み込み失敗") as string,
      }),
    );
  });

  test("重複のみの場合はファイル名を含む自然な日本語で通知する", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/temporary/first.mp4"],
    });
    mocks.importLibraryVideos.mockResolvedValueOnce({
      added: [],
      duplicates: ["/temporary/first.mp4"],
      reused: [firstItem],
      failed: [],
    });

    await showGalleryAddDialog(window);
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        message: "「first.mp4」は既にギャラリーに登録されています。",
      }),
    );
  });

  test("Libraryが空の場合は選択ダイアログを開かない", async () => {
    mocks.listLibraryVideos.mockResolvedValueOnce([]);

    await expect(showGallerySelectDialog(window)).resolves.toBeNull();

    expect(mocks.showOpenDialog).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
  });

  test("登録済み動画を選択すると登録IDを返す", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [`${mediaDirectory}/video-2.webm`],
    });

    await expect(showGallerySelectDialog(window)).resolves.toBe("video-2");

    expect(mocks.resolveLibraryVideo).toHaveBeenCalledExactlyOnceWith("video-2");
  });

  test("Library外の動画は選択できない", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/temporary/other.mp4"],
    });

    await expect(showGallerySelectDialog(window)).rejects.toThrow(
      "Libraryに登録されていない動画は選択できません。",
    );
  });

  test("対応外の旧Library項目は再生させない", async () => {
    mocks.listLibraryVideos.mockResolvedValueOnce([
      {
        ...firstItem,
        storedName: "video-1.gif",
      },
    ]);

    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [`${mediaDirectory}/video-1.gif`],
    });

    await expect(showGallerySelectDialog(window)).rejects.toThrow("対応していない動画形式です。");
  });

  test("削除ダイアログで複数の登録動画を指定できる", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [`${mediaDirectory}/video-1.mp4`, `${mediaDirectory}/video-2.webm`],
    });

    const result = await showGalleryDeleteDialog(window);

    expect(result?.deleted).toStrictEqual([firstItem]);

    expect(mocks.deleteLibraryVideos).toHaveBeenCalledExactlyOnceWith(["video-1", "video-2"]);
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ buttonLabel: "ゴミ箱に移動" }),
    );
  });

  test("削除をキャンセルするとLibraryは変更されない", async () => {
    await expect(showGalleryDeleteDialog(window)).resolves.toBeNull();

    expect(mocks.deleteLibraryVideos).not.toHaveBeenCalled();
  });

  test("登録されていないファイルは削除できない", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/temporary/other.mp4"],
    });

    await expect(showGalleryDeleteDialog(window)).rejects.toThrow(
      "Libraryに登録されていないファイルは削除できません。",
    );

    expect(mocks.deleteLibraryVideos).not.toHaveBeenCalled();
  });

  test("削除が一部失敗した場合はエラー理由を通知する", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [`${mediaDirectory}/video-1.mp4`],
    });

    mocks.deleteLibraryVideos.mockResolvedValueOnce({
      deleted: [],
      failed: [
        {
          id: "video-1",
          message: "ゴミ箱への移動に失敗",
        },
      ],
    });

    await showGalleryDeleteDialog(window);

    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        message: expect.stringContaining("ゴミ箱への移動に失敗") as string,
      }),
    );
  });
});
