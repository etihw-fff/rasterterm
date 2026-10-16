import type { FontSize } from "../../../shared/settings";

// RasterTerm VGA is an 8x16 font: keep the same 1:2 cell proportions at every size.
export const getFontMetrics = (fontSize: FontSize): { cellWidth: number; cellHeight: number } => ({
  cellWidth: fontSize / 2,
  cellHeight: fontSize,
});

export const getCanvasFont = (fontSize: FontSize): string =>
  `${String(fontSize)}px "RasterTerm VGA"`;
