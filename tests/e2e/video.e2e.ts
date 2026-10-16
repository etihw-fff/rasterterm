import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { browser } from "@wdio/globals";

// 1秒、48×32px、VP8/WebM形式のテスト動画。
// FFmpegのtestsrcから生成した固定テストデータ。
const VIDEO_BASE64 =
  "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";

type Fixtures = {
  directory: string;
  indexPath: string;
  mediaDirectory: string;
  paths: string[];
  previousPaths: { userData: string; videos: string };
};

let fixtures: Fixtures | null = null;

// Electronで本当のファイルパスを持つFileを取得するため、実際のディスクに作る。
// Library保存先もテスト用に切り替え、ユーザーの保存データには触れない。
before(async () => {
  const directory = await mkdtemp(join(tmpdir(), "rasterterm-drop-e2e-"));
  const userData = join(directory, "userData");
  const videos = join(directory, "videos");
  await mkdir(userData, { recursive: true });
  await mkdir(videos, { recursive: true });

  const bytes = Buffer.from(VIDEO_BASE64, "base64");
  const paths = ["initial.webm", "first.webm", "second.webm", "third.webm", "fourth.webm"].map(
    (name) => join(directory, name),
  );

  for (const path of paths) {
    await writeFile(path, bytes);
  }

  const previousPaths = await browser.electron.execute(
    (electron, nextUserData: string, nextVideos: string) => {
      const old = {
        userData: electron.app.getPath("userData"),
        videos: electron.app.getPath("videos"),
      };
      electron.app.setPath("userData", nextUserData);
      electron.app.setPath("videos", nextVideos);
      return old;
    },
    userData,
    videos,
  );

  fixtures = {
    directory,
    indexPath: join(userData, "library.json"),
    mediaDirectory: join(videos, "RasterTerm", "Library", "media"),
    paths,
    previousPaths,
  };
});

after(async () => {
  const current = fixtures;
  fixtures = null;
  if (current === null) {
    return;
  }

  try {
    await browser.electron.execute(
      (electron, previousUserData: string, previousVideos: string) => {
        electron.app.setPath("userData", previousUserData);
        electron.app.setPath("videos", previousVideos);
      },
      current.previousPaths.userData,
      current.previousPaths.videos,
    );
  } finally {
    await rm(current.directory, { recursive: true, force: true });
  }
});

const getFixtures = (): Fixtures => {
  if (fixtures === null) {
    throw new Error("E2Eの一時ディレクトリが未設定です。");
  }
  return fixtures;
};

const readLibrary = async (): Promise<{ items: { id: string; storedName: string }[] }> => {
  const content = await readFile(getFixtures().indexPath, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("items" in parsed) ||
    !Array.isArray(parsed.items)
  ) {
    throw new Error("Library登録情報が不正です。");
  }

  const items: { id: string; storedName: string }[] = [];
  for (const candidate of parsed.items as unknown[]) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("id" in candidate) ||
      !("storedName" in candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.storedName !== "string"
    ) {
      throw new Error("Library登録項目が不正です。");
    }
    items.push({ id: candidate.id, storedName: candidate.storedName });
  }
  return { items };
};

