export type AppSettings = {
  displayMode: "fit" | "scroll";
  loopStyle: "transition" | "direct";
};

export const DEFAULT_SETTINGS: AppSettings = {
  displayMode: "fit",
  loopStyle: "transition",
};
