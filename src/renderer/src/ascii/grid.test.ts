import { describe, expect, test } from "vitest";

import type { GridOptions, GridResult } from "./grid";
import { calculateGrid } from "./grid";

describe("明るさをASCII文字に変換する", () => {
  test.each<{ options: GridOptions; expected: GridResult }>([
    {
      options: {
        videoWidth: 1920,
        videoHeight: 1080,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
      expected: { columns: 80, rows: 23, canvasWidth: 640, canvasHeight: 368 },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: 1080,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "scroll",
        fontSize: 16,
      },
      expected: { columns: 89, rows: 25, canvasWidth: 712, canvasHeight: 400 },
    },
    {
      options: {
        videoWidth: 1080,
        videoHeight: 1920,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
      expected: { columns: 28, rows: 25, canvasWidth: 224, canvasHeight: 400 },
    },
    {
      options: {
        videoWidth: 1080,
        videoHeight: 1920,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "scroll",
        fontSize: 16,
      },
      expected: { columns: 80, rows: 71, canvasWidth: 640, canvasHeight: 1136 },
    },
    {
      options: {
        videoWidth: 1000,
        videoHeight: 1000,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
      expected: { columns: 50, rows: 25, canvasWidth: 400, canvasHeight: 400 },
    },
  ])(
    "【グリッド・Canvasサイズ計算】指定された入力条件 $options から、期待通りの行列数とCanvasサイズが算出されること",
    ({ options, expected }) => {
      const result = calculateGrid(options);
      expect(result).toStrictEqual(expected);
    },
  );

  test("表示領域のサイズが文字セルで割り切れない場合", () => {
    const options: GridOptions = {
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 650,
      viewportHeight: 410,
      mode: "fit",
      fontSize: 16,
    };
    const expected: GridResult = {
      columns: 81,
      rows: 23,
      canvasWidth: 648,
      canvasHeight: 368,
    };
    const result = calculateGrid(options);
    expect(result).toStrictEqual(expected);
  });

  test("小さい文字ではグリッド密度が上がり、大きい文字では下がる", () => {
    const base = {
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 640,
      viewportHeight: 400,
      mode: "fit" as const,
    };
    const small = calculateGrid({ ...base, fontSize: 8 });
    const large = calculateGrid({ ...base, fontSize: 20 });
    expect(small.columns).toBeGreaterThan(large.columns);
    expect(small.rows).toBeGreaterThan(large.rows);
    expect(small.canvasWidth).toBeLessThanOrEqual(base.viewportWidth);
    expect(large.canvasHeight).toBeLessThanOrEqual(base.viewportHeight);
  });

  test("表示領域が最小サイズの場合", () => {
    const options: GridOptions = {
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 8,
      viewportHeight: 16,
      mode: "fit",
      fontSize: 16,
    };
    const expected: GridResult = {
      columns: 1,
      rows: 1,
      canvasWidth: 8,
      canvasHeight: 16,
    };
    const result = calculateGrid(options);
    expect(result).toStrictEqual(expected);
  });

  test("正方形動画をSCROLLで表示した場合", () => {
    const options: GridOptions = {
      videoWidth: 1000,
      videoHeight: 1000,
      viewportWidth: 640,
      viewportHeight: 400,
      mode: "scroll",
      fontSize: 16,
    };
    const expected: GridResult = {
      columns: 50,
      rows: 25,
      canvasWidth: 400,
      canvasHeight: 400,
    };
    const result = calculateGrid(options);
    expect(result).toStrictEqual(expected);
  });
  test("FITでCanvasが表示領域を超えないこと", () => {
    const options: GridOptions = {
      videoWidth: 1000,
      videoHeight: 1000,
      viewportWidth: 320,
      viewportHeight: 160,
      mode: "fit",
      fontSize: 16,
    };

    const result = calculateGrid(options);
    expect(result.canvasWidth).toBeLessThanOrEqual(320);
    expect(result.canvasHeight).toBeLessThanOrEqual(160);
  });

  test.each<{ options: GridOptions }>([
    {
      options: {
        videoWidth: 0,
        videoHeight: 1080,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: -1,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: 1080,
        viewportWidth: 7,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: 1080,
        viewportWidth: 640,
        viewportHeight: 15,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: NaN,
        videoHeight: 1080,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: Infinity,
        viewportWidth: 640,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
    {
      options: {
        videoWidth: 1920,
        videoHeight: 1080,
        viewportWidth: -Infinity,
        viewportHeight: 400,
        mode: "fit",
        fontSize: 16,
      },
    },
  ])(
    "【不正入力検証】入力条件 $options のとき、期待通りエラー（例外）が発生すること",
    ({ options }) => {
      expect(() => calculateGrid(options)).toThrow();
    },
  );
});
