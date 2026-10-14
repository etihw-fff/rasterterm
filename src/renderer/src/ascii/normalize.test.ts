import { describe, expect, test } from "vitest";

import { normalizeLuminance } from "./normalize";

describe("明るさの正規化のテスト", () => {
  test("空配列を渡すと空配列が返る", () => {
    const result = normalizeLuminance([]);
    expect(result).toStrictEqual([]);
  });

  test("すべて同じ明るさなら、その値を維持した新しい配列を返す", () => {
    // 1. [100, 100, 100] を変数 originalValues に格納する
    const originalValues = [100.0, 100.0, 100.0];

    // 2. originalValues を normalizeLuminance に渡す
    const result = normalizeLuminance(originalValues);

    // 3. 戻り値の内容が元の配列と一致することを確認する
    expect(result).toStrictEqual([100.0, 100.0, 100.0]);

    // 4. 戻り値とoriginalValuesが、同じ配列オブジェクトではないことも確認する
    expect(result).not.toBe(originalValues);
  });

  test("2%・98%を基準として正しい明るさに変換される", () => {
    const dummyLuminances = Array.from({ length: 51 }, (_, i) => i);
    const result = normalizeLuminance(dummyLuminances);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);

    expect(result[49]).toBe(255);
    expect(result[50]).toBe(255);

    expect(result[25]).toBe(127.5);
  });

  test("計算結果が0〜255の範囲を超えない", () => {
    const result = normalizeLuminance([-1000, 0, 50, 100, 200, 9999]);
    const isWithinRange = result.every((value) => value >= 0 && value <= 255);

    expect(isWithinRange).toBe(true);
  });

  test("元の配列が変更されない", () => {
    const originalValues = [50.0, 10.0, 100.0, 30.0];
    const expectedSnapshot = [...originalValues];

    normalizeLuminance(originalValues);

    expect(originalValues).toStrictEqual(expectedSnapshot);
  });

  test("元の配列の要素順が維持される", () => {
    const originalValues = [100.0, 10.0, 50.0];

    const result = normalizeLuminance(originalValues);

    expect(result[0]).toBe(255);
    expect(result[1]).toBe(0);
    expect(result[2]).toBeLessThan(255);
    expect(result[2]).toBeGreaterThan(0);
  });
});
