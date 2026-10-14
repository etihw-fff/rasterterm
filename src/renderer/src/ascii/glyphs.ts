const GLYPHS = [" ", ".", ",", ":", ";", "$"];

export const luminanceToGlyph = (luminance: number): string => {
  if (!Number.isFinite(luminance) || luminance < 0 || luminance > 255) {
    throw new Error(`不正な輝度値です:  ${String(luminance)}`);
  }
  const index = Math.floor((luminance * 6) / 256);
  const glyph = GLYPHS[index];
  if (!glyph) {
    throw new Error(`文字の割り当てに失敗しました。インデックスが範囲外です: ${String(index)}`);
  }
  return glyph;
};
