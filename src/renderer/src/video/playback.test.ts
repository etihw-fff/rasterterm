import type { Mock } from "vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { GridResult } from "../ascii/grid";
import { createVideoPlayback } from "./playback";

const mocks = vi.hoisted(() => ({
  calculateGrid: vi.fn(),
  drawAsciiFrame: vi.fn(),
  convertFrameToGlyphs: vi.fn(),
  createFrameSampler: vi.fn(),
  readFrame: vi.fn(),
}));

vi.mock("../ascii/grid", () => ({
  calculateGrid: mocks.calculateGrid,
}));

vi.mock("../ascii/draw", () => ({
  drawAsciiFrame: mocks.drawAsciiFrame,
}));

vi.mock("../ascii/convert", () => ({
  convertFrameToGlyphs: mocks.convertFrameToGlyphs,
}));

vi.mock("./frame", () => ({
  createFrameSampler: mocks.createFrameSampler,
}));

const grid: GridResult = {
  columns: 80,
  rows: 23,
  canvasWidth: 640,
  canvasHeight: 368,
};

const resizedGrid: GridResult = {
  columns: 100,
  rows: 28,
  canvasWidth: 800,
  canvasHeight: 448,
};

const imageData = {
  width: 80,
  height: 23,
  data: new Uint8ClampedArray(80 * 23 * 4),
  colorSpace: "srgb",
} as ImageData;

const glyphs = [" ", ".", "$"];

type FrameCallback = Parameters<HTMLVideoElement["requestVideoFrameCallback"]>[0];
type FrameMetadata = Parameters<FrameCallback>[1];

