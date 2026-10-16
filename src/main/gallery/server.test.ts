import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LibraryItem } from "../../shared/library";
import type { ResolvedLibraryVideo } from "./operations";
import type { GalleryVideoServer } from "./server";
import { startGalleryVideoServer } from "./server";

const mocks = vi.hoisted(() => ({
  resolveLibraryVideo: vi.fn<(id: string) => Promise<ResolvedLibraryVideo>>(),
}));

vi.mock("./operations", () => ({
  resolveLibraryVideo: mocks.resolveLibraryVideo,
}));

describe("ローカルLibrary動画配信", () => {
  let directory: string;
  let filePath: string;
  let server: GalleryVideoServer;

  const content = "abcdefghijklmnopqrstuvwxyz";

  beforeEach(async () => {
    vi.resetAllMocks();

    directory = await mkdtemp(join(tmpdir(), "rasterterm-video-server-"));

    await mkdir(directory, { recursive: true });

    filePath = join(directory, "video-1.webm");
    await writeFile(filePath, content);

    const item: LibraryItem = {
      id: "video-1",
      originalName: "sample.webm",
      storedName: "video-1.webm",
      sha256: "a".repeat(64),
      size: Buffer.byteLength(content),
      addedAt: "2026-10-16T00:00:00.000Z",
    };

    mocks.resolveLibraryVideo.mockResolvedValue({
      item,
      filePath,
    });

    server = await startGalleryVideoServer();
  });

  afterEach(async () => {
    await server.close();

    await rm(directory, {
      recursive: true,
      force: true,
    });
  });

  test("登録動画をHTTP 200でストリーミングする", async () => {
    const url = server.urlForId("video-1");
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/webm");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.text()).resolves.toBe(content);
  });

  test("Range指定では206 Partial Contentを返す", async () => {
    const response = await fetch(server.urlForId("video-1"), {
      headers: {
        range: "bytes=3-7",
      },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 3-7/26");
    expect(response.headers.get("content-length")).toBe("5");

    await expect(response.text()).resolves.toBe("defgh");
  });

  test("末尾からのRange指定を処理する", async () => {
    const response = await fetch(server.urlForId("video-1"), {
      headers: {
        range: "bytes=-4",
      },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 22-25/26");

    await expect(response.text()).resolves.toBe("wxyz");
  });

  test("範囲外のRange指定は416を返す", async () => {
    const response = await fetch(server.urlForId("video-1"), {
      headers: {
        range: "bytes=100-200",
      },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */26");
  });

  test("HEADでは本体を返さない", async () => {
    const response = await fetch(server.urlForId("video-1"), {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("26");
    await expect(response.text()).resolves.toBe("");
  });

  test("認証トークンが不正な場合は404を返す", async () => {
    const url = new URL(server.urlForId("video-1"));
    const parts = url.pathname.split("/");

    parts[2] = "b".repeat(64);
    url.pathname = parts.join("/");

    const response = await fetch(url);

    expect(response.status).toBe(404);
    expect(mocks.resolveLibraryVideo).not.toHaveBeenCalled();
  });

  test("登録されていない動画は404を返す", async () => {
    mocks.resolveLibraryVideo.mockRejectedValueOnce(new Error("動画が見つかりません"));

    const response = await fetch(server.urlForId("missing"));

    expect(response.status).toBe(404);
  });

  test("GIFは通常動画として配信しない", async () => {
    mocks.resolveLibraryVideo.mockResolvedValueOnce({
      item: {
        id: "gif-1",
        originalName: "sample.gif",
        storedName: "gif-1.gif",
        sha256: "b".repeat(64),
        size: 26,
        addedAt: "2026-10-16T00:00:00.000Z",
      },
      filePath,
    });

    const response = await fetch(server.urlForId("gif-1"));

    expect(response.status).toBe(415);
  });

  test("不正な動画IDではURLを作成しない", () => {
    expect(() => {
      server.urlForId("../outside");
    }).toThrow("Library動画IDが不正です。");
  });

  test("終了処理を複数回呼んでも失敗しない", async () => {
    await server.close();

    await expect(server.close()).resolves.toBeUndefined();
  });
});
