export type FileSelectionError = "empty" | "multiple" | "empty-file" | "unsupported";
export type FileSelectionResult =
  | {
      ok: true;
      file: File;
    }
  | {
      ok: false;
      reason: FileSelectionError;
    };

export const validateMediaFiles = (files: readonly File[]): FileSelectionResult => {
  if (files.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (files.length >= 2) {
    return { ok: false, reason: "multiple" };
  }
  const file = files[0];
  if (!file) {
    return { ok: false, reason: "empty" };
  }
  if (file.size === 0) {
    return { ok: false, reason: "empty-file" };
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".mp4") && !fileName.endsWith(".mov") && !fileName.endsWith(".webm")) {
    return { ok: false, reason: "unsupported" };
  }
  return { ok: true, file: file };
};
