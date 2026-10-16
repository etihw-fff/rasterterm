import type { FontSize } from "../../../shared/settings";
import { getFontMetrics } from "./font";

export type GridOptions = {
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  mode: "fit" | "scroll";
  fontSize: FontSize;
};

export type GridResult = {
  columns: number;
  rows: number;
  canvasWidth: number;
  canvasHeight: number;
};

export const calculateGrid = (options: GridOptions): GridResult => {
  const { videoWidth, videoHeight, viewportWidth, viewportHeight, mode, fontSize } = options;
  const { cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT } = getFontMetrics(fontSize);

  const sizes = [videoWidth, videoHeight, viewportWidth, viewportHeight];

  for (const size of sizes) {
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`サイズ指定が不正です: ${String(size)} (有限の正の数値を指定してください)`);
    }
  }

  if (viewportWidth < CELL_WIDTH) {
    throw new Error(
      `表示領域の幅が足りません: ${String(viewportWidth)}px (${String(CELL_WIDTH)}px以上に設定してください)`,
    );
  }

  if (viewportHeight < CELL_HEIGHT) {
    throw new Error(
      `表示領域の高さが足りません: ${String(viewportHeight)}px (${String(CELL_HEIGHT)}px以上に設定してください)`,
    );
  }

  const maxColumns = Math.floor(viewportWidth / CELL_WIDTH);
  const maxRows = Math.floor(viewportHeight / CELL_HEIGHT);
  const aspectRatio = videoHeight / videoWidth;

  switch (mode) {
    case "fit": {
      const availableWidth = maxColumns * CELL_WIDTH;
      const availableHeight = maxRows * CELL_HEIGHT;

      const scale = Math.min(availableWidth / videoWidth, availableHeight / videoHeight);

      const columns = Math.max(
        1,
        Math.min(maxColumns, Math.round((videoWidth * scale) / CELL_WIDTH)),
      );

      const rows = Math.max(1, Math.min(maxRows, Math.round((videoHeight * scale) / CELL_HEIGHT)));

      const canvasWidth = columns * CELL_WIDTH;
      const canvasHeight = rows * CELL_HEIGHT;

      return { columns, rows, canvasWidth, canvasHeight };
    }

    case "scroll": {
      if (videoWidth >= videoHeight) {
        const rows = maxRows;

        const columns = Math.max(1, Math.round((rows * CELL_HEIGHT) / (CELL_WIDTH * aspectRatio)));

        const canvasWidth = columns * CELL_WIDTH;
        const canvasHeight = rows * CELL_HEIGHT;

        return { columns, rows, canvasWidth, canvasHeight };
      }

      const columns = maxColumns;

      const rows = Math.max(1, Math.round((columns * CELL_WIDTH * aspectRatio) / CELL_HEIGHT));

      const canvasWidth = columns * CELL_WIDTH;
      const canvasHeight = rows * CELL_HEIGHT;

      return { columns, rows, canvasWidth, canvasHeight };
    }
  }
};
