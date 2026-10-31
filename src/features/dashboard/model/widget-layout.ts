import type { Widget } from "./dashboard";

export const MAX_LAYOUT_ROW = 10000;
export const LAYOUT_CELL = 135;
export const LAYOUT_GAP = 16;
type Box = { column: number; row: number; rows: number; width: number };
export const layoutTop = (row: number) => Math.round((row - 1) * (LAYOUT_CELL + LAYOUT_GAP)*100)/100;
export const layoutHeight = (rows: number) => Math.round((rows * (LAYOUT_CELL + LAYOUT_GAP) - LAYOUT_GAP)*100)/100;
export const layoutRow = (top: number) => top / (LAYOUT_CELL + LAYOUT_GAP) + 1;
export const layoutRows = (height: number) => (height + LAYOUT_GAP) / (LAYOUT_CELL + LAYOUT_GAP);
const bounded = (value: number, low: number, high: number) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
export const boxesOverlap = (a: Box, b: Box) => a.column < b.column + b.width - 1e-7 && b.column < a.column + a.width - 1e-7 && a.row < b.row + b.rows - 1e-7 && b.row < a.row + a.rows - 1e-7;

/** The edited card keeps its requested slot; collisions move other cards down, never over them. */
export function placeWidgets(widgets: Widget[], preferredId?: string, naturalHeights?: Record<string,number>): Widget[] {
  if (!widgets.some((widget) => widget.layout)) return widgets;
  const occupied: Box[] = [], placed = new Map<string, Widget>();
  const order = [...widgets].sort((a, b) => Number(Boolean(b.layout)) - Number(Boolean(a.layout)) || Number(b.id === preferredId && Boolean(b.layout)) - Number(a.id === preferredId && Boolean(a.layout)) || (a.layout?.row ?? MAX_LAYOUT_ROW) - (b.layout?.row ?? MAX_LAYOUT_ROW) || (a.layout?.column ?? 1) - (b.layout?.column ?? 1));
  for (const widget of order) {
    const width = Math.round(bounded(widget.width, 3, 12)), box: Box = { width, column: Math.round(bounded(widget.layout?.column ?? 1, 1, 13 - width)), row: bounded(widget.layout?.row ?? 1, 1, MAX_LAYOUT_ROW), rows: widgetAutoHeight(widget) && naturalHeights?.[widget.id] ? layoutRows(Math.max(80,naturalHeights[widget.id]!)) : bounded(widget.layout?.rows ?? layoutRows(widget.height * 260), layoutRows(80), 12) };
    const fit = (start: number) => {
      let row = start;
      for (let attempt = 0; attempt <= occupied.length && row <= MAX_LAYOUT_ROW; attempt++) {
        const collisions = occupied.filter((other) => boxesOverlap({ ...box, row }, other));
        if (!collisions.length) return row;
        row = Math.max(...collisions.map((other) => other.row + other.rows));
      }
      return null;
    };
    let row = fit(box.row) ?? fit(1);
    if (!widget.layout) {
      let best = { column: box.column, row: row ?? Infinity };
      for (let column = 1; column <= 13 - width; column++) { box.column = column; const candidate = fit(1); if (candidate !== null && candidate < best.row) best = { column, row: candidate }; }
      box.column = best.column; row = Number.isFinite(best.row) ? best.row : null;
    }
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

/** Tables keep a configurable maximum; opt-in list flow grows without clipping records. */
export function widgetDisplayHeight(widget: Widget, naturalHeight: number | undefined, editing: boolean) {
  const configured = widget.layout ? layoutHeight(widget.layout.rows) : widget.height*260;
  if (editing || !naturalHeight || !(widget.sqlTableFitContent || widgetAutoHeight(widget))) return configured;
  return widgetAutoHeight(widget) ? Math.max(80,naturalHeight) : Math.min(configured,Math.max(80,naturalHeight));
}

export function widgetAutoHeight(widget: Widget) {
  return Boolean(widget.sqlRecords?.autoHeight || widget.kind === "bar" && widget.type !== "records" && widget.appearance?.barRowHeight);
}
