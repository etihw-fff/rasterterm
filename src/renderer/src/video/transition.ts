import { revealCanvas } from "../effects/reveal";
import { wipeCanvas } from "../effects/wipe";
import type { VideoPlaybackController } from "./playback";

const SEEK_TIMEOUT_MS = 10000;
const BLACK_HOLD_MS = 1000;

type TransitionOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  playback: VideoPlaybackController;
  onError: (error: unknown) => void;
};

export type VideoTransition = {
  start: () => Promise<void>;
  dispose: () => void;
};

const waitWhileBlack = (signal: AbortSignal): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    let timeoutId: number | null = null;

    const cleanup = (): void => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      resolve(false);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(true);
    }, BLACK_HOLD_MS);
  });

const seekToStart = (video: HTMLVideoElement, signal: AbortSignal): Promise<boolean> =>
  new Promise<boolean>((resolve, reject) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    let timeoutId: number | null = null;
    let seekFinished = false;

    const cleanup = (): void => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      signal.removeEventListener("abort", onAbort);

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };

    const finish = (value: boolean): void => {
      cleanup();
      resolve(value);
    };

    const onReady = (): void => {
      if (seekFinished && video.readyState >= 2 && !video.seeking) {
        finish(true);
      }
    };

    const onSeeked = (): void => {
      seekFinished = true;
      onReady();
    };

    const onAbort = (): void => {
      finish(false);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    signal.addEventListener("abort", onAbort, { once: true });

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("先頭フレームへの移動が完了しませんでした"));
    }, SEEK_TIMEOUT_MS);

    try {
      video.currentTime = 0;
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createVideoTransition = (options: TransitionOptions): VideoTransition => {
  const { video, canvas, playback, onError } = options;

  const controller = new AbortController();
  const { signal } = controller;

  let transitioning = false;

  // 即時ループを止め、endedイベントから独自のループを実行する。
  video.loop = false;

  const redraw = (): void => {
    playback.resize();
  };

  const start = async (): Promise<void> => {
    // 初回は600msのReveal後に通常再生を開始する。
    redraw();

    const revealed = await revealCanvas(canvas, redraw, signal);

    if (!revealed) {
      return;
    }

    await playback.start();
  };

  const onEnded = (): void => {
    if (signal.aborted || transitioning) {
      return;
    }

    transitioning = true;

    // 最終フレームを保持して再生を停止する。
    playback.pause();

    void (async (): Promise<void> => {
      // ① 400msの黒侵食
      const wiped = await wipeCanvas(canvas, signal);

      if (!wiped) {
        return;
      }

      // ② 黒画面を1秒間保持
      const waited = await waitWhileBlack(signal);

      if (!waited) {
        return;
      }

      // ③ 先頭フレームへ移動
      const seeked = await seekToStart(video, signal);

      if (!seeked) {
        return;
      }

      // ④ 600msのReveal
      const revealed = await revealCanvas(canvas, redraw, signal);

      if (!revealed) {
        return;
      }

      // ⑤ Reveal完了後に再生再開
      await playback.resume();
    })()
      .catch((error: unknown) => {
        if (!signal.aborted) {
          playback.pause();
          onError(error);
        }
      })
      .finally(() => {
        transitioning = false;
      });
  };

  video.addEventListener("ended", onEnded);

  const dispose = (): void => {
    if (signal.aborted) {
      return;
    }

    controller.abort();
    video.removeEventListener("ended", onEnded);
  };

  return { start, dispose };
};
