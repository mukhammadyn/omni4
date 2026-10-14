import { chartFieldSlugs, chartReady, chartRoleIssue, chartSeries, type ChartMeasure, type Filters, type Item } from "@/features/item";
import type { Field } from "@/features/table";
import type { Widget } from "./dashboard";

export function widgetFieldSlugs(widget: Widget): string[] {
  if (widget.type === "heading" || widget.type === "records") return [];
  if (widget.type === "ratio") return [widget.ratio?.numerator, widget.ratio?.denominator].flatMap((measure) => measure && measure.aggregation !== "count" ? [measure.field] : []);
  if (widget.type === "pivot") return [...(widget.pivotRows ?? [widget.groupSlug]), widget.splitSlug, ...(widget.aggregation === "count" ? [] : [widget.valueSlug])].filter(Boolean);
  return chartFieldSlugs(widget);
}

export function widgetReady(widget: Widget, fields: Field[]): boolean {
  const stat = (measure: ChartMeasure) => ({ ...widget, kind: "stat" as const, measures: [], aggregation: measure.aggregation, valueSlug: measure.field });
  if (widget.type === "heading") return Boolean(widget.title.trim() || widget.body?.trim());
  if (widget.type === "ratio") return Boolean(widget.ratio && [widget.ratio.numerator, widget.ratio.denominator].every((measure) => chartReady(stat(measure)) && !chartRoleIssue(stat(measure), fields)));
  if (widget.type === "pivot") return Boolean((widget.pivotRows ?? [widget.groupSlug]).some(Boolean) && (widget.aggregation === "count" || widget.valueSlug) && widgetFieldSlugs(widget).every((slug) => fields.some((field) => field.slug === slug)) && !chartRoleIssue({ ...widget, kind: "stat", measures: [] }, fields));
  if (widget.type === "goal" && !(Number.isFinite(widget.goal) && widget.goal! > 0)) return false;
  return chartReady(widget) && !chartRoleIssue(widget, fields);
}

/** Each measure reduces original records; zero is explicit, never Infinity/NaN. */
export function ratioValue(rows: Item[], widget: Widget): { numerator: number; denominator: number; value: number | null } {
  const value = (measure: ChartMeasure) => chartSeries(rows, { ...widget, kind: "stat", measures: [], aggregation: measure.aggregation, valueSlug: measure.field }).total;
  if (!widget.ratio) return { numerator: 0, denominator: 0, value: null };
  const numerator = value(widget.ratio.numerator), denominator = value(widget.ratio.denominator);
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator * (widget.ratio.percent ? 100 : 1) };
}

/** Unbucketed scalar categories only: synthetic "Other" and time buckets are not record values. */
export function chartSelection(widget: Widget, key: string, fields: Field[]): Filters | null {
  const field = fields.find((field) => field.slug === widget.groupSlug);
  if (!field || widget.groupBucket || !key || key === " other") return null;
  if (["LOOKUP", "STATUS", "MULTISELECT"].includes(field.type)) return { [field.slug]: { op: "is", values: [key] } };
  if (["NUMBER", "FLOAT", "FLOAT_NOLIMIT", "SINGLE_LINE"].includes(field.type)) return { [field.slug]: { op: "is", values: [key] } };
  return null;
}
