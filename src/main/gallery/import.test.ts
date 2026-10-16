import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LIBRARY_VERSION } from "../../shared/library";
import { importLibraryVideos, migrateLibraryFileNames } from "./import";
import { loadLibraryIndex, saveLibraryIndex } from "./library";

const mocks = vi.hoisted(() => ({
  getLibraryIndexPath: vi.fn<() => string>(),
  getLibraryMediaDirectory: vi.fn<() => string>(),
}));

vi.mock("./paths", () => ({
  getLibraryIndexPath: mocks.getLibraryIndexPath,
  getLibraryMediaDirectory: mocks.getLibraryMediaDirectory,
}));

describe("動画のLibraryへの取り込み", () => {
  let directory: string;
  let indexPath: string;
  let mediaDirectory: string;

  const createSource = async (folder: string, name: string, content: string): Promise<string> => {
    const sourceDirectory = join(directory, folder);

    await mkdir(sourceDirectory, { recursive: true });

    const filePath = join(sourceDirectory, name);

    await writeFile(filePath, content);

    return filePath;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    directory = await mkdtemp(join(tmpdir(), "rasterterm-import-"));
    indexPath = join(directory, "data", "library.json");
    mediaDirectory = join(directory, "videos");

    mocks.getLibraryIndexPath.mockReturnValue(indexPath);
    mocks.getLibraryMediaDirectory.mockReturnValue(mediaDirectory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("動画をコピーし、SHA-256と登録情報を保存する", async () => {
    const source = await createSource("source", "sample.mp4", "video-content");

    const result = await importLibraryVideos([source]);

    expect(result.failed).toStrictEqual([]);
    expect(result.duplicates).toStrictEqual([]);
    expect(result.added).toHaveLength(1);

    const item = result.added[0];

    if (item === undefined) {
      throw new Error("登録された動画がありません。");
    }

    const expectedHash = createHash("sha256").update("video-content").digest("hex");

    expect(item.originalName).toBe("sample.mp4");
    expect(item.sha256).toBe(expectedHash);
    expect(item.size).toBe(13);
    expect(item.storedName).toBe("sample.mp4");

    const copiedContent = await readFile(join(mediaDirectory, item.storedName), "utf8");

    expect(copiedContent).toBe("video-content");

    await expect(loadLibraryIndex()).resolves.toStrictEqual({
      version: LIBRARY_VERSION,
      items: [item],
    });
  });

  test("日本語と空白を含む元ファイル名をそのまま保存する", async () => {
    const source = await createSource("source", "花と空 01.webm", "video-content");
    const result = await importLibraryVideos([source]);
    expect(result.failed).toStrictEqual([]);
    expect(result.added[0]?.storedName).toBe("花と空 01.webm");
    expect((await loadLibraryIndex()).items[0]?.originalName).toBe("花と空 01.webm");
  });

  test("既存UUID名の動画を元の名前へ安全に移行する", async () => {
    const source = await createSource("source", "旧動画.mp4", "old-content");
    const previous = await importLibraryVideos([source]);
    const item = previous.added[0];
    if (item === undefined) {
      throw new Error("テスト用動画の登録に失敗しました");
    }

    // 旧バージョンが使用していたUUID名の保存状態を再現する。
    const legacyName = `${item.id}.mp4`;
    await rename(join(mediaDirectory, item.storedName), join(mediaDirectory, legacyName));
    await saveLibraryIndex({
      version: LIBRARY_VERSION,
      items: [{ ...item, storedName: legacyName }],
    });

    await migrateLibraryFileNames();
    const index = await loadLibraryIndex();
    expect(index.items[0]?.storedName).toBe("旧動画.mp4");
    expect(await readFile(join(mediaDirectory, "旧動画.mp4"), "utf8")).toBe("old-content");
    expect(await readdir(mediaDirectory)).toStrictEqual(["旧動画.mp4"]);
  });

  test("移行対象が見つからなくても登録情報を維持し、残りの動画を移行する", async () => {
    const missingSource = await createSource("source", "missing.mp4", "missing-content");
    const validSource = await createSource("source", "present.mp4", "present-content");
    const imported = await importLibraryVideos([missingSource, validSource]);
    const missing = imported.added[0];
    const present = imported.added[1];
    if (missing === undefined || present === undefined) {
      throw new Error("テスト用動画の登録に失敗しました。");
    }
    const missingLegacy = `${missing.id}.mp4`;
    const presentLegacy = `${present.id}.mp4`;
    await rename(join(mediaDirectory, missing.storedName), join(mediaDirectory, missingLegacy));
    await rename(join(mediaDirectory, present.storedName), join(mediaDirectory, presentLegacy));
    await saveLibraryIndex({
      version: LIBRARY_VERSION,
      items: [
        { ...missing, storedName: missingLegacy },
        { ...present, storedName: presentLegacy },
      ],
    });
    await rm(join(mediaDirectory, missingLegacy));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(migrateLibraryFileNames()).resolves.toBeUndefined();
    } finally {
      warning.mockRestore();
    }
    const items = (await loadLibraryIndex()).items;
    expect(items[0]?.storedName).toBe(missingLegacy);
    expect(items[1]?.storedName).toBe("present.mp4");
    expect(await readdir(mediaDirectory)).toStrictEqual(["present.mp4"]);
  });

  test.skipIf(process.platform === "win32")(
    "制御文字を含む名前もLibraryに安全な名前で保存する",
    async () => {
      const source = await createSource("source", "line\nbreak.mp4", "video-content");
      const result = await importLibraryVideos([source]);
      expect(result.failed).toStrictEqual([]);
      expect(result.added[0]?.originalName).toBe("line\nbreak.mp4");
      expect(result.added[0]?.storedName).toBe("line_break.mp4");
    },
  );

  test("登録済みの動画ファイルが欠損していたら、重複追加時に復元する", async () => {
    const first = await createSource("first", "sample.mp4", "same-video");
    const second = await createSource("second", "sample.mp4", "same-video");
    const initial = await importLibraryVideos([first]);
    const item = initial.added[0];
    if (item === undefined) {
      throw new Error("初期登録に失敗しました。");
    }

    await rm(join(mediaDirectory, item.storedName));
    const result = await importLibraryVideos([second]);

    expect(result.failed).toStrictEqual([]);
    expect(result.duplicates).toStrictEqual([second]);
    expect(result.reused[0]?.id).toBe(item.id);
    expect((await loadLibraryIndex()).items).toStrictEqual([item]);
    expect(await readFile(join(mediaDirectory, item.storedName), "utf8")).toBe("same-video");
  });

  test("移行元のサイズが不一致でも他の動画の移行は継続する", async () => {
    const first = await createSource("source", "corrupt.mp4", "first-video");
    const second = await createSource("source", "valid.mp4", "second-video");
    const result = await importLibraryVideos([first, second]);
    const [corrupt, valid] = result.added;
    if (corrupt === undefined || valid === undefined) {
      throw new Error("テスト動画の初期登録に失敗しました。");
    }

    const badName = `${corrupt.id}.mp4`;
    const goodName = `${valid.id}.mp4`;
    await rename(join(mediaDirectory, corrupt.storedName), join(mediaDirectory, badName));
    await rename(join(mediaDirectory, valid.storedName), join(mediaDirectory, goodName));
    await writeFile(join(mediaDirectory, badName), "wrong-size");
    await saveLibraryIndex({
      version: LIBRARY_VERSION,
      items: [
        { ...corrupt, storedName: badName },
        { ...valid, storedName: goodName },
      ],
    });

    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(migrateLibraryFileNames()).resolves.toBeUndefined();
    } finally {
      warning.mockRestore();
    }
    const items = (await loadLibraryIndex()).items;
    expect(items[0]?.storedName).toBe(badName);
    expect(items[1]?.storedName).toBe("valid.mp4");
    expect(await readFile(join(mediaDirectory, badName), "utf8")).toBe("wrong-size");
  });

  test("同じ内容の動画を一度に追加しても1件だけ登録する", async () => {
    const first = await createSource("first", "a.mp4", "same-video");
    const second = await createSource("second", "b.mov", "same-video");

    const result = await importLibraryVideos([first, second]);

    expect(result.added).toHaveLength(1);
    expect(result.duplicates).toStrictEqual([second]);
    expect(result.reused).toHaveLength(1);
    expect(result.reused[0]?.id).toBe(result.added[0]?.id);
    expect(result.failed).toStrictEqual([]);

    expect(await readdir(mediaDirectory)).toHaveLength(1);
    expect((await loadLibraryIndex()).items).toHaveLength(1);
  });

  test("別々の取り込み操作でも同じ内容なら重複登録しない", async () => {
    const first = await createSource("first", "a.mp4", "same-video");
    const second = await createSource("second", "b.webm", "same-video");

    const initial = await importLibraryVideos([first]);
    const next = await importLibraryVideos([second]);

    expect(initial.added).toHaveLength(1);
    expect(next.added).toStrictEqual([]);
    expect(next.duplicates).toStrictEqual([second]);
    expect(next.reused).toStrictEqual(initial.added);
    expect(next.failed).toStrictEqual([]);

    expect((await loadLibraryIndex()).items).toHaveLength(1);
    expect(await readdir(mediaDirectory)).toHaveLength(1);
  });

  test("ファイル名が同じでも内容が異なれば別々に登録する", async () => {
    const first = await createSource("first", "sample.mp4", "video-one");
    const second = await createSource("second", "sample.mp4", "video-two");

    const result = await importLibraryVideos([first, second]);

    expect(result.added).toHaveLength(2);
    expect(result.duplicates).toStrictEqual([]);
    expect(result.failed).toStrictEqual([]);

    const [item1, item2] = result.added;

    if (item1 === undefined || item2 === undefined) {
      throw new Error("登録された動画が不足しています。");
    }

    expect(item1.originalName).toBe("sample.mp4");
    expect(item2.originalName).toBe("sample.mp4");
    expect(item1.id).not.toBe(item2.id);
    expect(item1.storedName).toBe("sample.mp4");
    expect(item2.storedName).toBe("sample (2).mp4");
    expect(item1.sha256).not.toBe(item2.sha256);

    expect(await readdir(mediaDirectory)).toHaveLength(2);
  });

  test("一部の動画が不正でも正常な動画は取り込む", async () => {
    const valid = await createSource("source", "valid.mp4", "valid-video");
    const empty = await createSource("source", "empty.mov", "");
    const unsupported = await createSource("source", "invalid.txt", "text");
    const missing = join(directory, "missing.webm");

    const result = await importLibraryVideos([empty, valid, unsupported, missing]);

    expect(result.added).toHaveLength(1);
    expect(result.duplicates).toStrictEqual([]);
    expect(result.failed).toHaveLength(3);

    expect(result.failed.map((failure) => failure.filePath)).toStrictEqual([
      empty,
      unsupported,
      missing,
    ]);

    expect((await loadLibraryIndex()).items).toHaveLength(1);
    expect(await readdir(mediaDirectory)).toHaveLength(1);
  });

  test("GIFをLibraryへ登録しない", async () => {
    const source = await createSource("source", "animation.gif", "gif-content");

    const result = await importLibraryVideos([source]);

    expect(result.added).toStrictEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.filePath).toBe(source);
    expect((await loadLibraryIndex()).items).toStrictEqual([]);
  });

  test("登録情報の保存に失敗したらコピー済み動画を削除する", async () => {
    const source = await createSource("source", "sample.mp4", "video-content");

    mocks.getLibraryIndexPath.mockReturnValueOnce(indexPath).mockReturnValue(directory);

    const result = await importLibraryVideos([source]);

    expect(result.added).toStrictEqual([]);
    expect(result.duplicates).toStrictEqual([]);
    expect(result.failed).toHaveLength(1);

    expect(await readdir(mediaDirectory)).toStrictEqual([]);
  });

  test("Library登録情報が壊れている場合は取り込みを開始しない", async () => {
    await mkdir(join(directory, "data"), { recursive: true });

    await writeFile(indexPath, JSON.stringify({ version: 2, items: [] }), "utf8");

    const source = await createSource("source", "sample.mp4", "video-content");

    await expect(importLibraryVideos([source])).rejects.toThrow("Libraryの登録情報が不正です。");
  });

  test("同じ内容の動画を並列で取り込んでも重複しない", async () => {
    const first = await createSource("first", "a.mp4", "same-content");
    const second = await createSource("second", "b.mp4", "same-content");

    const [firstResult, secondResult] = await Promise.all([
      importLibraryVideos([first]),
      importLibraryVideos([second]),
    ]);

    expect(firstResult.added).toHaveLength(1);
    expect(secondResult.added).toHaveLength(0);
    expect(secondResult.duplicates).toStrictEqual([second]);

    expect((await loadLibraryIndex()).items).toHaveLength(1);
    expect(await readdir(mediaDirectory)).toHaveLength(1);
  });

  test("異なる動画を並列で取り込んでも両方保持する", async () => {
    const first = await createSource("first", "a.mp4", "first-content");
    const second = await createSource("second", "b.mov", "second-content");

    const [firstResult, secondResult] = await Promise.all([
      importLibraryVideos([first]),
      importLibraryVideos([second]),
    ]);

    expect(firstResult.added).toHaveLength(1);
    expect(secondResult.added).toHaveLength(1);

    const index = await loadLibraryIndex();

    expect(index.items).toHaveLength(2);
    expect(await readdir(mediaDirectory)).toHaveLength(2);
  });
});
