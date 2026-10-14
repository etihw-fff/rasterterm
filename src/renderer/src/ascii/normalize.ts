type CalculatePercentile = (sortedValues: number[], percent: number) => number;

const calculatePercentile: CalculatePercentile = (sortedValues, percent) => {
  const count = sortedValues.length;
  const position = (count - 1) * percent;

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;

  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];
  if (lowerValue === undefined || upperValue === undefined) {
    throw new Error("補間計算に必要な数値（lowerValue または upperValue）が取得できませんでした。");
  }
  return (upperValue - lowerValue) * fraction + lowerValue;
};

export const normalizeLuminance = (values: number[]): number[] => {
  if (values.length === 0) {
    return [];
  }

  // toSortedの代わりにスプレッド構文[...]を使ってコピーし、sortする
  const sortedValues = [...values].sort((a, b) => a - b);

  const lowValue = calculatePercentile(sortedValues, 0.02);
  const highValue = calculatePercentile(sortedValues, 0.98);
  const range = highValue - lowValue;
  if (range === 0) {
    return [...values];
  }
  const normalizedValues = values.map((value) => {
    const normalizedValue = ((value - lowValue) / range) * 255;
    return Math.max(0, Math.min(255, normalizedValue));
  });

  return normalizedValues;
};