describe("ASCII動画の再生制御", () => {
  let video: HTMLVideoElement;
  let videoState: {
    videoWidth: number;
    videoHeight: number;
    readyState: number;
    seeking: boolean;
  };

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;

  let viewport: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    scrollLeft: number;
    scrollTop: number;
  };

  let getContext: Mock<() => CanvasRenderingContext2D | null>;
  let resetTransform: Mock<() => void>;
  let play: Mock<() => Promise<void>>;
  let pause: Mock<() => void>;
  let onError: Mock<(error: unknown) => void>;

  let requestVideoFrameCallback: Mock<(callback: FrameCallback) => number>;
  let cancelVideoFrameCallback: Mock<(id: number) => void>;

  let frameCallbacks: Map<number, FrameCallback>;
  let nextFrameId: number;

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.calculateGrid.mockReturnValue(grid);
    mocks.readFrame.mockReturnValue(imageData);
    mocks.convertFrameToGlyphs.mockReturnValue(glyphs);
    mocks.createFrameSampler.mockReturnValue({
      readFrame: mocks.readFrame,
    });

    resetTransform = vi.fn<() => void>();

    context = {
      resetTransform,
    } as unknown as CanvasRenderingContext2D;

    getContext = vi.fn<() => CanvasRenderingContext2D | null>(() => context);

    canvas = {
      getContext,
      style: {
        width: "",
        height: "",
      },
    } as unknown as HTMLCanvasElement;

    viewport = {
      clientWidth: 640,
      clientHeight: 400,
      scrollWidth: 1200,
      scrollHeight: 700,
      scrollLeft: 0,
      scrollTop: 0,
    };

    play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    pause = vi.fn<() => void>();
    onError = vi.fn<(error: unknown) => void>();

    frameCallbacks = new Map<number, FrameCallback>();
    nextFrameId = 1;

    requestVideoFrameCallback = vi.fn<(callback: FrameCallback) => number>((callback) => {
      const id = nextFrameId++;
      frameCallbacks.set(id, callback);
      return id;
    });

    cancelVideoFrameCallback = vi.fn<(id: number) => void>((id) => {
      frameCallbacks.delete(id);
    });

    videoState = {
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 2,
      seeking: false,
    };

    video = Object.assign(videoState, {
      play,
      pause,
      requestVideoFrameCallback,
      cancelVideoFrameCallback,
    }) as unknown as HTMLVideoElement;
  });

  const createController = (mode: "fit" | "scroll" = "fit") => {
    return createVideoPlayback({
      video,
      canvas,
      viewport: viewport as unknown as HTMLElement,
      mode,
      fontSize: 16,
      onError,
    });
  };

  const emitNextFrame = (): void => {
    const entry = frameCallbacks.entries().next().value;

    if (!entry) {
      throw new Error("予約された動画フレームがありません");
    }

    const [id, callback] = entry;

    frameCallbacks.delete(id);
    callback(0, {} as FrameMetadata);
  };

  test("ASCII描画用Canvasの初期化とフレーム取得機能の作成を行う", () => {
    const controller = createController();

    expect(getContext).toHaveBeenCalledExactlyOnceWith("2d");
    expect(mocks.createFrameSampler).toHaveBeenCalledTimes(1);

    expect(controller.start).toEqual(expect.any(Function));
    expect(controller.pause).toEqual(expect.any(Function));
    expect(controller.resume).toEqual(expect.any(Function));
    expect(controller.resize).toEqual(expect.any(Function));
    expect(controller.dispose).toEqual(expect.any(Function));

    expect(play).not.toHaveBeenCalled();
  });

  test("Canvasの描画コンテキストを取得できない場合はエラーになる", () => {
    getContext.mockReturnValue(null);

    expect(() => createController()).toThrow("ASCII描画用のCanvasを初期化できませんでした");

    expect(mocks.createFrameSampler).not.toHaveBeenCalled();
  });

  test("再生開始時に動画と表示領域からグリッドを計算する", async () => {
    const controller = createController();

    await controller.start();

    expect(mocks.calculateGrid).toHaveBeenCalledExactlyOnceWith({
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 640,
      viewportHeight: 400,
      mode: "fit",
      fontSize: 16,
    });

    expect(canvas.style.width).toBe("640px");
    expect(canvas.style.height).toBe("368px");
    expect(play).toHaveBeenCalledTimes(1);
  });

  test("文字サイズ変更後のリサイズで新しいセル寸法を使用する", async () => {
    let fontSize: 10 | 16 = 16;
    const controller = createVideoPlayback({
      video,
      canvas,
      viewport: viewport as unknown as HTMLElement,
      mode: "fit",
      fontSize: () => fontSize,
      onError,
    });
    await controller.start();
    fontSize = 10;
    controller.resize();
    expect(mocks.calculateGrid).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 10 }));
    expect(mocks.drawAsciiFrame).toHaveBeenLastCalledWith(context, glyphs, grid, 10);
  });

  test("再生開始時に現在フレームをASCII文字として描画する", async () => {
    const controller = createController();

    await controller.start();

    expect(mocks.readFrame).toHaveBeenCalledExactlyOnceWith(video, grid);
    expect(mocks.convertFrameToGlyphs).toHaveBeenCalledExactlyOnceWith(imageData);
    expect(resetTransform).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledExactlyOnceWith(context, glyphs, grid, 16);
  });

  test("再生開始後に次のフレーム更新を1件予約する", async () => {
    const controller = createController();

    await controller.start();

    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(1);
  });

  test("新しい動画フレームが利用可能になるたびに再描画する", async () => {
    const controller = createController();

    await controller.start();

    emitNextFrame();
    emitNextFrame();

    expect(mocks.readFrame).toHaveBeenCalledTimes(3);
    expect(mocks.convertFrameToGlyphs).toHaveBeenCalledTimes(3);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(3);

    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(3);
    expect(frameCallbacks.size).toBe(1);
  });

  test("再生中にstartを繰り返しても再生処理が重複しない", async () => {
    const controller = createController();

    await controller.start();
    await controller.start();
    await controller.start();

    expect(play).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(1);
  });

  test("再生開始の待機中にstartを繰り返しても同じ処理を待つ", async () => {
    let resolvePlay!: () => void;

    play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = resolve;
        }),
    );

    const controller = createController();

    const first = controller.start();
    const second = controller.start();

    expect(play).toHaveBeenCalledTimes(1);

    resolvePlay();

    await Promise.all([first, second]);

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(1);
  });

  test("一時停止すると動画と予約済みフレーム更新が停止する", async () => {
    const controller = createController();

    await controller.start();

    expect(frameCallbacks.size).toBe(1);

    controller.pause();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(cancelVideoFrameCallback).toHaveBeenCalledExactlyOnceWith(1);
    expect(frameCallbacks.size).toBe(0);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
  });

  test("一時停止後に古いフレーム通知が届いても描画しない", async () => {
    const controller = createController();

    await controller.start();

    const oldCallback = frameCallbacks.get(1);

    if (!oldCallback) {
      throw new Error("フレーム更新が予約されていません");
    }

    controller.pause();

    oldCallback(0, {} as FrameMetadata);

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  test("一時停止した動画を再開できる", async () => {
    const controller = createController();

    await controller.start();

    controller.pause();

    await controller.resume();

    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(2);
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(1);
  });

  test("再生開始の待機中に一時停止した場合は古い再生処理を開始しない", async () => {
    let resolvePlay!: () => void;

    play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = resolve;
        }),
    );

    const controller = createController();

    const starting = controller.start();

    controller.pause();
    resolvePlay();

    await starting;

    expect(pause).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).not.toHaveBeenCalled();
    expect(requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  test("FITモードでは再生開始時にスクロール位置を初期化する", async () => {
    viewport.scrollLeft = 150;
    viewport.scrollTop = 90;

    const controller = createController("fit");

    await controller.start();

    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
  });

  test("SCROLLモードでは再生開始時にスクロール可能な終端へ移動する", async () => {
    const controller = createController("scroll");

    await controller.start();

    expect(mocks.calculateGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "scroll",
      }),
    );

    expect(viewport.scrollLeft).toBe(560);
    expect(viewport.scrollTop).toBe(300);
  });

  test("リサイズするとグリッドとCanvasの表示サイズを更新する", async () => {
    const controller = createController();

    await controller.start();

    mocks.calculateGrid.mockReturnValueOnce(resizedGrid);
    viewport.clientWidth = 800;
    viewport.clientHeight = 500;

    controller.resize();

    expect(mocks.calculateGrid).toHaveBeenCalledTimes(2);
    expect(mocks.calculateGrid).toHaveBeenNthCalledWith(2, {
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 800,
      viewportHeight: 500,
      mode: "fit",
      fontSize: 16,
    });

    expect(canvas.style.width).toBe("800px");
    expect(canvas.style.height).toBe("448px");

    expect(mocks.readFrame).toHaveBeenLastCalledWith(video, resizedGrid);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(2);

    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
  });

  test("一時停止中にリサイズしても再生を再開しない", async () => {
    const controller = createController();

    await controller.start();

    controller.pause();
    controller.resize();

    expect(play).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(2);
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  test("動画フレームが利用できない状態ではリサイズ時に再描画しない", async () => {
    const controller = createController();

    await controller.start();

    videoState.readyState = 1;

    controller.resize();

    expect(mocks.calculateGrid).toHaveBeenCalledTimes(2);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test("リサイズ時にエラーが発生すると再生を停止して通知する", async () => {
    const controller = createController();

    await controller.start();

    const error = new Error("グリッドの計算に失敗しました");

    mocks.calculateGrid.mockImplementationOnce(() => {
      throw error;
    });

    controller.resize();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(frameCallbacks.size).toBe(0);
  });

  test("フレーム更新中の描画エラーは通知して再生を停止する", async () => {
    const controller = createController();

    await controller.start();

    const error = new Error("フレームの取得に失敗しました");

    mocks.readFrame.mockImplementationOnce(() => {
      throw error;
    });

    emitNextFrame();

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);

    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1);
  });

  test("動画の再生開始に失敗した場合はエラーとして終了する", async () => {
    const error = new Error("再生開始に失敗しました");

    play.mockRejectedValueOnce(error);

    const controller = createController();

    await expect(controller.start()).rejects.toThrow("再生開始に失敗しました");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).not.toHaveBeenCalled();
    expect(requestVideoFrameCallback).not.toHaveBeenCalled();
  });

  test("初回フレームの描画に失敗した場合も再生を停止する", async () => {
    const error = new Error("初回描画に失敗しました");

    mocks.readFrame.mockImplementationOnce(() => {
      throw error;
    });

    const controller = createController();

    await expect(controller.start()).rejects.toThrow("初回描画に失敗しました");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  test("disposeで再生制御を終了し、二重破棄を防止する", async () => {
    const controller = createController();

    await controller.start();

    controller.dispose();
    controller.dispose();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(cancelVideoFrameCallback).toHaveBeenCalledExactlyOnceWith(1);
    expect(frameCallbacks.size).toBe(0);

    await expect(controller.start()).rejects.toThrow("破棄済みの動画は再生できません");

    controller.resize();
    controller.pause();

    expect(mocks.calculateGrid).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  test("再生開始の待機中にdisposeしても古い再生処理が復活しない", async () => {
    let resolvePlay!: () => void;

    play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = resolve;
        }),
    );

    const controller = createController();

    const starting = controller.start();

    controller.dispose();
    resolvePlay();

    await starting;

    expect(pause).toHaveBeenCalledTimes(1);
    expect(mocks.drawAsciiFrame).not.toHaveBeenCalled();
    expect(requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  // ここからは以前の playback-loop.test.ts にあった検証を統合する。

  test("ループ境界でreadyStateが低下しても停止せず描画を再開する", async () => {
    const controller = createController();

    await controller.start();

    videoState.readyState = 1;
    emitNextFrame();

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);

    videoState.readyState = 2;
    emitNextFrame();

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);

    controller.dispose();
  });

  test("シーク中は描画を見送り、完了後に再開する", async () => {
    const controller = createController();

    await controller.start();

    videoState.seeking = true;
    emitNextFrame();

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();

    videoState.seeking = false;
    emitNextFrame();

    expect(mocks.drawAsciiFrame).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(1);

    controller.dispose();
  });

  test("動画サイズが一時的に0でも再生を停止しない", async () => {
    const controller = createController();

    await controller.start();

    videoState.videoWidth = 0;
    emitNextFrame();

    expect(mocks.readFrame).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();

    videoState.videoWidth = 1920;
    emitNextFrame();

    expect(mocks.readFrame).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(1);

    controller.dispose();
  });

  test("一時的なフレーム不足の後に本当の描画エラーが起きた場合は停止する", async () => {
    const controller = createController();

    await controller.start();

    videoState.readyState = 1;
    emitNextFrame();

    expect(onError).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();

    videoState.readyState = 2;

    const error = new Error("ループ再開後の描画エラー");

    mocks.readFrame.mockImplementationOnce(() => {
      throw error;
    });

    emitNextFrame();

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);

    controller.dispose();
  });
});
