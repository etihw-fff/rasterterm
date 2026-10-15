import type { FileSelectionError } from "./validate";
import { validateMediaFiles } from "./validate";

type FileHandler = (file: File) => void;
type FileError = (error: FileSelectionError) => void;

type RegisterVideoDrop = (onFile: FileHandler, onError: FileError) => () => void;

export const registerVideoDrop: RegisterVideoDrop = (onFile, onError) => {
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const fileList = event.dataTransfer?.files;
    if (!fileList) {
      onError("empty");
      return;
    }
    const files = Array.from(fileList);
    const result = validateMediaFiles(files);

    if (result.ok) {
      onFile(result.file);
    } else {
      onError(result.reason);
    }
    return;
  };

  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
  };
};
