import { describe, expect, test, vi } from "vitest";

import { runGalleryOperation } from "./queue";

describe("Library操作の順番制御", () => {
  test("同時に要求した操作を1件ずつ順番に実行する", async () => {
    const events: string[] = [];

    let releaseFirst!: () => void;

    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runGalleryOperation(async () => {
      events.push("first-start");

      await gate;

      events.push("first-end");

      return 1;
    });

    const second = runGalleryOperation(() => {
      events.push("second-start");
      events.push("second-end");

      return Promise.resolve(2);
    });

    // 1件目の処理中に2件目が開始されないことを確認する。
    await vi.waitFor(() => {
      expect(events).toStrictEqual(["first-start"]);
    });

    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toStrictEqual([1, 2]);

    expect(events).toStrictEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  test("前の操作が失敗しても次の操作を実行できる", async () => {
    const events: string[] = [];

    const first = runGalleryOperation(() => {
      events.push("first");

      return Promise.reject(new Error("保存エラー"));
    });

    const second = runGalleryOperation(() => {
      events.push("second");

      return Promise.resolve("success");
    });

    await expect(first).rejects.toThrow("保存エラー");
    await expect(second).resolves.toBe("success");

    expect(events).toStrictEqual(["first", "second"]);
  });
});
