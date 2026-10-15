import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { revealCanvas } from "./reveal";

describe("ASCII映像のReveal演出", () => {
  let frameCallbacks: Map<number, FrameRequestCallback>;

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;
  let getContext: Mock<() => CanvasRenderingContext2D | null>;
  let resetTransform: Mock<() => void>;
  let fillRect: Mock<(x: number, y: number, width: number, height: number) => void>;
  let redraw: Mock<() => void>;
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
    redraw = vi.fn<() => void>();

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

  test("開始時は映像全体を黒く覆う", async () => {
    const result = revealCanvas(canvas, redraw, controller.signal);

    expect(redraw).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledExactlyOnceWith("2d");
    expect(resetTransform).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe("#000000");

    expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 80, 64);
    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    await expect(result).resolves.toBe(false);
  });

  test("600msで上から下へ全行を表示する", async () => {
    const result = revealCanvas(canvas, redraw, controller.signal);

    // 初回フレームでアニメーションの開始時刻が決まる。
    emitFrame(1000);

    // 300ms経過時点では4行中2行が見える。
    emitFrame(1300);

    expect(fillRect).toHaveBeenLastCalledWith(0, 32, 80, 32);
    expect(redraw).toHaveBeenCalledTimes(3);

    // 600ms経過で全行の表示が完了する。
    emitFrame(1600);

    await expect(result).resolves.toBe(true);

    expect(fillRect).toHaveBeenLastCalledWith(0, 64, 80, 0);
    expect(redraw).toHaveBeenCalledTimes(4);
    expect(resetTransform).toHaveBeenCalledTimes(4);
    expect(frameCallbacks.size).toBe(0);
  });

  test("表示範囲は16px単位で切り捨てる", async () => {
    const result = revealCanvas(canvas, redraw, controller.signal);

    emitFrame(1000);

    // 290ms経過。4行のうち1行だけが表示される。
    emitFrame(1290);

    expect(fillRect).toHaveBeenLastCalledWith(0, 16, 80, 48);
    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    await expect(result).resolves.toBe(false);
  });

  test("高さが16pxの倍数でなくても最後まで表示する", async () => {
    canvas.height = 50;

    const result = revealCanvas(canvas, redraw, controller.signal);

    emitFrame(1000);
    emitFrame(1300);

    // 50pxの高さでは32pxが表示され、残り18pxを覆う。
    expect(fillRect).toHaveBeenLastCalledWith(0, 32, 80, 18);

    emitFrame(1600);

    await expect(result).resolves.toBe(true);

    expect(fillRect).toHaveBeenLastCalledWith(0, 50, 80, 0);
    expect(frameCallbacks.size).toBe(0);
  });

  test("Canvasのコンテキストを取得できない場合はエラーになる", async () => {
    getContext.mockReturnValue(null);

    await expect(revealCanvas(canvas, redraw, controller.signal)).rejects.toThrow(
      "Reveal用のCanvasを取得できませんでした",
    );

    expect(redraw).toHaveBeenCalledTimes(1);
    expect(fillRect).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  test("演出中に中断すると描画を終了する", async () => {
    const result = revealCanvas(canvas, redraw, controller.signal);

    emitFrame(1000);
    emitFrame(1200);

    expect(frameCallbacks.size).toBe(1);

    controller.abort();

    await expect(result).resolves.toBe(false);

    expect(frameCallbacks.size).toBe(0);
    expect(redraw).toHaveBeenCalledTimes(3);
  });
});
