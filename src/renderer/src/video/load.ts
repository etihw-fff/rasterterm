export type LoadedVideo = {
  video: HTMLVideoElement;
  dispose: () => void;
};

export const loadVideo = (file: File, signal?: AbortSignal): Promise<LoadedVideo> => {
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

    let objectUrl: string;

    try {
      objectUrl = URL.createObjectURL(file);
    } catch (error) {
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
        URL.revokeObjectURL(objectUrl);
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
      video.src = objectUrl;
      video.load();
    } catch (error) {
      rejectLoad(
        error instanceof Error ? error : new Error("動画の読み込みを開始できませんでした"),
      );
    }
  });
};
