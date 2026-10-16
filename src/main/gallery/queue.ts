let previousOperation: Promise<void> = Promise.resolve();

export const runGalleryOperation = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = previousOperation.then(operation);

  // 失敗した操作があっても、後続の操作を実行する。
  previousOperation = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
};
