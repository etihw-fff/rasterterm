import assert from "node:assert/strict";

import { browser } from "@wdio/globals";

// 1秒、48×32px、VP8/WebM形式のテスト動画。
// FFmpegのtestsrcから生成した固定テストデータ。
const VIDEO_BASE64 =
  "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";

const readCanvas = () =>
  browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ascii-canvas");

    if (canvas === null) {
      return { width: 0, brightPixels: 0 };
    }

    const context = canvas.getContext("2d");

    if (context === null || canvas.width === 0 || canvas.height === 0) {
      return { width: canvas.width, brightPixels: 0 };
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    let brightPixels = 0;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;

      if (red > 180 && green > 180 && blue > 180) {
        brightPixels += 1;
      }
    }

    return {
      width: canvas.width,
      brightPixels,
    };
  });

describe("RasterTerm 動画再生 E2E", () => {
  it("WebMをドロップしてASCII表示・黒侵食・ループ再開まで動作する", async () => {
    // ドロップイベントが登録されるまで待つ。
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const event = new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
          });

          window.dispatchEvent(event);

          return event.defaultPrevented;
        }),
      {
        timeout: 10000,
        interval: 100,
        timeoutMsg: "ドラッグ＆ドロップの登録が完了しませんでした",
      },
    );

    const initialCanvas = await readCanvas();

    // テスト動画をElectronのRenderer内でFileに復元してドロップする。
    const dropResult = await browser.execute((base64: string) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const file = new File([bytes], "rasterterm-e2e.webm", { type: "video/webm" });

      const transfer = new DataTransfer();
      transfer.items.add(file);

      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });

      window.dispatchEvent(event);

      return {
        fileSize: file.size,
        defaultPrevented: event.defaultPrevented,
      };
    }, VIDEO_BASE64);

    assert.ok(dropResult.fileSize > 0, "テスト用WebMが空です");
    assert.equal(dropResult.defaultPrevented, true);

    // 初回Reveal後に動画のASCII文字が描画されることを確認。
    await browser.waitUntil(
      async () => {
        const state = await readCanvas();

        return state.width !== initialCanvas.width && state.brightPixels > 150;
      },
      {
        timeout: 10000,
        interval: 100,
        timeoutMsg: "動画のASCIIフレームが描画されませんでした",
      },
    );

    // ループ終端で黒侵食が完了するまで待つ。
    await browser.waitUntil(
      async () => {
        const state = await readCanvas();

        return state.brightPixels === 0;
      },
      {
        timeout: 8000,
        interval: 100,
        timeoutMsg: "ループ終端で黒画面になりませんでした",
      },
    );

    // 黒画面の保持時間中であることを確認。
    await browser.pause(300);

    const blackState = await readCanvas();

    assert.equal(blackState.brightPixels, 0, "黒画面の保持中に映像が表示されました");

    // 先頭フレームのRevealが終わり、ASCII映像が再表示される。
    await browser.waitUntil(
      async () => {
        const state = await readCanvas();

        return state.brightPixels > 150;
      },
      {
        timeout: 8000,
        interval: 100,
        timeoutMsg: "ループ後にASCII映像が再表示されませんでした",
      },
    );
  });
});

type VideoSwitchState = {
  createdUrls: string[];
  revokedUrls: string[];
  videos: HTMLVideoElement[];
};

type VideoSwitchWindow = Window & {
  __rastertermE2ESwitch?: VideoSwitchState;
};

const readSwitchState = () =>
  browser.execute(() => {
    const state = (window as VideoSwitchWindow).__rastertermE2ESwitch;

    if (state === undefined) {
      throw new Error("動画切り替えテストの記録がありません");
    }

    return {
      createdUrls: [...state.createdUrls],
      revokedUrls: [...state.revokedUrls],
      videos: state.videos.map((video) => ({
        src: video.getAttribute("src"),
        paused: video.paused,
        readyState: video.readyState,
        currentTime: video.currentTime,
      })),
    };
  });

const dropSwitchVideo = (name: string) =>
  browser.execute(
    (fileName: string, base64: string) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const file = new File([bytes], fileName, { type: "video/webm" });

      const transfer = new DataTransfer();
      transfer.items.add(file);

      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });

      window.dispatchEvent(event);

      return event.defaultPrevented;
    },
    name,
    VIDEO_BASE64,
  );

