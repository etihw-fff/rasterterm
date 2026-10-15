import { animateRows } from "./animate";

const CELL_HEIGHT = 16;
const WIPE_MS = 400;

export const wipeCanvas = (canvas: HTMLCanvasElement, signal: AbortSignal): Promise<boolean> =>
  animateRows(
    WIPE_MS,
    (progress) => {
      const context = canvas.getContext("2d");

      if (context === null) {
        throw new Error("黒侵食用のCanvasを取得できませんでした");
      }

      const rows = Math.ceil(canvas.height / CELL_HEIGHT);
      const coveredHeight = Math.min(canvas.height, Math.ceil(rows * progress) * CELL_HEIGHT);

      context.resetTransform();
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, coveredHeight);
    },
    signal,
  );
