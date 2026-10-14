type CalculateLuminance = (r: number, g: number, b: number) => number;

export const calculateLuminance: CalculateLuminance = (r, g, b) => {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y;
};
