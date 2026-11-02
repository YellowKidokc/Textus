interface ColumnConfig {
  count: number;
  sizes: number[];
}
export function columnSettings(
  raw: unknown,
): Record<"left" | "right", ColumnConfig> {
  const read = (side: "left" | "right"): ColumnConfig => {
    const value =
      raw && typeof raw === "object" && side in raw
        ? (raw as Record<string, unknown>)[side]
        : null;
    const saved =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const sizes = saved.sizes;
    return {
      count: saved.count === 1 || saved.count === 3 ? saved.count : 2,
      sizes:
        Array.isArray(sizes) &&
        sizes.length === 3 &&
        sizes.every(
          (s) =>
            typeof s === "number" && Number.isFinite(s) && s >= 0.1 && s <= 0.9,
        ) &&
        Math.abs(sizes.reduce((a, b) => a + b, 0) - 1) < 0.001
          ? sizes
          : [1 / 3, 1 / 3, 1 / 3],
    };
  };
  return { left: read("left"), right: read("right") };
}
