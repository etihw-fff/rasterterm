import { describe, expect, test } from "vitest";

import { convertFrameToGlyphs } from "./convert";

type RGBA = readonly [number, number, number, number];

// Node.js環境でテスト用のImageDataを再現する
const createImageData = (width: number, height: number, pixels: readonly RGBA[]): ImageData => {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels.flat()),
    colorSpace: "srgb",
  };
};

describe("動画フレームのASCII文字変換", () => {
  test("黒1画素を半角スペースに変換する", () => {
    const imageData = createImageData(1, 1, [[0, 0, 0, 255]]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" "]);
  });

  test("白1画素を$に変換する", () => {
    const imageData = createImageData(1, 1, [[255, 255, 255, 255]]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual(["$"]);
  });

  test("灰色128の1画素をコロンに変換する", () => {
    const imageData = createImageData(1, 1, [[128, 128, 128, 255]]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([":"]);
  });

  test("黒と白を正しい順序で変換する", () => {
    const imageData = createImageData(2, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", "$"]);
  });

  test("白と黒の順序を維持する", () => {
    const imageData = createImageData(2, 1, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual(["$", " "]);
  });

  test("黒・灰色128・白を正規化して変換する", () => {
    const imageData = createImageData(3, 1, [
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", ":", "$"]);
  });

  test("4段階の明るさを正規化して変換する", () => {
    const imageData = createImageData(4, 1, [
      [0, 0, 0, 255],
      [85, 85, 85, 255],
      [170, 170, 170, 255],
      [255, 255, 255, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", ".", ";", "$"]);
  });

  test("明るさの範囲が狭くてもフレーム全体を正規化する", () => {
    const imageData = createImageData(2, 1, [
      [100, 100, 100, 255],
      [150, 150, 150, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", "$"]);
  });

  test("全画素が同じ明るさの場合は元の明るさを維持する", () => {
    const imageData = createImageData(3, 1, [
      [128, 128, 128, 255],
      [128, 128, 128, 255],
      [128, 128, 128, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([":", ":", ":"]);
  });

  test("RGBの重み付けによる明るさの違いを反映する", () => {
    const imageData = createImageData(5, 1, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([".", ";", " ", " ", "$"]);
  });

  test("透明度は明るさの計算に使用しない", () => {
    const imageData = createImageData(3, 1, [
      [0, 0, 0, 0],
      [128, 128, 128, 128],
      [255, 255, 255, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", ":", "$"]);
  });

  test("2列×2行の画素の並び順を維持する", () => {
    const imageData = createImageData(2, 2, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([" ", "$", "$", " "]);
  });

  test("出力文字数が入力画素数と一致する", () => {
    const imageData = createImageData(3, 2, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [128, 128, 128, 255],
      [64, 64, 64, 255],
      [192, 192, 192, 255],
      [32, 32, 32, 255],
    ]);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toHaveLength(6);
    expect(result.every((glyph) => " .,:;$".includes(glyph))).toBe(true);
  });

  test("変換しても元の画素データを変更しない", () => {
    const imageData = createImageData(2, 1, [
      [20, 40, 60, 255],
      [180, 200, 220, 128],
    ]);

    const original = new Uint8ClampedArray(imageData.data);

    convertFrameToGlyphs(imageData);

    expect(imageData.data).toEqual(original);
  });

  test("同じImageDataを繰り返し変換しても結果が一致する", () => {
    const imageData = createImageData(2, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);

    const first = convertFrameToGlyphs(imageData);
    const second = convertFrameToGlyphs(imageData);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  test("画素数0の入力では空配列を返す", () => {
    const imageData = createImageData(0, 0, []);

    const result = convertFrameToGlyphs(imageData);

    expect(result).toEqual([]);
  });

  test("画素データが不足している場合はエラーになる", () => {
    const imageData = createImageData(2, 1, [[0, 0, 0, 255]]);

    expect(() => convertFrameToGlyphs(imageData)).toThrow("画像の画素データが不正です");
  });

  test("画素データが余分に存在する場合はエラーになる", () => {
    const imageData = createImageData(1, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);

    expect(() => convertFrameToGlyphs(imageData)).toThrow("画像の画素データが不正です");
  });

  test("RGBA情報が途中で欠けている場合はエラーになる", () => {
    const imageData = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0]),
      colorSpace: "srgb",
    } as ImageData;

    expect(() => convertFrameToGlyphs(imageData)).toThrow("画像の画素データが不正です");
  });

  test.each([
    { label: "横幅が負数", width: -1, height: 1 },
    { label: "高さが負数", width: 1, height: -1 },
    { label: "横幅が小数", width: 1.5, height: 1 },
    { label: "高さが小数", width: 1, height: 1.5 },
    { label: "横幅がNaN", width: Number.NaN, height: 1 },
    { label: "高さがNaN", width: 1, height: Number.NaN },
    { label: "横幅がInfinity", width: Infinity, height: 1 },
    { label: "高さがInfinity", width: 1, height: Infinity },
    { label: "横幅が安全な整数の範囲外", width: Number.MAX_SAFE_INTEGER + 1, height: 1 },
    { label: "高さが安全な整数の範囲外", width: 1, height: Number.MAX_SAFE_INTEGER + 1 },
    { label: "画素数の積が安全な整数の範囲外", width: Number.MAX_SAFE_INTEGER, height: 2 },
  ])("画像の$label場合はエラーになる", ({ width, height }) => {
    const imageData = createImageData(width, height, []);

    expect(() => convertFrameToGlyphs(imageData)).toThrow("画像の画素データが不正です");
  });
});
