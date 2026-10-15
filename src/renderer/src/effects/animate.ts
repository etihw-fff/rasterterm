export const animateRows = (
  durationMs: number,
  draw: (progress: number) => void,
  signal: AbortSignal,
): Promise<boolean> =>
  new Promise<boolean>((resolve, reject) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    let frameId: number | null = null;
    let startTime: number | null = null;

    const cleanup = (): void => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }

      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      resolve(false);
    };

    const tick = (timestamp: number): void => {
      frameId = null;

      if (signal.aborted) {
        onAbort();
        return;
      }

      startTime ??= timestamp;

      const progress = Math.min(1, (timestamp - startTime) / durationMs);

      try {
        draw(progress);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (progress >= 1) {
        cleanup();
        resolve(true);
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    try {
      draw(0);
      frameId = requestAnimationFrame(tick);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
