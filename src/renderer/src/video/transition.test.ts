import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppSettings } from "../../../shared/settings";
import type { VideoPlaybackController } from "./playback";
import { createVideoTransition } from "./transition";

const effects = vi.hoisted(() => ({
  revealCanvas: vi.fn(),
  wipeCanvas: vi.fn(),
}));

vi.mock("../effects/reveal", () => ({
  revealCanvas: effects.revealCanvas,
}));

vi.mock("../effects/wipe", () => ({
  wipeCanvas: effects.wipeCanvas,
}));

describe("動画のLoop Style", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();

    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });

    effects.revealCanvas.mockResolvedValue(true);
    effects.wipeCanvas.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const createEnvironment = (loopStyle: AppSettings["loopStyle"] = "transition") => {
    const events = new EventTarget();
    let currentTime = 9;

    const video = {
      loop: true,
      readyState: 2,
      seeking: false,
      ended: false,

      get currentTime(): number {
        return currentTime;
      },

      set currentTime(value: number) {
        currentTime = value;
        events.dispatchEvent(new Event("seeked"));
      },

      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    } as unknown as HTMLVideoElement;

    const playback: VideoPlaybackController = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pause: vi.fn<() => void>(),
      resume: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      resize: vi.fn<() => void>(),
      dispose: vi.fn<() => void>(),
    };

    const canvas = {} as HTMLCanvasElement;
    const onError = vi.fn<(error: unknown) => void>();

    const transition = createVideoTransition({
      video,
      canvas,
      playback,
      loopStyle,
      onError,
    });

    return {
      events,
      video,
      playback,
      onError,
      transition,
      getCurrentTime: (): number => currentTime,
    };
  };

  test("Transitionでは黒画面を1秒保持してからRevealと再生を行う", async () => {
    const environment = createEnvironment();
    const { events, video, playback, transition, getCurrentTime, onError } = environment;

    expect(video.loop).toBe(false);

    await transition.start();

    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(playback.start).toHaveBeenCalledTimes(1);

    events.dispatchEvent(new Event("ended"));

    expect(playback.pause).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);

    expect(getCurrentTime()).toBe(9);
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(playback.resume).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(getCurrentTime()).toBe(0);
    expect(effects.revealCanvas).toHaveBeenCalledTimes(2);
    expect(playback.resume).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    transition.dispose();
  });

  test("黒画面の保持中にdisposeすると再生を再開しない", async () => {
    const environment = createEnvironment();
    const { events, playback, transition, getCurrentTime, onError } = environment;

    await transition.start();

    events.dispatchEvent(new Event("ended"));

    await Promise.resolve();

    transition.dispose();

    await vi.advanceTimersByTimeAsync(2000);

    expect(getCurrentTime()).toBe(9);
    expect(playback.resume).not.toHaveBeenCalled();
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test("Directでは標準ループを有効にし、終了時の演出を行わない", async () => {
    const environment = createEnvironment("direct");
    const { events, video, playback, transition, onError } = environment;

    expect(video.loop).toBe(true);

    await transition.start();

    // 初回RevealはDirectでも実行する。
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(playback.start).toHaveBeenCalledTimes(1);

    events.dispatchEvent(new Event("ended"));

    // Directでは独自の終了演出を呼び出さない。
    expect(effects.wipeCanvas).not.toHaveBeenCalled();
    expect(playback.pause).not.toHaveBeenCalled();
    expect(playback.resume).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // 再びTransitionを選ぶと標準ループが無効になる。
    transition.setLoopStyle("transition");

    expect(video.loop).toBe(false);

    transition.dispose();
  });

  test("Transitionの途中でDirectに切り替えると演出を中断して再生する", async () => {
    const environment = createEnvironment();
    const { events, video, playback, transition, getCurrentTime, onError } = environment;

    await transition.start();

    events.dispatchEvent(new Event("ended"));

    // Wipe完了後、黒画面の保持処理へ移行させる。
    await Promise.resolve();

    // 黒画面保持中にDirectへ変更する。
    transition.setLoopStyle("direct");

    expect(video.loop).toBe(true);

    await vi.advanceTimersByTimeAsync(0);

    // 黒画面の1秒保持を待たずに先頭へ戻る。
    expect(getCurrentTime()).toBe(0);
    expect(playback.resume).toHaveBeenCalledTimes(1);

    // 中断されたTransitionが再開しない。
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(playback.resume).toHaveBeenCalledTimes(1);
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);

    transition.dispose();
  });
});
