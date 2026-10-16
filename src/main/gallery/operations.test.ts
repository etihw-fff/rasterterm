import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryItem } from "../../shared/library";
import { LIBRARY_VERSION } from "../../shared/library";
import { importLibraryVideos } from "./import";
import { loadLibraryIndex, saveLibraryIndex } from "./library";
import { deleteLibraryVideos, listLibraryVideos, resolveLibraryVideo } from "./operations";

const mocks = vi.hoisted(() => ({
  getLibraryIndexPath: vi.fn<() => string>(),
  getLibraryMediaDirectory: vi.fn<() => string>(),
  trashItem: vi.fn<(filePath: string) => Promise<void>>(),
}));

vi.mock("./paths", () => ({
  getLibraryIndexPath: mocks.getLibraryIndexPath,
  getLibraryMediaDirectory: mocks.getLibraryMediaDirectory,
}));

vi.mock("electron", () => ({
  shell: {
    trashItem: mocks.trashItem,
  },
}));

describe("Library内の動画一覧・選択・削除", () => {
  let directory: string;
  let indexPath: string;
  let mediaDirectory: string;

  const seedVideo = async (id: string): Promise<LibraryItem> => {
    const content = `video-content-${id}`;

    const item: LibraryItem = {
      id,
      originalName: `${id}.mp4`,
      storedName: `${id}.mp4`,
      sha256: createHash("sha256").update(content).digest("hex"),
      size: Buffer.byteLength(content),
      addedAt: "2026-10-16T00:00:00.000Z",
    };

    await mkdir(mediaDirectory, { recursive: true });

    await writeFile(join(mediaDirectory, item.storedName), content);

    const previousIndex = await loadLibraryIndex();

    await saveLibraryIndex({
      version: LIBRARY_VERSION,
      items: [...previousIndex.items, item],
    });

    return item;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    directory = await mkdtemp(join(tmpdir(), "rasterterm-operations-"));
    indexPath = join(directory, "data", "library.json");
    mediaDirectory = join(directory, "media");

    mocks.getLibraryIndexPath.mockReturnValue(indexPath);
    mocks.getLibraryMediaDirectory.mockReturnValue(mediaDirectory);

    // テストでは実際のOSのゴミ箱を使わず、退避ファイルを消す。
    mocks.trashItem.mockImplementation(async (filePath) => {
      await rm(filePath);
    });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("登録されている動画の一覧を取得する", async () => {
    const first = await seedVideo("video-1");
    const second = await seedVideo("video-2");

    await expect(listLibraryVideos()).resolves.toStrictEqual([first, second]);
  });

  test("登録済み動画の安全な再生パスを取得する", async () => {
    const item = await seedVideo("video-1");

    await expect(resolveLibraryVideo(item.id)).resolves.toStrictEqual({
      item,
      filePath: join(mediaDirectory, item.storedName),
    });
  });

  test("登録されていない動画の選択は拒否する", async () => {
    await expect(resolveLibraryVideo("unknown")).rejects.toThrow(
      "指定された動画はLibraryに登録されていません。",
    );
  });

  test("登録情報と実ファイルのサイズが違う場合は拒否する", async () => {
    const item = await seedVideo("video-1");

    await writeFile(join(mediaDirectory, item.storedName), "wrong");

    await expect(resolveLibraryVideo(item.id)).rejects.toThrow(
      "登録されている動画ファイルが不正です。",
    );
  });

  test("動画をOSのゴミ箱へ移動し、登録情報から削除する", async () => {
    const item = await seedVideo("video-1");

    const result = await deleteLibraryVideos([item.id]);

    expect(result.deleted).toStrictEqual([item]);
    expect(result.failed).toStrictEqual([]);

    expect(mocks.trashItem).toHaveBeenCalledTimes(1);
    const trashPath = mocks.trashItem.mock.calls[0]?.[0];
    expect(trashPath).toBeDefined();
    expect(basename(trashPath ?? "")).toBe(item.storedName);
    expect((await loadLibraryIndex()).items).toStrictEqual([]);
    // 動画も専用の一時フォルダも残らない。
    expect(await readdir(mediaDirectory)).toStrictEqual([]);
  });

  test("同じIDを複数指定しても削除は1回だけ行う", async () => {
    const item = await seedVideo("video-1");

    const result = await deleteLibraryVideos([item.id, item.id]);

    expect(result.deleted).toHaveLength(1);
    expect(result.failed).toStrictEqual([]);
    expect(mocks.trashItem).toHaveBeenCalledTimes(1);
  });

  test("一部の動画が削除できなくても残りを処理する", async () => {
    const first = await seedVideo("video-1");
    const second = await seedVideo("video-2");

    // 2件目の実ファイルがなくなった状況。
    await rm(join(mediaDirectory, second.storedName));

    const result = await deleteLibraryVideos([first.id, second.id]);

    expect(result.deleted).toStrictEqual([first]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe(second.id);

    expect((await loadLibraryIndex()).items).toStrictEqual([second]);
    expect(mocks.trashItem).toHaveBeenCalledTimes(1);
  });

  test("ゴミ箱への移動に失敗した場合は元に戻す", async () => {
    const item = await seedVideo("video-1");

    mocks.trashItem.mockRejectedValueOnce(new Error("ゴミ箱への移動に失敗"));

    const result = await deleteLibraryVideos([item.id]);

    expect(result.deleted).toStrictEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.message).toContain("ゴミ箱への移動に失敗");

    // JSONも元のファイルも維持する。
    expect((await loadLibraryIndex()).items).toStrictEqual([item]);

    const filePath = join(mediaDirectory, item.storedName);
    expect(await readFile(filePath, "utf8")).toBe("video-content-video-1");

    expect(await readdir(mediaDirectory)).toStrictEqual([item.storedName]);
  });

  test("登録情報の保存に失敗した場合は元ファイルを復元する", async () => {
    const item = await seedVideo("video-1");

    // 読み込みは成功させ、保存時だけ不正な保存先を返す。
    mocks.getLibraryIndexPath.mockReturnValueOnce(indexPath).mockReturnValueOnce(directory);

    const result = await deleteLibraryVideos([item.id]);

    expect(result.deleted).toStrictEqual([]);
    expect(result.failed).toHaveLength(1);

    expect((await loadLibraryIndex()).items).toStrictEqual([item]);
    expect(await readdir(mediaDirectory)).toStrictEqual([item.storedName]);

    expect(mocks.trashItem).not.toHaveBeenCalled();
  });

  test("取り込みと削除を同時に要求しても登録情報を失わない", async () => {
    const oldItem = await seedVideo("video-1");

    const sourceDirectory = join(directory, "source");
    await mkdir(sourceDirectory, { recursive: true });

    const newSource = join(sourceDirectory, "new.mp4");
    await writeFile(newSource, "new-video-content");

    const [importResult, deleteResult] = await Promise.all([
      importLibraryVideos([newSource]),
      deleteLibraryVideos([oldItem.id]),
    ]);

    expect(importResult.added).toHaveLength(1);
    expect(importResult.failed).toStrictEqual([]);
    expect(deleteResult.deleted).toStrictEqual([oldItem]);
    expect(deleteResult.failed).toStrictEqual([]);

    const finalIndex = await loadLibraryIndex();

    expect(finalIndex.items).toHaveLength(1);
    expect(finalIndex.items[0]?.originalName).toBe("new.mp4");
    expect(await readdir(mediaDirectory)).toHaveLength(1);
  });
});
