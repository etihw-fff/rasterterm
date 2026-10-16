import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { browser } from "@wdio/globals";

type GalleryEvent = { type: "play"; id: string; url?: string } | { type: "removed"; ids: string[] };

type TestWindow = Window & {
  rasterterm?: {
    onGalleryEvent: (listener: (event: GalleryEvent) => void) => () => void;
  };
  galleryEvents?: GalleryEvent[];
  loadedGalleryUrls?: string[];
  originalCreateElement?: PropertyDescriptor | undefined;
  unsubscribeGalleryTest?: () => void;
};

type GalleryItem = {
  id: string;
  storedName: string;
};

type DialogState = {
  selectedPaths: string[];
  notices: string[];
  errors: string[];
  openCalls: number;
  descriptors: {
    showOpenDialog: PropertyDescriptor | undefined;
    showMessageBox: PropertyDescriptor | undefined;
    showErrorBox: PropertyDescriptor | undefined;
  };
};

const readFixture = async (): Promise<Buffer> => {
  const source = await readFile(join(process.cwd(), "tests/e2e/video.e2e.ts"), "utf8");

  const base64 = /const VIDEO_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(source)?.[1];

  if (base64 === undefined) {
    throw new Error("WebMテスト動画が見つかりません。");
  }

  return Buffer.from(base64, "base64");
};

const readLibraryItem = async (path: string): Promise<GalleryItem> => {
  const content = await readFile(path, "utf8");
  const value: unknown = JSON.parse(content);

  if (
    typeof value !== "object" ||
    value === null ||
    !("items" in value) ||
    !Array.isArray(value.items)
  ) {
    throw new Error("Libraryの登録情報が不正です。");
  }

  const item: unknown = value.items[0];

  if (
    typeof item !== "object" ||
    item === null ||
    !("id" in item) ||
    typeof item.id !== "string" ||
    !("storedName" in item) ||
    typeof item.storedName !== "string"
  ) {
    throw new Error("登録動画が見つかりません。");
  }

  return {
    id: item.id,
    storedName: item.storedName,
  };
};

const installDialogs = async (): Promise<void> => {
  await browser.electron.execute((electron) => {
    const globalState = globalThis as typeof globalThis & {
      galleryDialogState?: DialogState;
    };

    const state: DialogState = {
      selectedPaths: [],
      notices: [],
      errors: [],
      openCalls: 0,
      descriptors: {
        showOpenDialog: Object.getOwnPropertyDescriptor(electron.dialog, "showOpenDialog"),
        showMessageBox: Object.getOwnPropertyDescriptor(electron.dialog, "showMessageBox"),
        showErrorBox: Object.getOwnPropertyDescriptor(electron.dialog, "showErrorBox"),
      },
    };

    globalState.galleryDialogState = state;

    Object.defineProperty(electron.dialog, "showOpenDialog", {
      configurable: true,
      writable: true,
      value: () => {
        state.openCalls += 1;

        return Promise.resolve({
          canceled: state.selectedPaths.length === 0,
          filePaths: [...state.selectedPaths],
        });
      },
    });

    Object.defineProperty(electron.dialog, "showMessageBox", {
      configurable: true,
      writable: true,
      value: (_window: unknown, options: { message: string }) => {
        state.notices.push(options.message);

        return Promise.resolve({
          response: 0,
          checkboxChecked: false,
        });
      },
    });

    Object.defineProperty(electron.dialog, "showErrorBox", {
      configurable: true,
      writable: true,
      value: (title: string, message: string) => {
        state.errors.push(`${title}: ${message}`);
      },
    });
  });
};

const setSelection = async (filePath: string): Promise<void> => {
  await browser.electron.execute((_electron, path: string) => {
    const globalState = globalThis as typeof globalThis & {
      galleryDialogState?: DialogState;
    };

    const state = globalState.galleryDialogState;

    if (state === undefined) {
      throw new Error("ダイアログのモックがありません。");
    }

    state.selectedPaths = [path];
  }, filePath);
};

const readDiagnostics = async () => {
  return browser.electron.execute((_electron) => {
    const globalState = globalThis as typeof globalThis & {
      galleryDialogState?: DialogState;
    };

    const state = globalState.galleryDialogState;

    if (state === undefined) {
      throw new Error("ダイアログの記録がありません。");
    }

    return {
      openCalls: state.openCalls,
      notices: [...state.notices],
      errors: [...state.errors],
    };
  });
};

