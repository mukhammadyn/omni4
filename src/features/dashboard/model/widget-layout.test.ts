import { expect, test } from "vitest";
import { newChart } from "@/features/item";
import { newDashboard, newFolder, toTree, toTreeAttribute, type Widget } from "./dashboard";
import { boxesOverlap, placeWidgets, layoutRows, layoutHeight } from "./widget-layout";

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
  const clamped = placeWidgets([card("large", 12, 0, 300, 99), card("small", 12, 1, 1, 3)]);
  expect(clamped[0]?.width).toBe(12);
  expect(clamped[0]?.layout).toEqual({ column: 1, row: 1, rows: 48 });
  noOverlap(clamped);
});
test("a complete fifty-row table can retain its configured height after save and packing",()=>{
 const widgets=placeWidgets([card("table",1,1,layoutRows(3300),12),card("following",1,4,2,12)],"table");
 expect(layoutHeight(widgets[0]!.layout!.rows)).toBe(3300);noOverlap(widgets);
 const tree={folders:[{...newFolder("module","Reports"),dashboards:[{...newDashboard("Report"),widgets}]}]};
 expect(toTree(toTreeAttribute(tree))).toEqual(tree);
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

test("reference card pixel heights and offsets survive serialization exactly", async () => {
  const {layoutRow,layoutRows,layoutTop,layoutHeight}=await import('./widget-layout');
  const widgets=[card('age',1,1,3,9),...[["mean",0,126],["young",142,118],["old",276,118]].map(([id,top,height])=>card(String(id),10,layoutRow(Number(top)),layoutRows(Number(height)),3))];
  const placed=placeWidgets(widgets);noOverlap(placed);
  expect(placed.slice(1).map(w=>[layoutTop(w.layout!.row),layoutHeight(w.layout!.rows)])).toEqual([[0,126],[142,118],[276,118]]);
  const tree={folders:[{...newFolder('module','Fixture'),dashboards:[{...newDashboard('Fixture'),widgets:placed}]}]};
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
});
test("cards without explicit placement are packed safely once a canvas is enabled",()=>{
  const auto={...newChart(),id:'auto',tableSlug:'',filters:{},answers:{}};
  const widgets=placeWidgets([card('existing',1,1,3,9),auto]);
  expect(widgets[1]?.layout).toBeDefined();noOverlap(widgets);
});

test("flow lists expand without clipping and move following cards without changing the saved layout", () => {
  const widgets:Widget[]=[{...card("list",1,1,3,12),type:"records",sqlRecords:{layout:"cards",autoHeight:true,titleField:"name"}},card("after",1,4,1,12)];
  const viewed=placeWidgets(widgets,undefined,{list:3000});
  noOverlap(viewed);
  expect(viewed[0]!.layout!.rows).toBeGreaterThan(12);
  expect(viewed[1]!.layout!.row).toBeGreaterThan(20);
  expect(widgets[0]!.layout!.rows).toBe(3);
  expect(placeWidgets(widgets)[0]!.layout!.rows).toBe(3);
});

test('bottom-legend pies grow for dense labels and retain their configured minimum after filtering',async()=>{
 const {widgetDisplayHeight,layoutRows}=await import('./widget-layout');
 const pie:Widget={...card('pie',1,1,layoutRows(369),6),kind:'pie',appearance:{legendPosition:'bottom'}};
 expect(widgetDisplayHeight(pie,560,false)).toBe(560);expect(widgetDisplayHeight(pie,290,false)).toBe(369);expect(widgetDisplayHeight(pie,560,true)).toBe(369);
 const table:Widget={...pie,type:'records',sqlTableFitContent:true};expect(widgetDisplayHeight(table,560,false)).toBe(369);expect(widgetDisplayHeight(table,120,false)).toBe(120);
 const viewed=placeWidgets([pie,card('after',1,4,1,12)],undefined,{pie:560});noOverlap(viewed);expect(viewed[0]!.layout!.rows).toBe(layoutRows(560));
});
