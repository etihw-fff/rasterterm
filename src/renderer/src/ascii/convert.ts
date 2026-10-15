import { luminanceToGlyph } from "./glyphs";
import { calculateLuminance } from "./luminance";
import { normalizeLuminance } from "./normalize";

export const convertFrameToGlyphs = (imageData: ImageData): string[] => {
  const { width, height, data } = imageData;
  const pixelCount = width * height;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 0 ||
    height < 0 ||
    !Number.isSafeInteger(pixelCount) ||
    data.length !== pixelCount * 4
  ) {
    throw new Error("画像の画素データが不正です");
  }

  const luminances: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    if (r === undefined || g === undefined || b === undefined) {
      throw new Error("画素のRGB情報が不足しています");
    }

    luminances.push(calculateLuminance(r, g, b));
  }

  const normalized = normalizeLuminance(luminances);
  const glyphs = normalized.map((luminance) => luminanceToGlyph(luminance));

  return glyphs;
};
