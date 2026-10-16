import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { loadVideo } from "./load";

class MockVideo extends EventTarget {
  muted = false;
  volume = 1;
  loop = false;
  playsInline = false;
  preload = "";
  crossOrigin: string | null = null;
  src = "";
  videoWidth = 1920;
  videoHeight = 1080;

  readonly pause = vi.fn<() => void>();
  readonly load = vi.fn<() => void>();

  readonly removeAttribute = vi.fn<(name: string) => void>((name) => {
    if (name === "src") {
      this.src = "";
    }
  });
}

const TOKEN = "a".repeat(64);
const VIDEO_URL = `http://127.0.0.1:45678/video/${TOKEN}/video-123`;

describe("Library URLからの動画読み込み", () => {
  let video: MockVideo;
  let createObjectURL: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectURL: MockInstance<typeof URL.revokeObjectURL>;

  beforeEach(() => {
    video = new MockVideo();

    vi.stubGlobal("document", {
      createElement: () => video,
    });

    createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unused");

    revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("ローカル配信URLを直接読み込む", async () => {
    const loading = loadVideo(VIDEO_URL);

    expect(video.src).toBe(VIDEO_URL);
    expect(video.crossOrigin).toBe("anonymous");
    expect(video.load).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    expect(loaded.video).toBe(video);

    loaded.dispose();

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test.each([
    "file:///private/example.mp4",
    "https://example.com/video.mp4",
    "http://localhost:45678/video/anything",
    `http://127.0.0.1:45678/private/${TOKEN}/video-123`,
    "rasterterm-library://video/video-123",
  ])("Library以外のURLを拒否する: %s", async (url) => {
    await expect(loadVideo(url)).rejects.toThrow("動画の参照URLが不正です。");

    expect(video.load).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
