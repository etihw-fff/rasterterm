import assert from "node:assert/strict";

import { browser } from "@wdio/globals";

type RasterTermWindow = Window & {
  rasterterm?: {
    getStartupInfo: () => Promise<{
      path: string;
      startedAt: number;
    }>;
    showError: (message: string) => Promise<void>;
  };
  require?: unknown;
};

describe("RasterTerm Electron E2E", () => {
  it("ウィンドウが起動し、ASCII表示用Canvasが存在する", async () => {
    await browser.waitUntil(async () => (await browser.getTitle()) === "RasterTerm", {
      timeout: 10000,
      timeoutMsg: "RasterTermウィンドウが起動しませんでした",
    });

    const canvas = browser.$("#ascii-canvas");

    await canvas.waitForDisplayed();

    assert.equal(await browser.getTitle(), "RasterTerm");
    assert.equal(await canvas.getAttribute("role"), "img");
  });

  it("Preload経由でMain Processから起動情報を取得できる", async () => {
    const result = await browser.execute(async () => {
      const appWindow = window as RasterTermWindow;
      const bridge = appWindow.rasterterm;

      if (bridge === undefined) {
        return null;
      }

      const info = await bridge.getStartupInfo();

      return {
        path: info.path,
        startedAt: info.startedAt,
        showErrorAvailable: typeof bridge.showError === "function",
        nodeRequireExposed: typeof appWindow.require !== "undefined",
      };
    });

    assert.ok(result, "Preloadの公開APIが存在しません");

    assert.ok(result.path.length > 0);
    assert.ok(Number.isFinite(result.startedAt));
    assert.ok(result.startedAt > 0);

    assert.equal(result.showErrorAvailable, true);
    assert.equal(result.nodeRequireExposed, false);
  });

  it("Main Processが不正なエラーメッセージを拒否する", async () => {
    const result = await browser.execute(async () => {
      const bridge = (window as RasterTermWindow).rasterterm;

      if (bridge === undefined) {
        return "Preload APIが見つかりません";
      }

      try {
        await bridge.showError("");

        return "不正なメッセージが受理されました";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    assert.match(result, /エラーメッセージが不正です/);
  });

  it("起動画面のCanvasに白い文字が描画される", async () => {
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("#ascii-canvas");

          if (canvas === null || canvas.width === 0 || canvas.height === 0) {
            return false;
          }

          const context = canvas.getContext("2d");

          if (context === null) {
            return false;
          }

          const dpr = window.devicePixelRatio || 1;
          const width = Math.min(canvas.width, Math.round(320 * dpr));
          const height = Math.min(canvas.height, Math.round(72 * dpr));

          const { data } = context.getImageData(0, 0, width, height);

          for (let index = 0; index < data.length; index += 4) {
            const red = data[index] ?? 0;
            const green = data[index + 1] ?? 0;
            const blue = data[index + 2] ?? 0;

            if (red > 180 && green > 180 && blue > 180) {
              return true;
            }
          }

          return false;
        }),
      {
        timeout: 10000,
        interval: 100,
        timeoutMsg: "Canvasに起動文字が描画されませんでした",
      },
    );
  });

  it("ウィンドウのリサイズに合わせてCanvasが再調整される", async () => {
    await browser.electron.execute((electron) => {
      const mainWindow = electron.BrowserWindow.getAllWindows()[0];

      if (mainWindow === undefined) {
        throw new Error("RasterTermのメインウィンドウが見つかりません");
      }

      mainWindow.setContentSize(1120, 720);
    });

    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const viewport = document.querySelector<HTMLElement>("#app");
          const canvas = document.querySelector<HTMLCanvasElement>("#ascii-canvas");

          if (viewport === null || canvas === null) {
            return false;
          }

          return (
            viewport.clientWidth >= 900 &&
            canvas.clientWidth >= viewport.clientWidth &&
            canvas.clientHeight >= viewport.clientHeight
          );
        }),
      {
        timeout: 10000,
        interval: 100,
        timeoutMsg: "リサイズ後にCanvasが表示領域へ追従しませんでした",
      },
    );
  });
});
