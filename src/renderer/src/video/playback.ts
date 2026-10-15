import { convertFrameToGlyphs } from "../ascii/convert";
import { drawAsciiFrame } from "../ascii/draw";
import type { GridResult } from "../ascii/grid";
import { calculateGrid } from "../ascii/grid";
import { createFrameSampler } from "./frame";

export type VideoPlaybackOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  viewport: HTMLElement;
  mode: "fit" | "scroll";
  onError: (error: unknown) => void;
};

export type VideoPlaybackController = {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  resize: () => void;
  dispose: () => void;
};

export const createVideoPlayback = (options: VideoPlaybackOptions): VideoPlaybackController => {
  const { video, canvas, viewport, mode, onError } = options;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("ASCII描画用のCanvasを初期化できませんでした");
  }

  const sampler = createFrameSampler();

  let grid: GridResult | null = null;
  let callbackId: number | null = null;
  let running = false;
  let disposed = false;
  let generation = 0;
  let pendingStart: Promise<void> | null = null;

  const updateGrid = (): void => {
    grid = calculateGrid({
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      mode,
    });

    canvas.style.width = `${String(grid.canvasWidth)}px`;
    canvas.style.height = `${String(grid.canvasHeight)}px`;
  };

  const renderFrame = (): void => {
    if (grid === null) {
      throw new Error("文字グリッドが初期化されていません");
    }

    const imageData = sampler.readFrame(video, grid);
    const glyphs = convertFrameToGlyphs(imageData);

    context.resetTransform();

    drawAsciiFrame(context, glyphs, grid);
  };

  const updateScroll = (): void => {
    if (mode === "fit") {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      return;
    }

    viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  };

  const cancelScheduledFrame = (): void => {
    if (callbackId === null) {
      return;
    }

    video.cancelVideoFrameCallback(callbackId);
    callbackId = null;
  };

  const pause = (): void => {
    if (disposed) {
      return;
    }

    generation += 1;
    running = false;
    pendingStart = null;

    cancelScheduledFrame();
    video.pause();
  };

  const scheduleNextFrame = (): void => {
    if (disposed || !running || callbackId !== null) {
      return;
    }

    const scheduledGeneration = generation;

    callbackId = video.requestVideoFrameCallback(() => {
      if (disposed || !running || scheduledGeneration !== generation) {
        return;
      }

      callbackId = null;

      try {
        renderFrame();
      } catch (error) {
        pause();
        onError(error);
        return;
      }

      scheduleNextFrame();
    });
  };

  const start = async (): Promise<void> => {
    if (disposed) {
      throw new Error("破棄済みの動画は再生できません");
    }

    if (running) {
      return;
    }

    if (pendingStart !== null) {
      await pendingStart;
      return;
    }

    const currentGeneration = generation;

    const task = (async (): Promise<void> => {
      try {
        updateGrid();

        await video.play();

        if (currentGeneration !== generation) {
          return;
        }

        running = true;

        renderFrame();
        updateScroll();
        scheduleNextFrame();
      } catch (error) {
        if (currentGeneration === generation) {
          pause();
        }

        throw error instanceof Error ? error : new Error(String(error));
      }
    })();

    pendingStart = task;

    void task.then(
      () => {
        if (pendingStart === task) {
          pendingStart = null;
        }
      },
      () => {
        if (pendingStart === task) {
          pendingStart = null;
        }
      },
    );

    await task;
  };

  const resume = async (): Promise<void> => {
    await start();
  };

  const resize = (): void => {
    if (disposed) {
      return;
    }

    try {
      updateGrid();

      if (video.readyState >= 2) {
        renderFrame();
      }

      updateScroll();
    } catch (error) {
      pause();
      onError(error);
    }
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    generation += 1;
    running = false;
    pendingStart = null;

    cancelScheduledFrame();
    video.pause();
  };

  return {
    start,
    pause,
    resume,
    resize,
    dispose,
  };
};
