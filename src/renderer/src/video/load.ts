export type LoadedVideo = {
  video: HTMLVideoElement;
  dispose: () => void;
};

const isGalleryVideoUrl = (source: string): boolean => {
  try {
    const url = new URL(source);

    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port !== "" &&
      /^\/video\/[0-9a-f]{64}\/[a-zA-Z0-9_-]+$/.test(url.pathname) &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

export const loadVideo = (source: File | string, signal?: AbortSignal): Promise<LoadedVideo> => {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("動画の読み込みが中断されました", "AbortError"));
  }

  return new Promise<LoadedVideo>((resolve, reject) => {
    const video = document.createElement("video");

    video.muted = true;
    video.volume = 0;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";

    let objectUrl: string | null = null;
    let sourceUrl: string;

    try {
      if (typeof source === "string") {
        if (!isGalleryVideoUrl(source)) {
          throw new Error("動画の参照URLが不正です。");
        }

        // HTTP配信された動画をCanvasへ描画するためCORSを利用する。
        video.crossOrigin = "anonymous";
        sourceUrl = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        sourceUrl = objectUrl;
      }
    } catch (error: unknown) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let settled = false;
    let disposed = false;

    function removeLoadListeners(): void {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onLoadError);
      signal?.removeEventListener("abort", onAbort);
    }

    function dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      removeLoadListeners();

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } finally {
        if (objectUrl !== null) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }

    function rejectLoad(error: Error): void {
      if (settled) {
        return;
      }

      settled = true;

      try {
        dispose();
      } finally {
        reject(error);
      }
    }

    function onLoadedData(): void {
      if (settled) {
        return;
      }

      const { videoWidth, videoHeight } = video;

      if (
        !Number.isFinite(videoWidth) ||
        !Number.isFinite(videoHeight) ||
        videoWidth <= 0 ||
        videoHeight <= 0
      ) {
        rejectLoad(new Error("動画のサイズが不正です"));
        return;
      }

      settled = true;
      removeLoadListeners();

      resolve({
        video,
        dispose,
      });
    }

    function onLoadError(): void {
      rejectLoad(new Error("動画を読み込めませんでした"));
    }

    function onAbort(): void {
      rejectLoad(new DOMException("動画の読み込みが中断されました", "AbortError"));
    }

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onLoadError);
    signal?.addEventListener("abort", onAbort);

    if (signal?.aborted) {
      onAbort();
      return;
    }

    try {
      video.src = sourceUrl;
      video.load();
    } catch (error: unknown) {
      rejectLoad(
        error instanceof Error ? error : new Error("動画の読み込みを開始できませんでした"),
      );
    }
  });
};
