import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

describe("動画ループ時のTRANSITION演出", () => {
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

  const createEnvironment = () => {
    const events = new EventTarget();
    let currentTime = 9;

    const video = {
      loop: true,
      readyState: 2,
      seeking: false,

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

  test("黒侵食後に1秒保持し、その後Revealして再生する", async () => {
    const environment = createEnvironment();
    const { events, video, playback, transition, getCurrentTime, onError } = environment;

    expect(video.loop).toBe(false);

    await transition.start();

    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(playback.start).toHaveBeenCalledTimes(1);

    events.dispatchEvent(new Event("ended"));

    expect(playback.pause).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);

    // 1秒未満なので、先頭には戻らない。
    expect(getCurrentTime()).toBe(9);
    expect(effects.revealCanvas).toHaveBeenCalledTimes(1);
    expect(playback.resume).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    // 1秒経過したので、先頭へ戻ってReveal・再生する。
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
});
