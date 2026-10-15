import type { AppSettings } from "../../../shared/settings";
import { revealCanvas } from "../effects/reveal";
import { wipeCanvas } from "../effects/wipe";
import type { VideoPlaybackController } from "./playback";

const SEEK_TIMEOUT_MS = 10000;
const BLACK_HOLD_MS = 1000;

type LoopStyle = AppSettings["loopStyle"];

type TransitionOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  playback: VideoPlaybackController;
  loopStyle?: LoopStyle;
  onError: (error: unknown) => void;
};

export type VideoTransition = {
  start: () => Promise<void>;
  setLoopStyle: (style: LoopStyle) => void;
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

    // 既に先頭フレームを取得できる場合、余分なシークは行わない。
    if (video.currentTime === 0 && !video.seeking && !video.ended && video.readyState >= 2) {
      resolve(true);
      return;
    }

    let timeoutId: number | null = null;
    let seekFinished = false;
    let completed = false;

    const cleanup = (): void => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      signal.removeEventListener("abort", onAbort);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = (value: boolean): void => {
      if (completed) {
        return;
      }

      completed = true;
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
      if (completed) {
        return;
      }

      completed = true;
      cleanup();
      reject(new Error("先頭フレームへの移動が完了しませんでした"));
    }, SEEK_TIMEOUT_MS);

    try {
      video.currentTime = 0;
    } catch (error) {
      completed = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

export const createVideoTransition = (options: TransitionOptions): VideoTransition => {
  const { video, canvas, playback, onError } = options;

  const controller = new AbortController();
  const { signal } = controller;

  let currentLoopStyle: LoopStyle = options.loopStyle ?? "transition";

  let activeLoopController: AbortController | null = null;
  let activeCycle: Promise<void> | null = null;
  let recoveryController: AbortController | null = null;

  // Directでは動画要素の標準ループを使う。
  // Transitionではendedイベントから独自演出を実行する。
  video.loop = currentLoopStyle === "direct";

  const reportError = (error: unknown): void => {
    if (signal.aborted) {
      return;
    }

    playback.pause();
    onError(error);
  };

  const redraw = (): void => {
    playback.resize();
  };

  const start = async (): Promise<void> => {
    // 初回Revealは両方のLoop Styleで共通。
    redraw();

    const revealed = await revealCanvas(canvas, redraw, signal);

    if (!revealed) {
      return;
    }

    await playback.start();
  };

  const onEnded = (): void => {
    if (signal.aborted || currentLoopStyle === "direct" || activeCycle !== null) {
      return;
    }

    // Transitionの場合だけ、再生を止めて演出を開始する。
    playback.pause();

    const loopController = new AbortController();
    activeLoopController = loopController;

    const task = (async (): Promise<void> => {
      // ① 400msの黒侵食
      const wiped = await wipeCanvas(canvas, loopController.signal);

      if (!wiped) {
        return;
      }

      // ② 黒画面を1秒間保持
      const waited = await waitWhileBlack(loopController.signal);

      if (!waited) {
        return;
      }

      // ③ 先頭フレームへ移動
      const seeked = await seekToStart(video, loopController.signal);

      if (!seeked) {
        return;
      }

      // ④ 600msのReveal
      const revealed = await revealCanvas(canvas, redraw, loopController.signal);

      if (!revealed) {
        return;
      }

      // ⑤ 再生再開
      await playback.resume();
    })();

    activeCycle = task
      .catch((error: unknown) => {
        reportError(error);
      })
      .finally(() => {
        if (activeLoopController === loopController) {
          activeLoopController = null;
        }

        activeCycle = null;
      });
  };

  const setLoopStyle = (style: LoopStyle): void => {
    if (signal.aborted || style === currentLoopStyle) {
      return;
    }

    currentLoopStyle = style;

    // 次のループから適用できるよう、標準ループの状態を更新する。
    video.loop = style === "direct";

    // 通常再生中であれば、現在の再生はそのまま継続する。
    if (style !== "direct" || activeLoopController === null || activeCycle === null) {
      return;
    }

    // Transition演出中にDirectを選択した場合。
    // 進行中の演出を中断し、先頭から再生し直す。
    activeLoopController.abort();

    const pendingCycle = activeCycle;
    const recovery = new AbortController();
    recoveryController = recovery;

    void (async (): Promise<void> => {
      // 古い演出処理が完全に終了するまで待つ。
      await pendingCycle;

      if (signal.aborted || recovery.signal.aborted) {
        return;
      }

      const seeked = await seekToStart(video, recovery.signal);

      if (!seeked) {
        return;
      }

      await playback.resume();
    })()
      .catch((error: unknown) => {
        reportError(error);
      })
      .finally(() => {
        if (recoveryController === recovery) {
          recoveryController = null;
        }
      });
  };

  video.addEventListener("ended", onEnded);

  const dispose = (): void => {
    if (signal.aborted) {
      return;
    }

    controller.abort();
    activeLoopController?.abort();
    recoveryController?.abort();

    video.removeEventListener("ended", onEnded);
  };

  return { start, setLoopStyle, dispose };
};
