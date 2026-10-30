import type { Widget } from "./dashboard";

export const MAX_LAYOUT_ROW = 10000;
export const LAYOUT_CELL = 135;
export const LAYOUT_GAP = 16;
type Box = { column: number; row: number; rows: number; width: number };
const bounded = (value: number, low: number, high: number) => Number.isFinite(value) ? Math.max(low, Math.min(high, Math.round(value))) : low;
export const boxesOverlap = (a: Box, b: Box) => a.column < b.column + b.width && b.column < a.column + a.width && a.row < b.row + b.rows && b.row < a.row + a.rows;

/** The edited card keeps its requested slot; collisions move other cards down, never over them. */
export function placeWidgets(widgets: Widget[], preferredId?: string): Widget[] {
  if (!widgets.some((widget) => widget.layout)) return widgets;
  const occupied: Box[] = [], placed = new Map<string, Widget>();
  const order = [...widgets].sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId) || (a.layout?.row ?? MAX_LAYOUT_ROW) - (b.layout?.row ?? MAX_LAYOUT_ROW) || (a.layout?.column ?? 1) - (b.layout?.column ?? 1));
  for (const widget of order) {
    if (!widget.layout) { placed.set(widget.id, widget); continue; }
    const width = bounded(widget.width, 3, 12), box: Box = { width, column: bounded(widget.layout.column, 1, 13 - width), row: bounded(widget.layout.row, 1, MAX_LAYOUT_ROW), rows: bounded(widget.layout.rows, 1, 12) };
    const fit = (start: number) => {
      let row = start;
      for (let attempt = 0; attempt <= occupied.length && row <= MAX_LAYOUT_ROW; attempt++) {
        const collisions = occupied.filter((other) => boxesOverlap({ ...box, row }, other));
        if (!collisions.length) return row;
        row = Math.max(...collisions.map((other) => other.row + other.rows));
      }
      return null;
    };
    const row = fit(box.row) ?? fit(1);
    // If the explicit grid is full, CSS auto-placement still keeps the card visible and separate.
    if (row === null) { const next = { ...widget }; delete next.layout; placed.set(widget.id, next); continue; }
    const next = { ...widget, width, layout: { column: box.column, row, rows: box.rows } };
    occupied.push({ ...box, row }); placed.set(widget.id, next);
  }
  return widgets.map((widget) => placed.get(widget.id)!);
}

/** Moving cards exchanges positions, not their sizes. Packing handles the resulting collisions. */
export function swapWidgetPositions(widgets: Widget[], from: string, to: string): Widget[] | null {
  const a = widgets.find((widget) => widget.id === from), b = widgets.find((widget) => widget.id === to);
  if (!a?.layout || !b?.layout) return null;
  return placeWidgets(widgets.map((widget) => widget.id === from ? { ...widget, layout: { ...widget.layout!, column: b.layout!.column, row: b.layout!.row } } : widget.id === to ? { ...widget, layout: { ...widget.layout!, column: a.layout!.column, row: a.layout!.row } } : widget), from);
}
