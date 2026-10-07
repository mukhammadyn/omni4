import { describe, expect, it } from "vitest";
import { buildTree, collapsedFrom, countBelow, type OrgNode } from "./org-tree";

type Row = { id: string; boss?: string };
const tree = (rows: Row[]) =>
  buildTree(
    rows,
    (row) => row.id,
    (row) => row.boss,
  );
const shape = (nodes: OrgNode<Row>[]): unknown => nodes.map((node) => [node.id, shape(node.kids)]);

describe("buildTree", () => {
  it("hangs people under their manager, orphans at the root", () => {
    const roots = tree([{ id: "a" }, { id: "b", boss: "a" }, { id: "c", boss: "b" }, { id: "d", boss: "gone" }]);
    expect(shape(roots)).toEqual([
      ["a", [["b", [["c", []]]]]],
      ["d", []],
    ]);
    expect(countBelow(roots[0]!)).toBe(2);
  });

  it("keeps everyone from a cycle or a self-reference", () => {
    const roots = tree([
      { id: "a", boss: "b" },
      { id: "b", boss: "a" },
      { id: "s", boss: "s" },
    ]);
    expect(shape(roots)).toEqual([
      ["s", []],
      ["a", [["b", []]]],
    ]);
  });

  it("collapses nodes with children from the given depth", () => {
    const roots = tree([{ id: "a" }, { id: "b", boss: "a" }, { id: "c", boss: "b" }]);
    expect([...collapsedFrom(roots, 1)]).toEqual(["b"]);
  });
});
