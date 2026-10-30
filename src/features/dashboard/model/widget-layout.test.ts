import { expect, test } from "vitest";
import { newChart } from "@/features/item";
import { newDashboard, newFolder, toTree, toTreeAttribute, type Widget } from "./dashboard";
import { boxesOverlap, placeWidgets } from "./widget-layout";

const card = (id: string, column: number, row: number, rows: number, width: number): Widget => ({ ...newChart(), id, title: id, tableSlug: "", filters: {}, answers: {}, width, layout: { column, row, rows } });
function noOverlap(widgets: Widget[]) {
  for (let i = 0; i < widgets.length; i++) for (let j = i + 1; j < widgets.length; j++) {
    const a = widgets[i]!, b = widgets[j]!;
    if (a.layout && b.layout) expect(boxesOverlap({ ...a.layout, width: a.width }, { ...b.layout, width: b.width }), `${a.id}/${b.id}`).toBe(false);
  }
}
test("resizing a large chart preserves its requested slot and moves colliding cards safely", () => {
  const original = [card("chart", 1, 1, 3, 9), card("mean", 10, 1, 1, 3), card("young", 10, 2, 1, 3), card("old", 10, 3, 1, 3), card("months", 1, 4, 3, 12)];
  const resized = placeWidgets(original.map((widget) => widget.id === "chart" ? { ...widget, width: 12 } : widget), "chart");
  expect(resized[0]?.layout).toEqual({ column: 1, row: 1, rows: 3 });
  noOverlap(resized);
  expect(original[1]?.layout?.row).toBe(1);
  expect(resized[1]?.layout?.row).toBe(4);
  expect(new Set(resized.map((widget) => widget.id)).size).toBe(5);
});
test("moving to an occupied slot resolves all overlaps and stays stable after save/reload", () => {
  const widgets = [card("small", 1, 1, 1, 3), card("large", 4, 1, 3, 9), card("lower", 1, 4, 2, 12)];
  const moved = placeWidgets(widgets.map((widget) => widget.id === "lower" ? { ...widget, layout: { column: 1, row: 1, rows: 2 } } : widget), "lower");
  noOverlap(moved);
  expect(moved.find((widget) => widget.id === "lower")?.layout?.row).toBe(1);
  expect(placeWidgets(moved)).toEqual(moved);
  const tree = { folders: [{ ...newFolder("module", "Reports"), dashboards: [{ ...newDashboard("Fixture"), widgets: moved }] }] };
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
});
test("invalid dimensions are bounded and legacy flow stays unchanged", () => {
  const legacy = [{ ...newChart(), tableSlug: "", filters: {}, answers: {} }];
  expect(placeWidgets(legacy)).toBe(legacy);
  const clamped = placeWidgets([card("large", 12, 0, 30, 99), card("small", 12, 1, 1, 3)]);
  expect(clamped[0]?.width).toBe(12);
  expect(clamped[0]?.layout).toEqual({ column: 1, row: 1, rows: 12 });
  noOverlap(clamped);
});

test("moving a large chart into a small card's position retains each card's dimensions", async () => {
  const { swapWidgetPositions } = await import('./widget-layout');
  const widgets = [card('large',1,1,3,9),card('small',10,1,1,3),card('lower',1,4,3,12)];
  const moved = swapWidgetPositions(widgets,'large','small')!;
  noOverlap(moved);
  expect(moved.map((widget)=>[widget.id,widget.width,widget.layout?.rows])).toEqual(widgets.map((widget)=>[widget.id,widget.width,widget.layout?.rows]));
  expect(moved[0]?.layout?.column).toBe(4);
  expect(widgets[0]?.layout?.column).toBe(1);
});
