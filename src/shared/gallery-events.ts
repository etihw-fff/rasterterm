export type GalleryEvent =
  | {
      type: "play";
      id: string;
      url?: string;
    }
  | {
      type: "removed";
      ids: string[];
    };
