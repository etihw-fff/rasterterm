export type LibraryItem = {
  id: string;
  originalName: string;
  storedName: string;
  sha256: string;
  size: number;
  addedAt: string;
};

export type LibraryIndex = {
  version: 1;
  items: LibraryItem[];
};

export const LIBRARY_VERSION = 1;
