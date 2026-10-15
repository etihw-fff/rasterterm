import assert from "node:assert/strict";

import { browser } from "@wdio/globals";

type FileSpec = {
  name: string;
  nonempty: boolean;
};

type MessageBoxOptions = {
  type: string;
  title: string;
  message: string;
  buttons: string[];
};

const readDialogState = () =>
  browser.electron.execute((electron) => {
    const dialog = electron.dialog as unknown as {
      showMessageBox: {
        mock?: {
          calls: [unknown, MessageBoxOptions][];
        };
      };
    };

    const calls = dialog.showMessageBox.mock?.calls ?? [];
    const latest = calls.at(-1);

    return {
      count: calls.length,
      options: latest?.[1] ?? null,
    };
  });

const dropFiles = (files: FileSpec[]) =>
  browser.execute((specs: FileSpec[]) => {
    const transfer = new DataTransfer();

    for (const spec of specs) {
      const content = spec.nonempty ? "test-content" : "";

      const file = new File([content], spec.name, {
        type: "application/octet-stream",
      });

      transfer.items.add(file);
    }

    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    });

    window.dispatchEvent(event);

    return event.defaultPrevented;
  }, files);

const expectErrorDialog = async (files: FileSpec[], expectedMessage: string): Promise<void> => {
  const prevented = await dropFiles(files);

  assert.equal(prevented, true, "ドロップイベントが処理されませんでした");

  await browser.waitUntil(
    async () => {
      const state = await readDialogState();
      return state.count === 1;
    },
    {
      timeout: 5000,
      interval: 100,
      timeoutMsg: "Main Processでエラーダイアログが呼び出されませんでした",
    },
  );

  const state = await readDialogState();

  assert.ok(state, "ダイアログの呼び出し結果を取得できません");
  assert.equal(state.count, 1);

  const options = state.options;

  assert.ok(options, "ダイアログの設定を取得できません");

  assert.equal(options.type, "error");
  assert.equal(options.title, "RasterTerm");
  assert.equal(options.message, expectedMessage);
  assert.deepEqual(options.buttons, ["OK"]);
};

describe("RasterTerm 動画ファイルのエラー E2E", () => {
  before(async () => {
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

    const dialogMock = await browser.electron.mock("dialog", "showMessageBox");

    await dialogMock.mockResolvedValue({
      response: 0,
      checkboxChecked: false,
    });
  });

  beforeEach(async () => {
    await browser.electron.clearAllMocks("dialog");
  });

  after(async () => {
    await browser.electron.restoreAllMocks("dialog");
  });

  it("非対応ファイルを拒否してエラーダイアログを呼び出す", async () => {
    await expectErrorDialog(
      [{ name: "document.txt", nonempty: true }],
      "対応していないファイル形式です。MP4、MOV、WebMを指定してください。",
    );
  });

  it("複数ファイルを拒否してエラーダイアログを呼び出す", async () => {
    await expectErrorDialog(
      [
        { name: "first.mp4", nonempty: true },
        { name: "second.webm", nonempty: true },
      ],
      "一度に読み込める動画ファイルは1つだけです。",
    );
  });

  it("0バイトの動画を拒否してエラーダイアログを呼び出す", async () => {
    await expectErrorDialog(
      [{ name: "empty.mp4", nonempty: false }],
      "ファイルのサイズが0バイトです。",
    );
  });
});
