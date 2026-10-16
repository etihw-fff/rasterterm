import type { AppSettings } from "../../shared/settings";
import { wipeCanvas } from "./effects/wipe";
import type { IntroState, StartupInfo } from "./terminal/intro";
import { drawIntro, FONT } from "./terminal/intro";
import { registerVideoDrop } from "./video/drop";
import type { LoadedVideo } from "./video/load";
import { loadVideo } from "./video/load";
import type { VideoPlaybackController } from "./video/playback";
import { createVideoPlayback } from "./video/playback";
import type { VideoTransition } from "./video/transition";
import { createVideoTransition, waitWhileBlack } from "./video/transition";
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

  const startupInfo = await getStartupInfo();
  const initialSettings = await window.rasterterm.getSettings();

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
  let removingController: AbortController | null = null;
  let requestId = 0;
  let switchVisualRequest: number | null = null;
  let interruptedVideo: LoadedVideo | null = null;
  let disposed = false;

  let activeGalleryId: string | null = null;

  let displayMode: AppSettings["displayMode"] = initialSettings.displayMode;
  let loopStyle: AppSettings["loopStyle"] = initialSettings.loopStyle;

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

    currentTransition?.dispose();

    try {
      currentPlayback?.dispose();
    } finally {
      currentVideo?.dispose();
    }
  }

  async function handleVideoFile(
    source: File | string,
    galleryId: string | null = null,
  ): Promise<void> {
    removingController?.abort();
    removingController = null;
    const currentRequest = ++requestId;

    // 前の切り替えが途中なら、新しい要求が描画状態の管理を引き継ぐ。
    if (switchVisualRequest !== null) {
      switchVisualRequest = currentRequest;
    }

    loadingController?.abort();
    const controller = new AbortController();
    loadingController = controller;

    const requestIsStale = (): boolean =>
      disposed || controller.signal.aborted || currentRequest !== requestId;

    let replacedOldVideo = false;
    let pendingResource: LoadedVideo | null = null;

    try {
      // 読み込みが終わるまでは旧映像を消さない。失敗しても再生を維持する。
      const resource = await loadVideo(source, controller.signal);
      pendingResource = resource;

      if (requestIsStale()) {
        resource.dispose();
        return;
      }

      const wasPlaying = screen === "video" && loadedVideo !== null;

      if (wasPlaying) {
        // 旧映像のフレーム描画とループ演出を止め、最後の映像を残す。
        transition?.dispose();
        playback?.pause();
        interruptedVideo = loadedVideo;
        switchVisualRequest = currentRequest;

        const wiped = await wipeCanvas(canvasElement, controller.signal);
        if (!wiped || requestIsStale()) {
          resource.dispose();
          return;
        }

        const waited = await waitWhileBlack(controller.signal);
        if (!waited || requestIsStale()) {
          resource.dispose();
          return;
        }
      }

      if (requestIsStale()) {
        resource.dispose();
        return;
      }

      disposeVideo();
      interruptedVideo = null;
      replacedOldVideo = true;
      loadedVideo = resource;
      pendingResource = null;
      activeGalleryId = galleryId;

      const nextPlayback = createVideoPlayback({
        video: resource.video,
        canvas: canvasElement,
        viewport: viewportElement,
        mode: () => displayMode,
        onError: (error: unknown) => {
          if (!disposed && currentRequest === requestId) {
            showError(error);
          }
        },
      });

      playback = nextPlayback;

      const nextTransition = createVideoTransition({
        video: resource.video,
        canvas: canvasElement,
        playback: nextPlayback,
        loopStyle,
        onError: (error: unknown) => {
          if (!disposed && currentRequest === requestId) {
            showError(error);
          }
        },
      });

      transition = nextTransition;
      screen = "video";

      // 動画の切り替え時はLoop Styleに関係なく必ずRevealする。
      switchVisualRequest = currentRequest;
      await nextTransition.start();
    } catch (error: unknown) {
      if (requestIsStale()) {
        return;
      }

      // 黒侵食を始めた後で読み込みが中断・失敗した場合は、
      // 停止中の旧動画を再開し、Loop Style の監視も復元する。
      if (!replacedOldVideo && interruptedVideo !== null && loadedVideo === interruptedVideo) {
        const oldVideo = loadedVideo;
        const oldPlayback = playback;
        interruptedVideo = null;
        if (oldPlayback !== null) {
          transition?.dispose();
          transition = createVideoTransition({
            video: oldVideo.video,
            canvas: canvasElement,
            playback: oldPlayback,
            loopStyle,
            onError: showError,
          });
          try {
            oldPlayback.resize();
            await oldPlayback.resume();
          } catch (resumeError: unknown) {
            showError(resumeError);
          }
        }
      }
      if (replacedOldVideo) {
        disposeVideo();
        activeGalleryId = null;
        screen = "intro";
        redrawIntro();
      }
      showError(error);
    } finally {
      if (switchVisualRequest === currentRequest) {
        switchVisualRequest = null;
      }
      pendingResource?.dispose();
      if (loadingController === controller) {
        loadingController = null;
      }
    }
  }

  async function returnToIntroAfterRemoval(): Promise<void> {
    // 古い非同期読み込み・再生・演出を停止してから黒侵食を開始する。
    const currentRequest = ++requestId;
    loadingController?.abort();
    activeGalleryId = null;
    interruptedVideo = null;
    removingController?.abort();

    const controller = new AbortController();
    removingController = controller;

    transition?.dispose();
    playback?.pause();

    try {
      if (screen === "video" && loadedVideo !== null) {
        await wipeCanvas(canvasElement, controller.signal);
      }
    } catch (error: unknown) {
      if (!disposed && !controller.signal.aborted && requestId === currentRequest) {
        showError(error);
      }
    } finally {
      // 再生切り替えが始まった場合、古い完了処理で新しいCanvasを消さない。
      if (removingController === controller) {
        removingController = null;
        if (!disposed && !controller.signal.aborted && requestId === currentRequest) {
          disposeVideo();
          screen = "intro";
          redrawIntro();
          viewportElement.scrollLeft = 0;
          viewportElement.scrollTop = 0;
        }
      }
    }
  }

  const isVisualEffectActive = (): boolean =>
    switchVisualRequest !== null ||
    interruptedVideo !== null ||
    removingController !== null ||
    transition?.isAnimating() === true;

  function handleResize(): void {
    if (disposed) {
      return;
    }

    if (screen === "video") {
      if (!isVisualEffectActive()) {
        playback?.resize();
      }
    } else {
      redrawIntro();
    }
  }

  const unsubscribeSettings = window.rasterterm.onSettingsChanged((settings) => {
    const displayModeChanged = displayMode !== settings.displayMode;
    const loopStyleChanged = loopStyle !== settings.loopStyle;

    displayMode = settings.displayMode;
    loopStyle = settings.loopStyle;

    if (loopStyleChanged) {
      transition?.setLoopStyle(loopStyle);
    }

    if (displayModeChanged && loadedVideo !== null && !isVisualEffectActive()) {
      playback?.resize();
    }
  });

  const unsubscribeGallery = window.rasterterm.onGalleryEvent((event) => {
    if (disposed) {
      return;
    }

    if (event.type === "play") {
      if (event.url === undefined) {
        showError(new Error("ギャラリー動画の再生URLがありません。"));
        return;
      }

      void handleVideoFile(event.url, event.id);
      return;
    }

    if (activeGalleryId !== null && event.ids.includes(activeGalleryId)) {
      void returnToIntroAfterRemoval();
    }
  });

  redrawIntro();

  window.addEventListener("resize", handleResize);

  // 動画をLibraryに登録し、Mainの再生通知で読み込む。
  const unregisterDrop = registerVideoDrop(
    (file: File) => {
      void window.rasterterm.importDroppedVideo(file).catch((error: unknown) => {
        showError(error);
      });
    },
    (reason: FileSelectionError) => {
      showError(FILE_ERROR_MESSAGES[reason]);
    },
  );

  window.addEventListener(
    "beforeunload",
    () => {
      disposed = true;
      requestId += 1;

      loadingController?.abort();
      removingController?.abort();
      unregisterDrop();
      unsubscribeSettings();
      unsubscribeGallery();

      window.removeEventListener("resize", handleResize);

      disposeVideo();
    },
    { once: true },
  );

  await sleep(1200);

  state.showLogo = true;
  redrawIntro();

  await sleep(300);

  state.showGuide = true;
  redrawIntro();
}
