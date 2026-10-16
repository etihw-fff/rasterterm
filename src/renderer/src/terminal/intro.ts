import type { FontSize } from "../../../shared/settings";
import { getCanvasFont } from "../ascii/font";

export type StartupInfo = {
  path: string;
  startedAt: number;
};

export type IntroState = {
  showLogo: boolean;
  showGuide: boolean;
};

const PADDING = 16;
const SECTION_GAP = 24;

const GUIDE_TEXT = "drop mp4, mov or webm here";

const LOGO_LINES = [
  String.raw`    _     ____    ____   ___   ___`,
  String.raw`   / \   / ___|  / ___| |_ _| |_ _|`,
  String.raw`  / _ \  \___ \ | |      | |   | |`,
  String.raw` / ___ \  ___) || |___   | |   | |`,
  String.raw`/_/   \_\|____/  \____| |___| |___|`,
];

export function drawIntro(
  canvas: HTMLCanvasElement,
  info: StartupInfo,
  state: IntroState,
  fontSize: FontSize,
): void {
  const LINE_HEIGHT = fontSize;
  const FONT = getCanvasFont(fontSize);
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvasの2Dコンテキストを取得できませんでした。");
  }

  const container = canvas.parentElement;

  if (container === null) {
    throw new Error("Canvasの親要素が見つかりませんでした。");
  }

  // 起動情報の文字列を作成する。
  const time = new Date(info.startedAt).toTimeString().slice(0, 8);
  const startupText = `[${time}] ${info.path} >`;

  // 各表示要素の位置を計算する。
  const logoTop = PADDING + LINE_HEIGHT + SECTION_GAP;
  const guideTop = logoTop + LOGO_LINES.length * LINE_HEIGHT + SECTION_GAP;

  // 全テキストを収めるために必要な幅を計算する。
  context.font = FONT;

  const textWidths = [startupText, ...LOGO_LINES, GUIDE_TEXT].map(
    (text) => context.measureText(text).width,
  );

  const requiredWidth = Math.ceil(Math.max(...textWidths)) + PADDING * 2;
  const requiredHeight = guideTop + LINE_HEIGHT + PADDING;

  const width = Math.max(container.clientWidth, requiredWidth);
  const height = Math.max(container.clientHeight, requiredHeight);

  canvas.style.width = `${String(width)}px`;
  canvas.style.height = `${String(height)}px`;

  // Retinaなどの高解像度ディスプレイに対応する。
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 背景を黒く描画する。
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // ターミナル用の文字設定を適用する。
  context.font = FONT;
  context.fillStyle = "#ffffff";
  context.textBaseline = "top";
  context.textAlign = "left";

  // ① 起動情報
  context.fillText(startupText, PADDING, PADDING);

  // ② ASCIIロゴは全行を一括表示する。
  if (state.showLogo) {
    LOGO_LINES.forEach((line, index) => {
      context.fillText(line, PADDING, logoTop + index * LINE_HEIGHT);
    });
  }

  // ③ ドラッグ＆ドロップ案内
  if (state.showGuide) {
    context.fillText(GUIDE_TEXT, PADDING, guideTop);
  }
}
