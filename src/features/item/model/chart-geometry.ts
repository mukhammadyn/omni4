import type { Field } from "@/features/table";
import { chartFieldSlugs, MULTI_MEASURE_KINDS, RAW_CHART_KINDS, type ChartConfig, type ChartSeries } from "./chart";
import { NUMERIC_FIELDS, toNumber } from "./pivot";
import type { Item } from "./types";

export function chartRoleIssue(config: ChartConfig, fields: Field[]): "unavailable" | "numeric" | "units" | null {
  const bySlug = new Map(fields.map((field) => [field.slug, field]));
  if (chartFieldSlugs(config).some((slug) => !bySlug.has(slug))) return "unavailable";
  const numeric = RAW_CHART_KINDS.has(config.kind)
    ? [config.kind === "map" ? config.latitudeSlug : config.xSlug, config.kind === "map" ? config.longitudeSlug : config.ySlug, config.sizeSlug]
    : config.measures?.length && MULTI_MEASURE_KINDS.has(config.kind) ? config.measures.filter((measure) => measure.aggregation !== "count").map((measure) => measure.field) : config.aggregation !== "count" ? [config.valueSlug] : [];
  if (numeric.some((slug) => slug && !NUMERIC_FIELDS.has(bySlug.get(slug)?.type ?? ""))) return "numeric";
  if (config.measures?.length) {
    for (const axis of ["left", "right"]) {
      const units = new Set(config.measures.filter((measure) => config.kind !== "combo" || (measure.axis ?? "left") === axis).map((measure) => measure.unit || (measure.aggregation === "count" ? "count" : "number")));
      if (units.size > 1) return "units";
    }
  }
  return null;
}

export function linearDomain(values: number[], zero = true): { min: number; max: number } {
  const finite = values.filter(Number.isFinite);
  let min = Math.min(...finite, ...(zero ? [0] : [])), max = Math.max(...finite, ...(zero ? [0] : []));
  if (!finite.length) return { min: 0, max: 1 };
  if (min === max) { const padding = Math.abs(min) * 0.1 || 1; min -= zero ? 0 : padding; max += padding; }
  return { min, max };
}
export const scaleY = (value: number, domain: { min: number; max: number }) => 100 - (value - domain.min) / (domain.max - domain.min || 1) * 100;

export function partValuesValid(series: ChartSeries): boolean {
  return series.points.every((point) => [point.value, ...point.cells.values()].every((value) => Number.isFinite(value) && value >= 0));
}

export function normalizedBands(series: ChartSeries) {
  const splits = series.splits.length ? series.splits : [{ key: "", label: "" }];
  return series.points.map((point) => {
    const values = splits.map((split) => point.cells.size ? point.cells.get(split.key) ?? 0 : point.value);
    const total = values.reduce((sum, value) => sum + value, 0); let start = 0;
    const bands = values.map((value) => { const end = start + (total > 0 ? value / total * 100 : 0); const band = { start, end, value }; start = end; return band; });
    return { key: point.key, label: point.label, total, bands };
  });
}

export type XYPoint = { key: string; label: string; x: number; y: number; size: number };
export function xyPoints(rows: Item[], config: ChartConfig, label?: (row: Item, value: string) => string) {
  const points: XYPoint[] = []; let excluded = 0;
  for (const [index, row] of rows.entries()) {
    const x = toNumber(row[config.kind === "map" ? config.longitudeSlug ?? "" : config.xSlug ?? ""]);
    const y = toNumber(row[config.kind === "map" ? config.latitudeSlug ?? "" : config.ySlug ?? ""]);
    const size = config.sizeSlug ? toNumber(row[config.sizeSlug]) : 1;
    if (x === null || y === null || size === null || size < 0 || (config.kind === "map" && (Math.abs(x) > 180 || Math.abs(y) > 90))) { excluded++; continue; }
    const value = String(row[config.groupSlug] ?? "");
    points.push({ key: `${row.guid ?? index}-${index}`, label: label?.(row, value) || value || String(row.guid ?? index + 1), x, y, size });
  }
  return { points, excluded };
}

export type TreeRect = { key: string; label: string; value: number; x: number; y: number; width: number; height: number };
/** Balanced recursive rectangles preserve area and do not overlap. */
export function treemapRects(series: ChartSeries): TreeRect[] {
  if (!partValuesValid(series)) return [];
  const items = series.points.filter((point) => point.value > 0).sort((a, b) => b.value - a.value);
  const visit = (part: typeof items, x: number, y: number, width: number, height: number): TreeRect[] => {
    if (!part.length) return [];
    if (part.length === 1) return [{ ...part[0]!, x, y, width, height }];
    const total = part.reduce((sum, point) => sum + point.value, 0);
    let subtotal = 0, at = 1, distance = Infinity;
    for (let i = 0; i < part.length - 1; i++) { subtotal += part[i]!.value; const d = Math.abs(subtotal - total / 2); if (d < distance) { distance = d; at = i + 1; } }
    const ratio = part.slice(0, at).reduce((sum, point) => sum + point.value, 0) / total;
    return width >= height ? [...visit(part.slice(0, at), x, y, width * ratio, height), ...visit(part.slice(at), x + width * ratio, y, width * (1 - ratio), height)] : [...visit(part.slice(0, at), x, y, width, height * ratio), ...visit(part.slice(at), x, y + height * ratio, width, height * (1 - ratio))];
  };
  return visit(items, 0, 0, 100, 100);
}

/** Absolute stacks accumulate positive and negative values independently; never normalize totals. */
export function stackedBands(series: ChartSeries) {
  const splits = series.splits.length ? series.splits : [{ key: "", label: "" }];
  return series.points.map((point) => {
    let positive = 0, negative = 0;
    const bands = splits.map((split) => {
      const value = point.cells.size ? point.cells.get(split.key) ?? 0 : point.value;
      const start = value >= 0 ? positive : negative;
      const end = start + value;
      if (value >= 0) positive = end; else negative = end;
      return { start, end, value };
    });
    return { bands, min: negative, max: positive };
  });
}

/** A readable dynamic scale; never fixes the report to today's maximum. */
export function niceChartTicks(minimum: number, maximum: number): number[] {
  const span = Math.max(maximum - minimum, 1), raw = span / 5, power = 10 ** Math.floor(Math.log10(raw)), ratio = raw / power;
  const step = (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10) * power;
  const min = Math.floor(minimum / step) * step, max = Math.ceil(maximum / step) * step;
  return Array.from({ length: Math.max(2, Math.round((max - min) / step) + 1) }, (_, index) => Number((min + index * step).toPrecision(12)));
}
