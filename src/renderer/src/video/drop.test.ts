import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { registerVideoDrop } from "./drop";
import type { FileSelectionError } from "./validate";

type FileHandler = (file: File) => void;
type FileError = (error: FileSelectionError) => void;

const fileMp4 = new File([new Uint8Array(100)], "movie.mp4", {
  type: "video/mp4",
});
const fileMov = new File([new Uint8Array(100)], "movie.MOV", {
  type: "video/quicktime",
});
const fileWebm = new File([new Uint8Array(100)], "movie.webm", {
  type: "video/webm",
});
const fileGif = new File([new Uint8Array(100)], "movie.gif", {
  type: "image/gif",
});
const fileEmpty = new File([], "empty.mp4", {
  type: "video/mp4",
});

const createFileList = (files: readonly File[]): FileList => {
  return Object.assign(
    {
      length: files.length,
      item: (index: number): File | null => files[index] ?? null,
    },
    files,
  );
};

const createDropEvent = (files: readonly File[] | null): Event => {
  const event = new Event("drop", { cancelable: true });

  Object.defineProperty(event, "dataTransfer", {
    value: files === null ? null : { files: createFileList(files) },
  });

  return event;
};

describe("動画ファイルのドラッグ＆ドロップ", () => {
  let mockWindow: EventTarget;
  let onFile: Mock<FileHandler>;
  let onError: Mock<FileError>;

  beforeEach(() => {
    mockWindow = new EventTarget();

    vi.stubGlobal("window", mockWindow);

    onFile = vi.fn<FileHandler>();
    onError = vi.fn<FileError>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const dispatchDrop = (files: readonly File[] | null): Event => {
    const event = createDropEvent(files);
    mockWindow.dispatchEvent(event);
    return event;
  };

  test("ドラッグ中とドロップ時のイベントが登録される", () => {
    const addEventListener = vi.spyOn(mockWindow, "addEventListener");

    registerVideoDrop(onFile, onError);

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledWith("dragover", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("drop", expect.any(Function));

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test("ドラッグ中のブラウザー標準動作を抑制する", () => {
    registerVideoDrop(onFile, onError);

    const event = new Event("dragover", { cancelable: true });

    mockWindow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test("MP4ファイルをドロップするとonFileに同一のファイルが渡される", () => {
    registerVideoDrop(onFile, onError);

    const event = dispatchDrop([fileMp4]);

    expect(event.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(fileMp4);
    expect(onFile.mock.calls[0]?.[0]).toBe(fileMp4);
    expect(onError).not.toHaveBeenCalled();
  });

  test("大文字拡張子のMOVファイルを受け付ける", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([fileMov]);

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(fileMov);
    expect(onFile.mock.calls[0]?.[0]).toBe(fileMov);
    expect(onError).not.toHaveBeenCalled();
  });

  test("WebMファイルを受け付ける", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([fileWebm]);

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(fileWebm);
    expect(onFile.mock.calls[0]?.[0]).toBe(fileWebm);
    expect(onError).not.toHaveBeenCalled();
  });

  test("GIFファイルをドロップするとunsupportedを通知する", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([fileGif]);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("unsupported");
  });

  test("複数ファイルをドロップするとmultipleを通知する", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([fileMp4, fileMov]);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("multiple");
  });

  test("ファイル一覧が空の場合はemptyを通知する", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([]);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("empty");
  });

  test("ドロップデータが存在しない場合はemptyを通知する", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop(null);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("empty");
  });

  test("0バイトの動画ファイルをドロップするとempty-fileを通知する", () => {
    registerVideoDrop(onFile, onError);

    dispatchDrop([fileEmpty]);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("empty-file");
  });

  test("解除関数を実行すると登録したイベントが解除される", () => {
    const addEventListener = vi.spyOn(mockWindow, "addEventListener");
    const removeEventListener = vi.spyOn(mockWindow, "removeEventListener");

    const unregister = registerVideoDrop(onFile, onError);

    expect(addEventListener).toHaveBeenCalledTimes(2);

    unregister();

    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener.mock.calls).toEqual(addEventListener.mock.calls);
  });

  test("イベント解除後はファイルをドロップしても通知されない", () => {
    const unregister = registerVideoDrop(onFile, onError);

    unregister();

    dispatchDrop([fileMp4]);

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
