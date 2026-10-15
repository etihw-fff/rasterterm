import type { Mock, MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { loadVideo } from "./load";

// テスト用ファイル
const fileMp4 = new File([new Uint8Array(100)], "movie.mp4", {
  type: "video/mp4",
});

const objectUrl = "blob:rasterterm-test-video";

// 動画要素の動作を再現する
class MockVideo extends EventTarget {
  muted = false;
  volume = 1;
  loop = false;
  playsInline = false;
  preload = "";
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

describe("動画ファイルの読み込み", () => {
  let video: MockVideo;
  let createElement: Mock<(tagName: string) => MockVideo>;
  let createObjectURL: MockInstance<typeof URL.createObjectURL>;
  let revokeObjectURL: MockInstance<typeof URL.revokeObjectURL>;

  beforeEach(() => {
    video = new MockVideo();

    createElement = vi.fn<(tagName: string) => MockVideo>(() => video);

    vi.stubGlobal("document", {
      createElement,
    });

    createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);

    revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("動画要素を作成してファイルの読み込みを開始する", async () => {
    const loading = loadVideo(fileMp4);

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(createElement).toHaveBeenCalledWith("video");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(fileMp4);

    expect(video.src).toBe(objectUrl);
    expect(video.load).toHaveBeenCalledTimes(1);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    loaded.dispose();
  });

  test("動画の音声とループ再生が正しく設定される", async () => {
    const loading = loadVideo(fileMp4);

    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe("auto");

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    loaded.dispose();
  });

  test("最初のフレームが利用可能になるまでは読み込みが完了しない", async () => {
    let resolved = false;

    const loading = loadVideo(fileMp4).then((loaded) => {
      resolved = true;
      return loaded;
    });

    await Promise.resolve();

    expect(resolved).toBe(false);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    expect(resolved).toBe(true);

    loaded.dispose();
  });

  test("正常な動画の読み込みに成功するとLoadedVideoを返す", async () => {
    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    expect(loaded.video).toBe(video);
    expect(loaded.dispose).toEqual(expect.any(Function));

    expect(video.pause).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    loaded.dispose();
  });

  test.each([
    { width: 0, height: 1080 },
    { width: 1920, height: 0 },
    { width: Number.NaN, height: 1080 },
    { width: 1920, height: Number.POSITIVE_INFINITY },
  ])("動画サイズが不正な場合は読み込みに失敗する ($width × $height)", async ({ width, height }) => {
    video.videoWidth = width;
    video.videoHeight = height;

    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("loadeddata"));

    await expect(loading).rejects.toThrow("動画のサイズが不正です");

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("動画の読み込みエラーが発生するとErrorを返す", async () => {
    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("error"));

    await expect(loading).rejects.toThrow("動画を読み込めませんでした");

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("読み込み開始前に中断済みの場合はAbortErrorを返す", async () => {
    const controller = new AbortController();

    controller.abort();

    await expect(loadVideo(fileMp4, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(createElement).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test("読み込み途中で中断するとAbortErrorを返してリソースを解放する", async () => {
    const controller = new AbortController();

    const loading = loadVideo(fileMp4, controller.signal);

    controller.abort();

    await expect(loading).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.src).toBe("");
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("イベント登録前に中断された場合も正しく処理する", async () => {
    const controller = new AbortController();

    createObjectURL.mockImplementationOnce(() => {
      controller.abort();
      return objectUrl;
    });

    await expect(loadVideo(fileMp4, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("読み込み成功後はイベント監視が解除される", async () => {
    const controller = new AbortController();

    const removeVideoListener = vi.spyOn(video, "removeEventListener");
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");

    const loading = loadVideo(fileMp4, controller.signal);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    expect(removeVideoListener).toHaveBeenCalledWith("loadeddata", expect.any(Function));

    expect(removeVideoListener).toHaveBeenCalledWith("error", expect.any(Function));

    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));

    expect(revokeObjectURL).not.toHaveBeenCalled();

    loaded.dispose();
  });

  test("読み込み成功後に中断通知が届いても動画を解放しない", async () => {
    const controller = new AbortController();

    const loading = loadVideo(fileMp4, controller.signal);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    controller.abort();

    expect(video.pause).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    loaded.dispose();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("disposeを実行すると動画と一時URLが解放される", async () => {
    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    expect(revokeObjectURL).not.toHaveBeenCalled();

    loaded.dispose();

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
    expect(video.src).toBe("");

    // 初回の読み込みと、解放時のリセット
    expect(video.load).toHaveBeenCalledTimes(2);

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("disposeを複数回実行しても二重解放しない", async () => {
    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    loaded.dispose();
    loaded.dispose();
    loaded.dispose();

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("一時URLの生成に失敗した場合はErrorを返す", async () => {
    createObjectURL.mockImplementationOnce(() => {
      throw new Error("URL生成失敗");
    });

    await expect(loadVideo(fileMp4)).rejects.toThrow("URL生成失敗");

    expect(video.load).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test("一時URLの生成でError以外が投げられてもErrorへ変換する", async () => {
    createObjectURL.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Error以外の例外を意図的に再現する
      throw "URL生成失敗";
    });

    await expect(loadVideo(fileMp4)).rejects.toThrow("URL生成失敗");

    expect(video.load).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test("動画の読み込み開始に失敗した場合はリソースを解放する", async () => {
    video.load.mockImplementationOnce(() => {
      throw new Error("読み込み開始失敗");
    });

    await expect(loadVideo(fileMp4)).rejects.toThrow("読み込み開始失敗");

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("読み込み開始時にError以外が投げられてもErrorへ変換する", async () => {
    video.load.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Error以外の例外を意図的に再現する
      throw "予期しない失敗";
    });

    await expect(loadVideo(fileMp4)).rejects.toThrow("動画の読み込みを開始できませんでした");

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });

  test("読み込み成功後に古いエラーイベントが発生しても動画を解放しない", async () => {
    const loading = loadVideo(fileMp4);

    video.dispatchEvent(new Event("loadeddata"));

    const loaded = await loading;

    video.dispatchEvent(new Event("error"));
    video.dispatchEvent(new Event("loadeddata"));

    expect(video.pause).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    loaded.dispose();

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(objectUrl);
  });
});
