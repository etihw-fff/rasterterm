import type { IntroState, StartupInfo } from "./terminal/intro";
import { drawIntro, FONT } from "./terminal/intro";

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

  if (canvas === null) {
    throw new Error("Canvasが見つかりませんでした。");
  }

  // 型をHTMLCanvasElementに確定させる
  const canvasElement: HTMLCanvasElement = canvas;

  // Mainから起動情報を取得
  const startupInfo = await getStartupInfo();

  // VGAフォントの読み込み完了を待つ
  await document.fonts.load(FONT);

  const state: IntroState = {
    showLogo: false,
    showGuide: false,
  };

  function redraw(): void {
    drawIntro(canvasElement, startupInfo, state);
  }

  // ウィンドウサイズが変わったら再描画
  window.addEventListener("resize", redraw);

  // ① 起動情報を表示
  redraw();

  // ② 1.2秒後にロゴ全体を表示
  await sleep(1200);

  state.showLogo = true;
  redraw();

  // ③ 0.3秒後にD&D案内を表示
  await sleep(300);

  state.showGuide = true;
  redraw();
}
