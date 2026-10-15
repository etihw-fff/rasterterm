import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { animateRows } from "./animate";

describe("アニメーションの時間制御", () => {
  let frameCallbacks: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    frameCallbacks = new Map<number, FrameRequestCallback>();

    let nextFrameId = 1;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      const id = nextFrameId++;
      frameCallbacks.set(id, callback);
      return id;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
      frameCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const emitFrame = (timestamp: number): void => {
    const entry = frameCallbacks.entries().next().value;

    if (!entry) {
      throw new Error("予約されたアニメーションフレームがありません");
    }

    const [id, callback] = entry;

    frameCallbacks.delete(id);
    callback(timestamp);
  };

  test("開始時に進行率0で描画し、次のフレームを予約する", () => {
    const controller = new AbortController();
    const draw = vi.fn<(progress: number) => void>();

    void animateRows(400, draw, controller.signal);

    expect(draw).toHaveBeenCalledExactlyOnceWith(0);
    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    expect(frameCallbacks.size).toBe(0);
  });

  test("指定時間に従って進行率が増加し、完了時にtrueを返す", async () => {
    const controller = new AbortController();
    const draw = vi.fn<(progress: number) => void>();

    const result = animateRows(400, draw, controller.signal);

    emitFrame(1000);
    emitFrame(1200);
    emitFrame(1400);

    await expect(result).resolves.toBe(true);

    expect(draw.mock.calls.map(([progress]) => progress)).toEqual([0, 0, 0.5, 1]);

    expect(frameCallbacks.size).toBe(0);
  });

  test("指定時間を超えても進行率が1を超えない", async () => {
    const controller = new AbortController();
    const draw = vi.fn<(progress: number) => void>();

    const result = animateRows(400, draw, controller.signal);

    emitFrame(1000);
    emitFrame(2000);

    await expect(result).resolves.toBe(true);

    expect(draw).toHaveBeenLastCalledWith(1);
    expect(frameCallbacks.size).toBe(0);
  });

  test("開始前に中断されている場合は描画せずfalseを返す", async () => {
    const controller = new AbortController();
    const draw = vi.fn<(progress: number) => void>();

    controller.abort();

    await expect(animateRows(400, draw, controller.signal)).resolves.toBe(false);

    expect(draw).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  test("アニメーション中に中断すると予約を解除してfalseを返す", async () => {
    const controller = new AbortController();
    const draw = vi.fn<(progress: number) => void>();

    const result = animateRows(400, draw, controller.signal);

    emitFrame(1000);

    controller.abort();

    await expect(result).resolves.toBe(false);

    expect(frameCallbacks.size).toBe(0);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  test("初回描画で例外が発生した場合はエラーを返す", async () => {
    const controller = new AbortController();
    const error = new Error("初回描画エラー");

    const draw = vi.fn<(progress: number) => void>(() => {
      throw error;
    });

    await expect(animateRows(400, draw, controller.signal)).rejects.toThrow("初回描画エラー");

    expect(frameCallbacks.size).toBe(0);
  });

  test("フレーム更新時の描画エラーは通知して予約を停止する", async () => {
    const controller = new AbortController();
    const error = new Error("フレーム描画エラー");

    let drawCount = 0;

    const draw = vi.fn<(progress: number) => void>(() => {
      drawCount += 1;

      if (drawCount === 2) {
        throw error;
      }
    });

    const result = animateRows(400, draw, controller.signal);

    emitFrame(1000);

    await expect(result).rejects.toThrow("フレーム描画エラー");

    expect(draw).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(0);
  });
});