const restoreDialogs = async (): Promise<void> => {
  await browser.electron.execute((electron) => {
    const globalState = globalThis as typeof globalThis & {
      galleryDialogState?: DialogState;
    };

    const state = globalState.galleryDialogState;

    if (state === undefined) {
      return;
    }

    const restore = (key: keyof DialogState["descriptors"]): void => {
      const descriptor = state.descriptors[key];

      if (descriptor === undefined) {
        Reflect.deleteProperty(electron.dialog, key);
      } else {
        Object.defineProperty(electron.dialog, key, descriptor);
      }
    };

    restore("showOpenDialog");
    restore("showMessageBox");
    restore("showErrorBox");

    delete globalState.galleryDialogState;
  });
};

const clickGallery = async (label: "追加..." | "選択..."): Promise<void> => {
  await browser.electron.execute((electron, name: string) => {
    const menu = electron.Menu.getApplicationMenu();
    const gallery = menu?.items.find((item) => item.label === "ギャラリー");
    const target = gallery?.submenu?.items.find((item) => item.label === name);

    if (target === undefined || !target.enabled || typeof target.click !== "function") {
      throw new Error(`メニューが使用できません: ${name}`);
    }

    Reflect.apply(target.click, target, []);
  }, label);
};

const waitForGallery = async (
  condition: () => Promise<boolean>,
  message: string,
): Promise<void> => {
  try {
    await browser.waitUntil(condition, {
      timeout: 12000,
      interval: 100,
      timeoutMsg: message,
    });
  } catch (error: unknown) {
    const diagnostics = await readDiagnostics();

    throw new Error(
      [
        message,
        `エラー: ${JSON.stringify(diagnostics.errors)}`,
        `通知: ${JSON.stringify(diagnostics.notices)}`,
        `ダイアログ回数: ${String(diagnostics.openCalls)}`,
      ].join("\n"),
      { cause: error },
    );
  }
};

const readCanvasSignature = (): Promise<string> =>
  browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#ascii-canvas");
    const context = canvas?.getContext("2d");
    if (canvas === null || context === null || context === undefined) {
      throw new Error("ASCII Canvasが見つかりません。");
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 4) {
      hash = Math.imul(hash ^ (pixels[i] ?? 0), 16777619);
    }
    return `${String(canvas.width)}x${String(canvas.height)}:${String(hash >>> 0)}`;
  });

const readPlaybackState = async () => {
  return browser.execute(() => {
    const state = window as TestWindow;

    return {
      events: state.galleryEvents ?? [],
      loadedUrls: state.loadedGalleryUrls ?? [],
    };
  });
};

