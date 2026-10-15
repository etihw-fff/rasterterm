import type { GridResult } from "../ascii/grid";

export type FrameSampler = {
  readFrame: (video: HTMLVideoElement, grid: GridResult) => ImageData;
};

const REQUIRED_READY_STATE = 2;

export const createFrameSampler = (): FrameSampler => {
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!sampleContext) {
    throw new Error("フレーム取得用のCanvasを初期化できませんでした");
  }

  const readFrame = (video: HTMLVideoElement, grid: GridResult): ImageData => {
    if (video.readyState < REQUIRED_READY_STATE) {
      throw new Error("動画のフレームを取得できる状態ではありません");
    }

    if (
      !Number.isFinite(video.videoWidth) ||
      !Number.isFinite(video.videoHeight) ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new Error("動画のサイズが不正です");
    }

    const { columns, rows } = grid;

    if (
      !Number.isSafeInteger(columns) ||
      !Number.isSafeInteger(rows) ||
      columns <= 0 ||
      rows <= 0
    ) {
      throw new Error("文字グリッドのサイズが不正です");
    }

    if (sampleCanvas.width !== columns) {
      sampleCanvas.width = columns;
    }

    if (sampleCanvas.height !== rows) {
      sampleCanvas.height = rows;
    }

    sampleContext.drawImage(video, 0, 0, columns, rows);

    return sampleContext.getImageData(0, 0, columns, rows);
  };

  return { readFrame };
};
