import { describe, expect, test, vi } from "vitest";

import { drawAsciiFrame } from "./draw";
import type { GridResult } from "./grid";

const GRID: GridResult = {
  columns: 4,
  rows: 2,
  canvasWidth: 32,
  canvasHeight: 32,
};

const GLYPHS = [" ", ".", ",", ":", ";", "$", " ", "."];

const createMockContext = (initialWidth = 0, initialHeight = 0) => {
  let canvasWidth = initialWidth;
  let canvasHeight = initialHeight;
  let currentFillStyle = "";

  const paintLog: string[] = [];

  const setWidth = vi.fn((value: number) => {
    canvasWidth = value;
  });

  const setHeight = vi.fn((value: number) => {
    canvasHeight = value;
  });

  const fillRect = vi.fn(() => {
    paintLog.push(`fillRect:${currentFillStyle}`);
  });

  const fillText = vi.fn(() => {
    paintLog.push(`fillText:${currentFillStyle}`);
  });

  const context = {
    canvas: {
      get width() {
        return canvasWidth;
      },
      set width(value: number) {
        setWidth(value);
      },
      get height() {
        return canvasHeight;
      },
      set height(value: number) {
        setHeight(value);
      },
    },
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(value: string) {
      currentFillStyle = value;
    },
    fillRect,
    fillText,
  } as unknown as CanvasRenderingContext2D;

  return {
    context,
    setWidth,
    setHeight,
    fillRect,
    fillText,
    paintLog,
  };
};

describe("CanvasへのASCII文字描画テスト", () => {
  test("文字数が不足している場合は描画前にエラーになる", () => {
    const { context, setWidth, setHeight, fillRect, fillText } = createMockContext();

    expect(() => {
      drawAsciiFrame(context, GLYPHS.slice(0, 7), GRID, 16);
    }).toThrow("ASCII文字数が一致しません");

    expect(setWidth).not.toHaveBeenCalled();
    expect(setHeight).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
  });

  test("文字数が多すぎる場合はエラーになる", () => {
    const { context, fillRect, fillText } = createMockContext();

    expect(() => {
      drawAsciiFrame(context, [...GLYPHS, "$"], GRID, 16);
    }).toThrow("ASCII文字数が一致しません");

    expect(fillRect).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
  });

  test("Canvasの幅と高さが異なる場合は必要なサイズに変更する", () => {
    const { context, setWidth, setHeight } = createMockContext(8, 16);

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(setWidth).toHaveBeenCalledExactlyOnceWith(32);
    expect(setHeight).toHaveBeenCalledExactlyOnceWith(32);

    expect(context.canvas.width).toBe(32);
    expect(context.canvas.height).toBe(32);
  });

  test("Canvasのサイズが一致している場合は再設定しない", () => {
    const { context, setWidth, setHeight } = createMockContext(32, 32);

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(setWidth).not.toHaveBeenCalled();
    expect(setHeight).not.toHaveBeenCalled();
  });

  test("Canvasの高さだけが異なる場合は高さだけを変更する", () => {
    const { context, setWidth, setHeight } = createMockContext(32, 16);

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(setWidth).not.toHaveBeenCalled();
    expect(setHeight).toHaveBeenCalledExactlyOnceWith(32);
  });

  test("IBM VGAフォントと文字の配置が正しく設定される", () => {
    const { context } = createMockContext();

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(context.font).toBe('16px "RasterTerm VGA"');
    expect(context.textAlign).toBe("left");
    expect(context.textBaseline).toBe("top");
    expect(context.fillStyle).toBe("#FFFFFF");
  });

  test("Canvas全体を黒く塗りつぶしてから白文字を描画する", () => {
    const { context, fillRect, paintLog } = createMockContext();

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 32, 32);

    expect(paintLog).toStrictEqual(["fillRect:#000000", "fillText:#FFFFFF", "fillText:#FFFFFF"]);
  });

  test("ASCII文字を1行ずつ結合し、正しい座標に描画する", () => {
    const { context, fillText } = createMockContext();

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    expect(fillText).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenNthCalledWith(1, " .,:", 0, 0);
    expect(fillText).toHaveBeenNthCalledWith(2, ";$ .", 0, 16);
  });

  test("10px設定では10pxの行間とフォントで描画する", () => {
    const { context, fillText } = createMockContext();
    drawAsciiFrame(context, GLYPHS, GRID, 10);
    expect(context.font).toBe('10px "RasterTerm VGA"');
    expect(fillText).toHaveBeenNthCalledWith(2, ";$ .", 0, 10);
  });

  test("連続描画すると毎フレーム背景が塗り直される", () => {
    const { context, fillRect, fillText, setWidth, setHeight, paintLog } = createMockContext();

    drawAsciiFrame(context, GLYPHS, GRID, 16);

    const nextGlyphs = ["$", "$", "$", "$", ".", ".", ".", "."];

    drawAsciiFrame(context, nextGlyphs, GRID, 16);

    expect(fillRect).toHaveBeenCalledTimes(2);
    expect(fillRect).toHaveBeenNthCalledWith(1, 0, 0, 32, 32);
    expect(fillRect).toHaveBeenNthCalledWith(2, 0, 0, 32, 32);

    expect(fillText).toHaveBeenCalledTimes(4);
    expect(fillText).toHaveBeenNthCalledWith(3, "$$$$", 0, 0);
    expect(fillText).toHaveBeenNthCalledWith(4, "....", 0, 16);

    expect(setWidth).toHaveBeenCalledTimes(1);
    expect(setHeight).toHaveBeenCalledTimes(1);

    expect(paintLog).toStrictEqual([
      "fillRect:#000000",
      "fillText:#FFFFFF",
      "fillText:#FFFFFF",
      "fillRect:#000000",
      "fillText:#FFFFFF",
      "fillText:#FFFFFF",
    ]);
  });
});
