import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryIndex, LibraryItem } from "../../shared/library";
import { LIBRARY_VERSION } from "../../shared/library";
import { loadLibraryIndex, saveLibraryIndex } from "./library";

const mocks = vi.hoisted(() => ({
  getLibraryIndexPath: vi.fn<() => string>(),
}));

vi.mock("./paths", () => ({
  getLibraryIndexPath: mocks.getLibraryIndexPath,
}));

const sampleItem: LibraryItem = {
  id: "video-1",
  originalName: "sample.mp4",
  storedName: "video-1.mp4",
  sha256: "a".repeat(64),
  size: 1024,
  addedAt: "2026-10-16T00:00:00.000Z",
};

const createIndex = (items: LibraryItem[] = []): LibraryIndex => ({
  version: LIBRARY_VERSION,
  items,
});

describe("Libraryの登録情報", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    vi.resetAllMocks();

    directory = await mkdtemp(join(tmpdir(), "rasterterm-library-"));
    filePath = join(directory, "library.json");

    mocks.getLibraryIndexPath.mockReturnValue(filePath);
  });

  afterEach(async () => {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  });

  test("登録情報が存在しない場合は空のLibraryを返す", async () => {
    await expect(loadLibraryIndex()).resolves.toStrictEqual(createIndex());

    expect(mocks.getLibraryIndexPath).toHaveBeenCalled();
  });

  test("登録情報を保存して同じ内容を読み込める", async () => {
    const index = createIndex([sampleItem]);

    await saveLibraryIndex(index);

    const content = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(content);

    expect(parsed).toStrictEqual(index);
    await expect(loadLibraryIndex()).resolves.toStrictEqual(index);
  });

  test("保存先のディレクトリが存在しなくても保存できる", async () => {
    filePath = join(directory, "nested", "data", "library.json");
    mocks.getLibraryIndexPath.mockReturnValue(filePath);

    const index = createIndex([sampleItem]);

    await saveLibraryIndex(index);

    await expect(loadLibraryIndex()).resolves.toStrictEqual(index);
  });

  test("壊れたJSONファイルは読み込みを拒否する", async () => {
    await writeFile(filePath, "{ invalid JSON", "utf8");

    await expect(loadLibraryIndex()).rejects.toThrow(SyntaxError);
  });

  test("未対応のデータバージョンは読み込みを拒否する", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        items: [],
      }),
      "utf8",
    );

    await expect(loadLibraryIndex()).rejects.toThrow("Libraryの登録情報が不正です。");
  });

  test("保存ファイル名に不正なパスが含まれる場合は拒否する", async () => {
    const invalidIndex = createIndex([
      {
        ...sampleItem,
        storedName: "../outside.mp4",
      },
    ]);

    await writeFile(filePath, JSON.stringify(invalidIndex), "utf8");

    await expect(loadLibraryIndex()).rejects.toThrow("Libraryの登録情報が不正です。");
  });

  test("同じSHA-256を持つ動画の重複登録を拒否する", async () => {
    const duplicateItem: LibraryItem = {
      ...sampleItem,
      id: "video-2",
      originalName: "copy.mp4",
      storedName: "video-2.mp4",
    };

    const invalidIndex = createIndex([sampleItem, duplicateItem]);

    await expect(saveLibraryIndex(invalidIndex)).rejects.toThrow(
      "保存するLibraryの登録情報が不正です。",
    );
  });
});
