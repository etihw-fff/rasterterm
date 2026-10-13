export type StartupInfo = {
  path: string;
  startedAt: number;
};

export type IntroState = {
  showLogo: boolean;
  showGuide: boolean;
};

export const FONT = '16px "RasterTerm VGA"';

const PADDING = 16;
const LINE_HEIGHT = 16;
const SECTION_GAP = 24;

const GUIDE_TEXT = "drop video or gif here";

const LOGO_LINES = [
  String.raw`    _     ____    ____   ___   ___`,
  String.raw`   / \   / ___|  / ___| |_ _| |_ _|`,
  String.raw`  / _ \  \___ \ | |      | |   | |`,
  String.raw` / ___ \  ___) || |___   | |   | |`,
  String.raw`/_/   \_\|____/  \____| |___| |___|`,
];

export function drawIntro(canvas: HTMLCanvasElement, info: StartupInfo, state: IntroState): void {
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvasの2Dコンテキストを取得できませんでした。");
  }

  const container = canvas.parentElement;

  if (container === null) {
    throw new Error("Canvasの親要素が見つかりませんでした。");
  }

  // 表示する文字列
  const time = new Date(info.startedAt).toTimeString().slice(0, 8);
  const startupText = `[${time}] ${info.path} >`;

  // 文字の描画位置は常に固定
  const logoTop = PADDING + LINE_HEIGHT + SECTION_GAP;

  const guideTop = logoTop + LOGO_LINES.length * LINE_HEIGHT + SECTION_GAP;

  // 文字サイズを固定して、必要な横幅を測定する
  context.font = FONT;

  const textWidths = [startupText, ...LOGO_LINES, GUIDE_TEXT].map(
    (text) => context.measureText(text).width,
  );

  const requiredWidth = Math.ceil(Math.max(...textWidths)) + PADDING * 2;

  // 最後の案内文まで収まる高さ
  const requiredHeight = guideTop + LINE_HEIGHT + PADDING;

  // ウィンドウより小さくはせず、
  // 内容がはみ出す場合だけCanvasを広げる
  const width = Math.max(container.clientWidth, requiredWidth);
  const height = Math.max(container.clientHeight, requiredHeight);

  // CSS上のCanvasサイズを設定
  canvas.style.width = `${String(width)}px`;
  canvas.style.height = `${String(height)}px`;

  // 高解像度ディスプレイに対応
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 背景
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  // フォントと描画設定
  context.font = FONT;
  context.fillStyle = "#ffffff";
  context.textBaseline = "top";
  context.textAlign = "left";

  // ① 起動情報
  context.fillText(startupText, PADDING, PADDING);

  // ② ASCIIロゴ
  if (state.showLogo) {
    LOGO_LINES.forEach((line, index) => {
      context.fillText(line, PADDING, logoTop + index * LINE_HEIGHT);
    });
  }

  // ③ D&D案内
  if (state.showGuide) {
    context.fillText(GUIDE_TEXT, PADDING, guideTop);
  }
}
