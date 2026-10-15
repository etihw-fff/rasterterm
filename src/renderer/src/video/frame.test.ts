import { afterEach, describe, expect, test, vi } from "vitest";

import type { GridResult } from "../ascii/grid";
import { createFrameSampler } from "./frame";

const createGrid = (columns: number, rows: number): GridResult => ({
  columns,
  rows,
  canvasWidth: columns * 8,
  canvasHeight: rows * 16,
});

const createVideo = (
  overrides: Partial<Pick<HTMLVideoElement, "readyState" | "videoWidth" | "videoHeight">> = {},
): HTMLVideoElement => {
  return {
    readyState: 2,
    videoWidth: 1920,
    videoHeight: 1080,
    ...overrides,
  } as HTMLVideoElement;
};

const createTestEnvironment = (contextAvailable = true) => {
  const drawImage = vi.fn();

  const getImageData = vi.fn((...args: [number, number, number, number]): ImageData => {
    const width = args[2];
    const height = args[3];

    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: "srgb",
    };
  });

  const context = {
    drawImage,
    getImageData,
  };

  const getContext = vi.fn(() => (contextAvailable ? context : null));

  let width = 300;
  let height = 150;

  const sizeUpdates = {
    width: 0,
    height: 0,
  };

  const canvas = {
    get width() {
      return width;
    },
    set width(value: number) {
      sizeUpdates.width++;
      width = value;
    },
    get height() {
      return height;
    },
    set height(value: number) {
      sizeUpdates.height++;
      height = value;
    },
    getContext,
  };

  const createElement = vi.fn(() => canvas);

  vi.stubGlobal("document", {
    createElement,
  });

  return {
    canvas,
    context,
    drawImage,
    getImageData,
    getContext,
    createElement,
    sizeUpdates,
  };
};

