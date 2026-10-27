import { describe, expect, it } from "vitest";
import { applyOrder, moveId } from "./tab-order";

const tabs = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("applyOrder", () => {
  it("puts saved first, new ones after, drops gone", () => {
    expect(ids(applyOrder(tabs, ["c", "x", "a"]))).toEqual(["c", "a", "b", "d"]);
    expect(ids(applyOrder(tabs, []))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moveId", () => {
  it("moves forward and back", () => {
    expect(moveId(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });
});
