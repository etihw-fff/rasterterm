import type { FontSize } from "../../../shared/settings";
import { getCanvasFont, getFontMetrics } from "./font";
import type { GridResult } from "./grid";

type DrawAsciiFrame = (
  context: CanvasRenderingContext2D,
  glyphs: readonly string[],
  grid: GridResult,
  fontSize: FontSize,
) => void;

export const drawAsciiFrame: DrawAsciiFrame = (context, glyphs, grid, fontSize) => {
  const { cellHeight } = getFontMetrics(fontSize);
  const expectedLength = grid.columns * grid.rows;

  if (glyphs.length !== expectedLength) {
    throw new Error(
      `ASCII文字数が一致しません: ${String(glyphs.length)}文字 (必要: ${String(expectedLength)}文字)`,
    );
  }

  if (context.canvas.width !== grid.canvasWidth) {
    context.canvas.width = grid.canvasWidth;
  }

  if (context.canvas.height !== grid.canvasHeight) {
    context.canvas.height = grid.canvasHeight;
  }

  context.font = getCanvasFont(fontSize);
  context.textAlign = "left";
  context.textBaseline = "top";

  context.fillStyle = "#000000";
  context.fillRect(0, 0, grid.canvasWidth, grid.canvasHeight);

  context.fillStyle = "#FFFFFF";

  for (let row = 0; row < grid.rows; row++) {
    const startIndex = row * grid.columns;
    const endIndex = startIndex + grid.columns;
    const line = glyphs.slice(startIndex, endIndex).join("");
    const y = row * cellHeight;

    context.fillText(line, 0, y);
  }
};
