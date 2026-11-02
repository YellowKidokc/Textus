import { expect, it } from "vitest";
import { favoriteActions } from "./favorite-actions";
it("allows more than thirty editable favorite actions without truncation", () => {
  const actions = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    name: `Action ${i}`,
    instruction: `Instruction ${i}`,
  }));
  expect(favoriteActions(actions)).toEqual(actions);
  expect(favoriteActions([...actions, actions[0], null])).toEqual(actions);
});
