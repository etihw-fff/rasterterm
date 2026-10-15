import { animateRows } from "./animate";

const CELL_HEIGHT = 16;
const REVEAL_MS = 600;

export const revealCanvas = (
  canvas: HTMLCanvasElement,
  redraw: () => void,
  signal: AbortSignal,
): Promise<boolean> =>
  animateRows(
    REVEAL_MS,
    (progress) => {
      redraw();

      const context = canvas.getContext("2d");

      if (context === null) {
        throw new Error("Reveal用のCanvasを取得できませんでした");
      }

      const rows = Math.ceil(canvas.height / CELL_HEIGHT);
      const visibleHeight = Math.min(canvas.height, Math.floor(rows * progress) * CELL_HEIGHT);

      context.resetTransform();
      context.fillStyle = "#000000";
      context.fillRect(0, visibleHeight, canvas.width, canvas.height - visibleHeight);
    },
    signal,
  );