describe("動画フレームの画素取得", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("画素取得用のCanvasを1つ作成する", () => {
    const { createElement, getContext } = createTestEnvironment();

    const sampler = createFrameSampler();

    expect(sampler.readFrame).toEqual(expect.any(Function));
    expect(createElement).toHaveBeenCalledExactlyOnceWith("canvas");
    expect(getContext).toHaveBeenCalledExactlyOnceWith("2d", {
      willReadFrequently: true,
    });
  });

  test("描画コンテキストを取得できない場合はエラーになる", () => {
    const { createElement, getContext } = createTestEnvironment(false);

    expect(() => createFrameSampler()).toThrow("フレーム取得用のCanvasを初期化できませんでした");

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  test("動画のフレームが利用できない場合はエラーになる", () => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo({ readyState: 1 });
    const grid = createGrid(4, 2);

    expect(() => sampler.readFrame(video, grid)).toThrow(
      "動画のフレームを取得できる状態ではありません",
    );

    expect(drawImage).not.toHaveBeenCalled();
    expect(getImageData).not.toHaveBeenCalled();
  });

  test("動画の準備状態が2の場合はフレームを取得できる", () => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo({ readyState: 2 });
    const grid = createGrid(4, 2);

    const result = sampler.readFrame(video, grid);

    expect(result.width).toBe(4);
    expect(result.height).toBe(2);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  test.each([
    { label: "横幅が0", videoWidth: 0, videoHeight: 1080 },
    { label: "高さが0", videoWidth: 1920, videoHeight: 0 },
    { label: "横幅が負数", videoWidth: -1, videoHeight: 1080 },
    { label: "高さが負数", videoWidth: 1920, videoHeight: -1 },
    { label: "横幅がNaN", videoWidth: Number.NaN, videoHeight: 1080 },
    { label: "高さがNaN", videoWidth: 1920, videoHeight: Number.NaN },
    { label: "横幅がInfinity", videoWidth: Infinity, videoHeight: 1080 },
    { label: "高さがInfinity", videoWidth: 1920, videoHeight: Infinity },
  ])("動画の$label場合はエラーになる", ({ videoWidth, videoHeight }) => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo({ videoWidth, videoHeight });

    expect(() => sampler.readFrame(video, createGrid(4, 2))).toThrow("動画のサイズが不正です");

    expect(drawImage).not.toHaveBeenCalled();
    expect(getImageData).not.toHaveBeenCalled();
  });

  test.each([
    { label: "列数が0", columns: 0, rows: 2 },
    { label: "行数が0", columns: 4, rows: 0 },
    { label: "列数が負数", columns: -1, rows: 2 },
    { label: "行数が負数", columns: 4, rows: -1 },
    { label: "列数が小数", columns: 1.5, rows: 2 },
    { label: "行数が小数", columns: 4, rows: 1.5 },
    { label: "列数がNaN", columns: Number.NaN, rows: 2 },
    { label: "行数がInfinity", columns: 4, rows: Infinity },
    { label: "列数が安全な整数の範囲外", columns: Number.MAX_SAFE_INTEGER + 1, rows: 2 },
    { label: "行数が安全な整数の範囲外", columns: 4, rows: Number.MAX_SAFE_INTEGER + 1 },
  ])("グリッドの$label場合はエラーになる", ({ columns, rows }) => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();

    expect(() => sampler.readFrame(video, createGrid(columns, rows))).toThrow(
      "文字グリッドのサイズが不正です",
    );

    expect(drawImage).not.toHaveBeenCalled();
    expect(getImageData).not.toHaveBeenCalled();
  });

  test("4列×2行のグリッドで4×2画素を取得する", () => {
    const { canvas, drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();
    const grid = createGrid(4, 2);

    const result = sampler.readFrame(video, grid);

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(2);

    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 4, 2);
    expect(getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 4, 2);

    expect(result.width).toBe(4);
    expect(result.height).toBe(2);
    expect(result.data).toHaveLength(4 * 2 * 4);
  });

  test("8列×4行のグリッドで8×4画素を取得する", () => {
    const { canvas, drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();

    const result = sampler.readFrame(video, createGrid(8, 4));

    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(4);

    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 8, 4);
    expect(getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 8, 4);

    expect(result.data).toHaveLength(8 * 4 * 4);
  });

  test("元動画1920×1080をグリッド80×23へ縮小描画する", () => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo({
      videoWidth: 1920,
      videoHeight: 1080,
    });

    sampler.readFrame(video, createGrid(80, 23));

    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 80, 23);
    expect(getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 80, 23);
  });

  test("画素取得結果としてImageDataを返す", () => {
    const { getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const result = sampler.readFrame(createVideo(), createGrid(4, 2));

    expect(result).toBe(getImageData.mock.results[0]?.value);
    expect(result.width).toBe(4);
    expect(result.height).toBe(2);
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
  });

  test("同じグリッドで繰り返し取得してもCanvasを作り直さない", () => {
    const { createElement, drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();
    const grid = createGrid(4, 2);

    sampler.readFrame(video, grid);
    sampler.readFrame(video, grid);
    sampler.readFrame(video, grid);

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(getImageData).toHaveBeenCalledTimes(3);
  });

  test("同じグリッドで繰り返し取得してもCanvasのサイズを再設定しない", () => {
    const { canvas, sizeUpdates } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();
    const grid = createGrid(4, 2);

    sampler.readFrame(video, grid);
    sampler.readFrame(video, grid);
    sampler.readFrame(video, grid);

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(2);

    expect(sizeUpdates.width).toBe(1);
    expect(sizeUpdates.height).toBe(1);
  });

  test("グリッドの列数が変わった場合はCanvasの横幅だけを更新する", () => {
    const { canvas, sizeUpdates } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();

    sampler.readFrame(video, createGrid(4, 2));
    sampler.readFrame(video, createGrid(8, 2));

    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(2);

    expect(sizeUpdates.width).toBe(2);
    expect(sizeUpdates.height).toBe(1);
  });

  test("グリッドの行数が変わった場合はCanvasの高さだけを更新する", () => {
    const { canvas, sizeUpdates } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();

    sampler.readFrame(video, createGrid(4, 2));
    sampler.readFrame(video, createGrid(4, 5));

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(5);

    expect(sizeUpdates.width).toBe(1);
    expect(sizeUpdates.height).toBe(2);
  });

  test("異なるフレームを連続して取得できる", () => {
    const { drawImage, getImageData } = createTestEnvironment();

    const sampler = createFrameSampler();
    const video = createVideo();
    const grid = createGrid(4, 2);

    const firstFrame = sampler.readFrame(video, grid);
    const secondFrame = sampler.readFrame(video, grid);

    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(getImageData).toHaveBeenCalledTimes(2);

    expect(firstFrame).not.toBe(secondFrame);

    expect(firstFrame.width).toBe(4);
    expect(secondFrame.width).toBe(4);
  });
});