describe("RasterTerm ギャラリー E2E", () => {
  it("動画を追加し、Library経由で再生・再選択できる", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rasterterm-gallery-e2e-"));

    const userdata = join(directory, "userdata");
    const videos = join(directory, "videos");
    const source = join(directory, "sample.webm");

    await mkdir(userdata, { recursive: true });
    await mkdir(videos, { recursive: true });
    await writeFile(source, await readFixture());

    const indexPath = join(userdata, "library.json");

    let originalPaths: {
      userData: string;
      videos: string;
    } | null = null;

    let dialogsInstalled = false;

    try {
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const event = new DragEvent("dragover", {
              cancelable: true,
            });

            window.dispatchEvent(event);

            return event.defaultPrevented;
          }),
        {
          timeout: 10000,
          interval: 100,
        },
      );

      originalPaths = await browser.electron.execute(
        (electron, dataPath: string, videoPath: string) => {
          const previous = {
            userData: electron.app.getPath("userData"),
            videos: electron.app.getPath("videos"),
          };

          electron.app.setPath("userData", dataPath);
          electron.app.setPath("videos", videoPath);

          return previous;
        },
        userdata,
        videos,
      );

      await installDialogs();
      dialogsInstalled = true;

      // 初期ログとロゴが表示されるまで待って、復帰先のCanvasを保存する。
      await browser.pause(1600);
      const introSignature = await readCanvasSignature();

      await browser.execute(() => {
        const state = window as TestWindow;
        const bridge = state.rasterterm;

        if (bridge === undefined) {
          throw new Error("Preload APIがありません。");
        }

        state.galleryEvents = [];
        state.loadedGalleryUrls = [];

        state.unsubscribeGalleryTest = bridge.onGalleryEvent((event) => {
          state.galleryEvents?.push(event);
        });

        state.originalCreateElement = Object.getOwnPropertyDescriptor(document, "createElement");

        const original = Reflect.get(document, "createElement") as (
          this: Document,
          tagName: string,
          options?: ElementCreationOptions,
        ) => HTMLElement;

        Object.defineProperty(document, "createElement", {
          configurable: true,
          writable: true,
          value: (tagName: string, options?: ElementCreationOptions) => {
            const element = original.call(document, tagName, options);

            if (element instanceof HTMLVideoElement) {
              element.addEventListener("loadeddata", () => {
                state.loadedGalleryUrls?.push(element.src);
              });
            }

            return element;
          },
        });
      });

      // ① メニューから追加する。
      await setSelection(source);
      await clickGallery("追加...");

      await waitForGallery(async () => {
        try {
          await readLibraryItem(indexPath);
          return true;
        } catch {
          return false;
        }
      }, "動画がLibraryに登録されませんでした。");

      const item = await readLibraryItem(indexPath);

      const copiedPath = join(videos, "RasterTerm", "Library", "media", item.storedName);

      assert.deepEqual(await readFile(copiedPath), await readFile(source));

      // ② 再生通知に認証付きローカルURLが含まれる。
      await waitForGallery(async () => {
        const state = await readPlaybackState();

        return state.events.some(
          (event) =>
            event.type === "play" &&
            event.id === item.id &&
            typeof event.url === "string" &&
            event.url.startsWith("http://127.0.0.1:"),
        );
      }, "ギャラリーの再生通知が届きませんでした。");

      const firstState = await readPlaybackState();

      const playEvent = firstState.events.find(
        (event) => event.type === "play" && event.id === item.id,
      );

      if (playEvent?.type !== "play" || playEvent.url === undefined) {
        throw new Error("再生URLが通知されていません。");
      }

      const playbackUrl = playEvent.url;

      // ③ 動画データがローカルHTTP経由で読み込まれる。
      await waitForGallery(async () => {
        const state = await readPlaybackState();

        return state.loadedUrls.includes(playbackUrl);
      }, "Library内のWebMが読み込まれませんでした。");

      // ④ 選択メニューから再生し直す。
      await setSelection(copiedPath);
      await clickGallery("選択...");

      await waitForGallery(async () => {
        const state = await readPlaybackState();

        return state.loadedUrls.filter((url) => url === playbackUrl).length >= 2;
      }, "再選択した動画が読み込まれませんでした。");

      assert.deepEqual(await readLibraryItem(indexPath), item);

      const diagnostics = await readDiagnostics();

      assert.equal(diagnostics.openCalls, 2);
      assert.deepEqual(diagnostics.errors, []);
      assert.deepEqual(diagnostics.notices, []);

      // 削除通知で再生中の映像が黒侵食を経て待機画面に戻ることを確認する。
      // 実際のゴミ箱操作は行わないため、テスト用動画をOSのゴミ箱に残さない。
      await waitForGallery(
        async () => (await readCanvasSignature()) !== introSignature,
        "再選択した動画のCanvasに映像が表示されませんでした。",
      );
      await browser.electron.execute((electron, id: string) => {
        for (const activeWindow of electron.BrowserWindow.getAllWindows()) {
          activeWindow.webContents.send("rasterterm:gallery-event", {
            type: "removed",
            ids: [id],
          });
        }
      }, item.id);
      await waitForGallery(
        async () => (await readCanvasSignature()) === introSignature,
        "動画の削除通知後に待機画面へ戻りませんでした。",
      );
      const lastState = await readPlaybackState();
      assert.ok(
        lastState.events.some((event) => event.type === "removed" && event.ids.includes(item.id)),
      );
    } finally {
      try {
        await browser.execute(() => {
          const state = window as TestWindow;

          state.unsubscribeGalleryTest?.();

          const original = state.originalCreateElement;

          if (original === undefined) {
            Reflect.deleteProperty(document, "createElement");
          } else {
            Object.defineProperty(document, "createElement", original);
          }

          delete state.galleryEvents;
          delete state.loadedGalleryUrls;
          delete state.unsubscribeGalleryTest;
          delete state.originalCreateElement;
        });
      } finally {
        try {
          if (dialogsInstalled) {
            await restoreDialogs();
          }
        } finally {
          try {
            if (originalPaths !== null) {
              await browser.electron.execute(
                (electron, dataPath: string, videoPath: string) => {
                  electron.app.setPath("userData", dataPath);
                  electron.app.setPath("videos", videoPath);
                },
                originalPaths.userData,
                originalPaths.videos,
              );
            }
          } finally {
            await rm(directory, {
              recursive: true,
              force: true,
            });
          }
        }
      }
    }
  });
});
