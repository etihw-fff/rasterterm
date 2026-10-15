import { describe, expect, test } from "vitest";

import { validateMediaFiles } from "./validate";

const file1 = new File([new Uint8Array(100)], "movie1.mp4", {
  type: "video/mp4",
});
// 修正点: 拡張子を大文字の .MOV に変更
const file2 = new File([new Uint8Array(100)], "movie2.MOV", {
  type: "video/quicktime",
});
const file3 = new File([new Uint8Array(100)], "movie3.webm", {
  type: "video/webm",
});
const file4 = new File([new Uint8Array(100)], "movie4.gif", {
  type: "image/gif",
});
const file5 = new File([new Uint8Array(100)], "movie5.mp4.txt", {
  type: "text/plain",
});
const file6 = new File([], "movie6.mp4", {
  type: "video/mp4",
});
const file7 = new File([new Uint8Array(100)], "movie7.mp4", {});

const files = [file1, file2];

describe("動画ファイルの検証", () => {
  test("ファイルが0件の場合はemptyを返す", () => {
    const result = validateMediaFiles([]);
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  test("ファイルが2件の場合はmultipleを返す", () => {
    const result = validateMediaFiles(files);
    expect(result).toEqual({ ok: false, reason: "multiple" });
  });

  test("MP4ファイルを受け付け、入力と同一のファイルを返す", () => {
    const result = validateMediaFiles([file1]);
    expect(result).toEqual({ ok: true, file: file1 });
    if (!result.ok) {
      throw new Error("成功するはずの検証が失敗しました");
    }
    expect(result.file).toBe(file1);
  });

  // 修正点: 大文字のMOVを検証していることが分かる名称に変更
  test("大文字のMOVファイルを受け付け、入力と同一のファイルを返す", () => {
    const result = validateMediaFiles([file2]);
    expect(result).toEqual({ ok: true, file: file2 });
    if (!result.ok) {
      throw new Error("成功するはずの検証が失敗しました");
    }
    expect(result.file).toBe(file2);
  });

  test("WebMファイルを受け付け、入力と同一のファイルを返す", () => {
    const result = validateMediaFiles([file3]);
    expect(result).toEqual({ ok: true, file: file3 });
    if (!result.ok) {
      throw new Error("成功するはずの検証が失敗しました");
    }
    expect(result.file).toBe(file3);
  });

  test("GIFファイルの場合はunsupportedを返す", () => {
    const result = validateMediaFiles([file4]);
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  test("末尾の拡張子がTXTの場合はunsupportedを返す", () => {
    const result = validateMediaFiles([file5]);
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  test("ファイルサイズが0バイトの場合はempty-fileを返す", () => {
    const result = validateMediaFiles([file6]);
    expect(result).toEqual({ ok: false, reason: "empty-file" });
  });

  test("MIMEタイプが空でもMP4ファイルを受け付け、入力と同一のファイルを返す", () => {
    const result = validateMediaFiles([file7]);
    expect(result).toEqual({ ok: true, file: file7 });
    if (!result.ok) {
      throw new Error("成功するはずの検証が失敗しました");
    }
    expect(result.file).toBe(file7);
  });
});
