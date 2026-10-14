import { describe, expect, test } from "vitest";

import { calculateLuminance } from "./luminance";

describe("Rec.709の係数を使った加重平均のテスト", () => {
  test("黒 (0, 0, 0)", () => {
    const y = calculateLuminance(0, 0, 0);
    expect(y).toBe(0);
  });

  test("白 (255, 255, 255)", () => {
    const y = calculateLuminance(255, 255, 255);
    expect(y).toBeCloseTo(255);
  });

  test("赤 (255, 0, 0)", () => {
    const y = calculateLuminance(255, 0, 0);
    expect(y).toBeCloseTo(54.213);
  });

  test("緑 (0, 255, 0)", () => {
    const y = calculateLuminance(0, 255, 0);
    expect(y).toBeCloseTo(182.376);
  });

  test("青 (0, 0, 255)", () => {
    const y = calculateLuminance(0, 0, 255);
    expect(y).toBeCloseTo(18.411);
  });

  test("グレー (128, 128, 128)", () => {
    const y = calculateLuminance(128, 128, 128);
    expect(y).toBe(128);
  });
});
