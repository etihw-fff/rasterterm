export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const isFontSize = (value: unknown): value is FontSize =>
  typeof value === "number" && FONT_SIZES.some((size) => size === value);

export type AppSettings = {
  displayMode: "fit" | "scroll";
  loopStyle: "transition" | "direct";
  fontSize: FontSize;
};

export const DEFAULT_SETTINGS: AppSettings = {
  displayMode: "fit",
  loopStyle: "transition",
  fontSize: 16,
};
