import { expect, it } from "vitest";
import { columnSettings } from "./side-columns-model";
it("restores each side independently and rejects corrupt widths", () => {
  const value = columnSettings({
    left: { count: 3, sizes: [0.2, 0.3, 0.5] },
    right: { count: 9, sizes: [NaN] },
  });
  expect(value.left).toEqual({ count: 3, sizes: [0.2, 0.3, 0.5] });
  expect(value.right.count).toBe(2);
  expect(columnSettings("broken").left.sizes).toHaveLength(3);
});