describe("RasterTerm 動画切り替え E2E", () => {
  it("再生中とReveal中の切り替えで古い動画を破棄する", async () => {
    // 動画生成とBlob URLの作成・解放を記録する。
    await browser.execute(() => {
      const state: VideoSwitchState = {
        createdUrls: [],
        revokedUrls: [],
        videos: [],
      };

      (window as VideoSwitchWindow).__rastertermE2ESwitch = state;

      const originalCreateElement = Reflect.get(document, "createElement") as (
        this: Document,
        tagName: string,
        options?: ElementCreationOptions,
      ) => HTMLElement;

      Object.defineProperty(document, "createElement", {
        configurable: true,
        value: (tagName: string, options?: ElementCreationOptions) => {
          const element = originalCreateElement.call(document, tagName, options);

          if (element instanceof HTMLVideoElement) {
            state.videos.push(element);
          }

          return element;
        },
      });

      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);

      URL.createObjectURL = (object) => {
        const url = originalCreateObjectURL(object);
        state.createdUrls.push(url);
        return url;
      };

      URL.revokeObjectURL = (url) => {
        state.revokedUrls.push(url);
        originalRevokeObjectURL(url);
      };
    });

    // ① 最初の動画を通常再生する。
    assert.equal(await dropSwitchVideo("first.webm"), true);

    await browser.waitUntil(
      async () => {
        const state = await readSwitchState();
        const first = state.videos[0];

        return first !== undefined && !first.paused && first.currentTime > 0.05;
      },
      {
        timeout: 10000,
        interval: 50,
        timeoutMsg: "最初の動画が再生されませんでした",
      },
    );

    // ② 再生中に2本目へ切り替える。
    assert.equal(await dropSwitchVideo("second.webm"), true);

    await browser.waitUntil(
      async () => {
        const state = await readSwitchState();
        const first = state.videos[0];
        const second = state.videos[1];
        const firstUrl = state.createdUrls[0];

        return (
          first !== undefined &&
          second !== undefined &&
          firstUrl !== undefined &&
          first.src === null &&
          first.paused &&
          state.revokedUrls.includes(firstUrl) &&
          !second.paused &&
          second.currentTime > 0.05
        );
      },
      {
        timeout: 10000,
        interval: 50,
        timeoutMsg: "再生中の動画切り替えと旧動画の破棄が完了しませんでした",
      },
    );

    // ③ 3本目を読み込み、Reveal中であることを確認する。
    assert.equal(await dropSwitchVideo("third.webm"), true);

    await browser.waitUntil(
      async () => {
        const state = await readSwitchState();
        const third = state.videos[2];

        return third !== undefined && third.readyState >= 2 && third.paused && third.src !== null;
      },
      {
        timeout: 10000,
        interval: 25,
        timeoutMsg: "3本目の動画がReveal前の読み込み状態になりませんでした",
      },
    );

    // ④ Revealの途中で4本目へ切り替える。
    assert.equal(await dropSwitchVideo("fourth.webm"), true);

    await browser.waitUntil(
      async () => {
        const state = await readSwitchState();
        const third = state.videos[2];
        const fourth = state.videos[3];
        const thirdUrl = state.createdUrls[2];

        return (
          third !== undefined &&
          fourth !== undefined &&
          thirdUrl !== undefined &&
          third.src === null &&
          third.paused &&
          state.revokedUrls.includes(thirdUrl) &&
          !fourth.paused &&
          fourth.currentTime > 0.05
        );
      },
      {
        timeout: 10000,
        interval: 50,
        timeoutMsg: "Reveal中の動画切り替えが完了しませんでした",
      },
    );

    // ⑤ 最終確認：旧動画3本は破棄、最後の動画だけが有効。
    const state = await readSwitchState();

    assert.equal(state.createdUrls.length, 4);
    assert.equal(state.videos.length, 4);

    for (let index = 0; index < 3; index += 1) {
      const video = state.videos[index];
      const url = state.createdUrls[index];

      assert.ok(video, `動画${String(index + 1)}が記録されていません`);
      assert.ok(url, `動画${String(index + 1)}のBlob URLがありません`);

      assert.equal(video.src, null);
      assert.equal(video.paused, true);
      assert.ok(state.revokedUrls.includes(url));
    }

    const fourth = state.videos[3];
    const fourthUrl = state.createdUrls[3];

    assert.ok(fourth, "最後の動画が存在しません");
    assert.ok(fourthUrl, "最後の動画のBlob URLがありません");

    assert.notEqual(fourth.src, null);
    assert.equal(state.revokedUrls.includes(fourthUrl), false);
  });
});
