import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { wipeCanvas } from "./wipe";

describe("ASCII映像の黒侵食演出", () => {
  let frameCallbacks: Map<number, FrameRequestCallback>;

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;
  let getContext: Mock<() => CanvasRenderingContext2D | null>;
  let resetTransform: Mock<() => void>;
  let fillRect: Mock<(x: number, y: number, width: number, height: number) => void>;
  let controller: AbortController;

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

    resetTransform = vi.fn<() => void>();
    fillRect = vi.fn<(x: number, y: number, width: number, height: number) => void>();

    context = {
      resetTransform,
      fillRect,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    getContext = vi.fn<() => CanvasRenderingContext2D | null>(() => context);

    canvas = {
      width: 80,
      height: 64,
      getContext,
    } as unknown as HTMLCanvasElement;

    controller = new AbortController();
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

  test("開始時はまだ映像を黒く覆わない", async () => {
    const result = wipeCanvas(canvas, controller.signal);

    expect(getContext).toHaveBeenCalledExactlyOnceWith("2d");
    expect(resetTransform).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe("#000000");

    expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 80, 0);
    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    await expect(result).resolves.toBe(false);
  });

  test("400msで上から下へ映像全体を黒くする", async () => {
    const result = wipeCanvas(canvas, controller.signal);

    emitFrame(1000);

    // 200ms経過時点で4行中2行が黒くなる。
    emitFrame(1200);

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 80, 32);

    // 400ms経過で全行が黒くなる。
    emitFrame(1400);

    await expect(result).resolves.toBe(true);

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 80, 64);
    expect(resetTransform).toHaveBeenCalledTimes(4);
    expect(frameCallbacks.size).toBe(0);
  });

  test("黒侵食の範囲は16px単位で切り上げる", async () => {
    const result = wipeCanvas(canvas, controller.signal);

    emitFrame(1000);

    // 10ms経過した時点で最上段の1行が黒くなる。
    emitFrame(1010);

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 80, 16);

    controller.abort();

    await expect(result).resolves.toBe(false);
  });

  test("高さが16pxの倍数でなくても最後まで黒くする", async () => {
    canvas.height = 50;

    const result = wipeCanvas(canvas, controller.signal);

    emitFrame(1000);
    emitFrame(1200);

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 80, 32);

    emitFrame(1400);

    await expect(result).resolves.toBe(true);

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 80, 50);
    expect(frameCallbacks.size).toBe(0);
  });

  test("Canvasのコンテキストを取得できない場合はエラーになる", async () => {
    getContext.mockReturnValue(null);

    await expect(wipeCanvas(canvas, controller.signal)).rejects.toThrow(
      "黒侵食用のCanvasを取得できませんでした",
    );

    expect(fillRect).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  test("演出中に中断すると黒侵食を停止する", async () => {
    const result = wipeCanvas(canvas, controller.signal);

    emitFrame(1000);
    emitFrame(1200);

    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    await expect(result).resolves.toBe(false);

    expect(frameCallbacks.size).toBe(0);
    expect(fillRect).toHaveBeenCalledTimes(3);
  });
});
