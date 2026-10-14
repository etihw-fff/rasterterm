import { describe, expect, test } from "vitest";

import { luminanceToGlyph } from "./glyphs";

describe("明るさをASCII文字に変換するテスト", () => {
  // 12通りの「入力する明るさ」と「期待する文字」を配列として定義
  test.each([
    { luminance: 0, expected: " " },
    { luminance: 42, expected: " " },
    { luminance: 43, expected: "." },
    { luminance: 85, expected: "." },
    { luminance: 86, expected: "," },
    { luminance: 127, expected: "," },
    { luminance: 128, expected: ":" },
    { luminance: 170, expected: ":" },
    { luminance: 171, expected: ";" },
    { luminance: 213, expected: ";" },
    { luminance: 214, expected: "$" },
    { luminance: 255, expected: "$" },
  ])(
    "明るさ $luminance のとき、期待する文字 '$expected' が返ってくること",
    ({ luminance, expected }) => {
      const result = luminanceToGlyph(luminance);
      expect(result).toBe(expected);
    },
  );
  test.each([-1, 256, NaN, Infinity, -Infinity])(
    "不正な値 %s が渡されたとき、エラーが発生すること",
    (invalidValue) => {
      expect(() => luminanceToGlyph(invalidValue)).toThrow();
    },
  );
});
