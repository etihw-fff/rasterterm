import type { IntroState, StartupInfo } from "./terminal/intro";
import { drawIntro, FONT } from "./terminal/intro";
import { registerVideoDrop } from "./video/drop";
import type { LoadedVideo } from "./video/load";
import { loadVideo } from "./video/load";
import type { VideoPlaybackController } from "./video/playback";
import { createVideoPlayback } from "./video/playback";
import type { VideoTransition } from "./video/transition";
import { createVideoTransition } from "./video/transition";
import type { FileSelectionError } from "./video/validate";

const FILE_ERROR_MESSAGES: Record<FileSelectionError, string> = {
  empty: "動画ファイルが選択されていません。",
  multiple: "一度に読み込める動画ファイルは1つだけです。",
  "empty-file": "ファイルのサイズが0バイトです。",
  unsupported: "対応していないファイル形式です。MP4、MOV、WebMを指定してください。",
};

export async function getStartupInfo(): Promise<StartupInfo> {
  try {
    return await window.rasterterm.getStartupInfo();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("起動情報の取得に失敗しました:", message);

    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function startApp(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#ascii-canvas");
  const viewport = document.querySelector<HTMLElement>("#app");

  if (canvas === null) {
    throw new Error("Canvasが見つかりませんでした。");
  }

  if (viewport === null) {
    throw new Error("表示領域が見つかりませんでした。");
  }

  const canvasElement: HTMLCanvasElement = canvas;
  const viewportElement: HTMLElement = viewport;

  // Main Processから起動情報を取得する。
  const startupInfo = await getStartupInfo();

  // VGAフォントの読み込み完了を待つ。
  await document.fonts.load(FONT);

  const state: IntroState = {
    showLogo: false,
    showGuide: false,
  };

  let screen: "intro" | "video" = "intro";
  let loadedVideo: LoadedVideo | null = null;
  let playback: VideoPlaybackController | null = null;
  let transition: VideoTransition | null = null;
  let loadingController: AbortController | null = null;
  let requestId = 0;
  let disposed = false;

  function redrawIntro(): void {
    if (screen !== "intro" || disposed) {
      return;
    }

    drawIntro(canvasElement, startupInfo, state);
  }

  function showError(error: unknown): void {
    if (disposed) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    void window.rasterterm.showError(message).catch((dialogError: unknown) => {
      console.error("OS標準ダイアログの表示に失敗しました:", dialogError);
    });
  }

  function disposeVideo(): void {
    const currentTransition = transition;
    const currentPlayback = playback;
    const currentVideo = loadedVideo;

    transition = null;
    playback = null;
    loadedVideo = null;

    // アニメーションとイベント監視を終了する。
    currentTransition?.dispose();

    // 再生制御と動画リソースを解放する。
    try {
      currentPlayback?.dispose();
    } finally {
      currentVideo?.dispose();
    }
  }

  async function handleVideoFile(file: File): Promise<void> {
    const currentRequest = ++requestId;

    // 前の読み込みを中断する。
    loadingController?.abort();

    const controller = new AbortController();
    loadingController = controller;

    try {
      // 前の動画を破棄する。
      disposeVideo();

      screen = "intro";
      redrawIntro();

      // 新しい動画を読み込む。
      const resource = await loadVideo(file, controller.signal);

      if (disposed || currentRequest !== requestId) {
        resource.dispose();
        return;
      }

      loadedVideo = resource;

      // ASCII動画の描画・再生制御を作成する。
      const nextPlayback = createVideoPlayback({
        video: resource.video,
        canvas: canvasElement,
        viewport: viewportElement,
        mode: "fit",
        onError: (error: unknown) => {
          if (!disposed && currentRequest === requestId) {
            showError(error);
          }
        },
      });

      playback = nextPlayback;

      // 初回Revealとループ時のTRANSITIONを作成する。
      const nextTransition = createVideoTransition({
        video: resource.video,
        canvas: canvasElement,
        playback: nextPlayback,
        onError: (error: unknown) => {
          if (!disposed && currentRequest === requestId) {
            showError(error);
          }
        },
      });

      transition = nextTransition;
      screen = "video";

      // 先頭フレームをRevealしてから動画再生を開始する。
      await nextTransition.start();
    } catch (error) {
      if (disposed || currentRequest !== requestId || controller.signal.aborted) {
        return;
      }

      try {
        disposeVideo();
      } finally {
        screen = "intro";
        redrawIntro();
        showError(error);
      }
    } finally {
      if (loadingController === controller) {
        loadingController = null;
      }
    }
  }

  function handleResize(): void {
    if (disposed) {
      return;
    }

    if (screen === "video") {
      playback?.resize();
    } else {
      redrawIntro();
    }
  }

  // 起動情報を最初に表示する。
  redrawIntro();

  // ウィンドウのリサイズに対応する。
  window.addEventListener("resize", handleResize);

  // ドラッグ＆ドロップを登録する。
  const unregisterDrop = registerVideoDrop(
    (file: File) => {
      void handleVideoFile(file);
    },
    (reason: FileSelectionError) => {
      showError(FILE_ERROR_MESSAGES[reason]);
    },
  );

  // アプリ終了時にリソースを解放する。
  window.addEventListener(
    "beforeunload",
    () => {
      disposed = true;
      requestId += 1;

      loadingController?.abort();
      unregisterDrop();

      window.removeEventListener("resize", handleResize);

      disposeVideo();
    },
    { once: true },
  );

  // ① 起動情報のみを表示して1.2秒待つ。
  await sleep(1200);

  // ② ASCIIロゴの全行を一括表示する。
  state.showLogo = true;
  redrawIntro();

  // ③ 0.3秒後にドラッグ＆ドロップ案内を表示する。
  await sleep(300);

  state.showGuide = true;
  redrawIntro();
}