const waitForDropReady = async (): Promise<void> => {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const event = new DragEvent("dragover", { bubbles: true, cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    { timeout: 10000, interval: 100, timeoutMsg: "D&Dイベントが登録されていません" },
  );
};

// JSでnew File()を作るとgetPathForFileが空文字列を返すため、file inputを使用。
const dropDiskFile = async (path: string): Promise<boolean> => {
  await browser.execute(() => {
    const existing = document.querySelector("#rasterterm-e2e-file");
    if (existing !== null) {
      throw new Error("前回のテスト用inputが残っています");
    }
    const input = document.createElement("input");
    input.id = "rasterterm-e2e-file";
    input.type = "file";
    document.body.append(input);
  });

  try {
    await browser.$("#rasterterm-e2e-file").setValue(path);

    return await browser.execute(() => {
      const input = document.querySelector<HTMLInputElement>("#rasterterm-e2e-file");
      const file = input?.files?.item(0);
      if (file === null || file === undefined) {
        throw new Error("実ファイルを選択できませんでした");
      }
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  } finally {
    await browser.execute(() => {
      document.querySelector("#rasterterm-e2e-file")?.remove();
    });
  }
};

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
    return { width: canvas.width, brightPixels };
  });

describe("RasterTerm 動画再生 E2E", () => {
  it("実ファイルのD&DからLibrary登録・ASCII表示・黒侵食・ループ再開まで動作する", async () => {
    await waitForDropReady();
    const initialCanvas = await readCanvas();
    const source = getFixtures().paths[0];
    assert.ok(source);
    assert.equal(await dropDiskFile(source), true);

    await browser.waitUntil(
      async () => {
        try {
          const library = await readLibrary();
          return library.items.length === 1;
        } catch {
          return false;
        }
      },
      { timeout: 10000, interval: 100, timeoutMsg: "D&Dされた動画がLibraryに登録されませんでした" },
    );

    const library = await readLibrary();
    const storedName = library.items[0]?.storedName;
    assert.ok(storedName);
    assert.deepEqual(
      await readFile(join(getFixtures().mediaDirectory, storedName)),
      await readFile(source),
    );

    await browser.waitUntil(
      async () => {
        const state = await readCanvas();
        return state.width !== initialCanvas.width && state.brightPixels > 150;
      },
      { timeout: 10000, interval: 100, timeoutMsg: "Library登録した動画のASCII表示に失敗しました" },
    );

    await browser.waitUntil(async () => (await readCanvas()).brightPixels === 0, {
      timeout: 8000,
      interval: 100,
      timeoutMsg: "ループ時の黒侵食が完了しませんでした",
    });
    await browser.pause(300);
    assert.equal((await readCanvas()).brightPixels, 0);
    await browser.waitUntil(async () => (await readCanvas()).brightPixels > 150, {
      timeout: 8000,
      interval: 100,
      timeoutMsg: "ループ後に映像が表示されませんでした",
    });
  });
});

type VideoSwitchState = { videos: HTMLVideoElement[] };
type VideoSwitchWindow = Window & { __rastertermE2ESwitch?: VideoSwitchState };

const readSwitchState = () =>
  browser.execute(() => {
    const state = (window as VideoSwitchWindow).__rastertermE2ESwitch;
    if (state === undefined) {
      throw new Error("動画切り替えテストの記録がありません");
    }
    return state.videos.map((video) => ({
      src: video.getAttribute("src"),
      paused: video.paused,
      readyState: video.readyState,
      currentTime: video.currentTime,
    }));
  });

describe("RasterTerm 動画切り替え E2E", () => {
  it("再生中とReveal中の切り替えで旧動画を破棄し、重複動画も再生できる", async () => {
    const descriptor = await browser.execute(() => {
      const state: VideoSwitchState = { videos: [] };
      (window as VideoSwitchWindow).__rastertermE2ESwitch = state;
      const previous = Object.getOwnPropertyDescriptor(document, "createElement");
      const original = Reflect.get(document, "createElement") as (
        this: Document,
        tagName: string,
        options?: ElementCreationOptions,
      ) => HTMLElement;
      Object.defineProperty(document, "createElement", {
        configurable: true,
        value: (tagName: string, options?: ElementCreationOptions) => {
          const element = original.call(document, tagName, options);
          if (element instanceof HTMLVideoElement) {
            state.videos.push(element);
          }
          return element;
        },
      });
      // Descriptor is not serialized across the WebDriver boundary; save in the window.
      if (previous !== undefined) {
        (
          window as VideoSwitchWindow & { __rtPreviousCreate?: PropertyDescriptor }
        ).__rtPreviousCreate = previous;
      }
      return true;
    });
    assert.equal(descriptor, true);

    try {
      const paths = getFixtures().paths;
      for (let step = 0; step < 4; step += 1) {
        const path = paths[step + 1];
        assert.ok(path);
        assert.equal(await dropDiskFile(path), true);

        await browser.waitUntil(
          async () => {
            const videos = await readSwitchState();
            const current = videos[step];
            if (current === undefined) {
              return false;
            }

            if (step === 2) {
              // 3本目がRevealへ進む前に存在することを確認。
              return current.readyState >= 2 && current.paused && current.src !== null;
            }
            return !current.paused && current.currentTime > 0.05;
          },
          {
            timeout: 10000,
            interval: 25,
            timeoutMsg: `動画${String(step + 1)}の状態が更新されませんでした`,
          },
        );

        // 3本目はRevealの途中で4本目へ切り替える。
        if (step === 2) {
          continue;
        }

        if (step > 0) {
          const videos = await readSwitchState();
          const previous = videos[step - 1];
          assert.ok(previous);
          assert.equal(previous.src, null, "前の動画のsrcが解放されていません");
          assert.equal(previous.paused, true);
        }
      }

      const videos = await readSwitchState();
      assert.equal(videos.length, 4);
      for (const old of videos.slice(0, 3)) {
        assert.equal(old.src, null);
        assert.equal(old.paused, true);
      }
      assert.ok(videos[3]?.src?.startsWith("http://127.0.0.1:"));

      // 同じ内容の複数ファイルはSHA-256で再利用し、新規コピーを増やさない。
      assert.equal((await readLibrary()).items.length, 1);
    } finally {
      await browser.execute(() => {
        const previous = (window as VideoSwitchWindow & { __rtPreviousCreate?: PropertyDescriptor })
          .__rtPreviousCreate;
        if (previous === undefined) {
          Reflect.deleteProperty(document, "createElement");
        } else {
          Object.defineProperty(document, "createElement", previous);
        }
        delete (window as VideoSwitchWindow & { __rtPreviousCreate?: PropertyDescriptor })
          .__rtPreviousCreate;
        delete (window as VideoSwitchWindow).__rastertermE2ESwitch;
      });
    }
  });
});
