import { describe, expect, it } from "vitest";
import { flattenTree } from "./directory-tree";

const row = (guid: string, parent?: string) => ({ guid, parent_id: parent ?? null });
const ids = (rows: ReturnType<typeof flattenTree>) =>
  rows.map((item) => `${"-".repeat(item.depth)}${String(item.row.guid)}:${item.children}`);

describe("flattenTree", () => {
  it("кладёт детей под родителя в порядке обхода", () => {
    const rows = [row("b", "a"), row("a"), row("c", "b"), row("d")];
    expect(ids(flattenTree(rows, "parent_id", new Set()))).toEqual(["a:1", "-b:1", "--c:0", "d:0"]);
  });

  it("прячет потомков свёрнутого узла, но не его самого", () => {
    const rows = [row("a"), row("b", "a"), row("c", "b")];
    expect(ids(flattenTree(rows, "parent_id", new Set(["a"])))).toEqual(["a:1"]);
  });

  it("сирота становится корнем", () => {
    expect(ids(flattenTree([row("x", "gone")], "parent_id", new Set()))).toEqual(["x:0"]);
  });

  it("цикл показывается один раз и не зацикливает", () => {
    const rows = [row("a", "b"), row("b", "a")];
    expect(ids(flattenTree(rows, "parent_id", new Set()))).toEqual(["a:1", "-b:1"]);
  });
});
