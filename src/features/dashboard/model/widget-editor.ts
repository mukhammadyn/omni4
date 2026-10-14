import { aggregationAllowed, MULTI_MEASURE_KINDS, splittable, type ChartKind } from "@/features/item";
import type { Field } from "@/features/table";
import type { Widget } from "./dashboard";

export type Visualization = ChartKind | "records" | "pivot" | "ratio" | "goal" | "heading";
export const visualizationOf = (widget: Widget): Visualization => !widget.type || widget.type === "chart" ? widget.kind : widget.type as Visualization;
export const isDateField = (field: Pick<Field, "type"> | undefined) => Boolean(field && ["DATE", "DATE_TIME", "DATE_TIME_WITHOUT_TIME_ZONE"].includes(field.type));

/** Only unambiguous schema hints: never group by the first text/name field. */
export function suggestedGroup(kind: ChartKind, fields: readonly Pick<Field, "slug" | "type" | "options">[]): string {
  const dates = fields.filter(isDateField);
  const date = dates.find((field) => field.slug === "created_at") ?? (dates.length === 1 ? dates[0] : undefined);
  const categories = fields.filter((field) => field.type === "STATUS" && field.options.size > 0 && field.options.size <= 20);
  const category = categories.length === 1 ? categories[0] : undefined;
  return (["line", "area", "area100", "combo"].includes(kind) ? date : category)?.slug ?? "";
}

export function selectVisualization(widget: Widget, visualization: Visualization, fields: Field[]): Widget {
  if (visualizationOf(widget) === visualization) return widget;
  if (["records", "pivot", "ratio", "goal", "heading"].includes(visualization)) {
    const type = visualization as "records" | "pivot" | "ratio" | "goal" | "heading";
    return { ...widget, type,
      ...(type === "records" ? { columns: widget.columns ?? fields.slice(0, 5).map((field) => field.slug), width: 12, height: 2 } : {}),
      ...(type === "pivot" ? { pivotRows: widget.pivotRows ?? [widget.groupSlug || suggestedGroup("bar", fields)], width: 12, height: 2 } : {}),
      ...(type === "heading" ? { width: 12, height: 1 } : {}),
      ...(["ratio", "goal"].includes(type) ? { kind: "stat" as const } : {}),
      ...(type === "ratio" && !widget.ratio ? { ratio: { numerator: { id: "numerator", field: "", aggregation: "count" as const }, denominator: { id: "denominator", field: "", aggregation: "count" as const }, percent: false } } : {}),
    };
  }
  const kind = visualization as ChartKind;
  const groupSlug = fields.some((field) => field.slug === widget.groupSlug) ? widget.groupSlug : suggestedGroup(kind, fields);
  const groupingChanged = groupSlug !== widget.groupSlug;
  return { ...widget, type: "chart", kind, groupSlug,
    ...(kind === "scatter" ? { sizeSlug: "" } : {}),
    groupBucket: isDateField(fields.find((field) => field.slug === groupSlug)) ? groupingChanged ? "month" : widget.groupBucket : "",
    aggregation: aggregationAllowed(kind, widget.aggregation) ? widget.aggregation : "count",
    splitSlug: splittable(kind) ? widget.splitSlug : "", splitBucket: splittable(kind) ? widget.splitBucket : "",
    measures: MULTI_MEASURE_KINDS.has(kind) ? widget.measures?.map((measure) => ({ ...measure, aggregation: aggregationAllowed(kind, measure.aggregation) ? measure.aggregation : "count" })) ?? [] : [],
  };
}

/** Fill the card. Explicitly overflowing widths remain scrollable; a dragged column stays fixed. */
export function fitRecordWidths(slugs: string[], widths: Record<string, number>, available: number, locked?: string): Record<string, number> {
  const defaults = slugs.filter((slug) => widths[slug] === undefined);
  const explicit = slugs.reduce((sum, slug) => sum + (widths[slug] ?? 0), 0);
  const defaultWidth = available > 0 && defaults.length ? Math.max(80, (available - 44 - explicit) / defaults.length) : 160;
  const result = Object.fromEntries(slugs.map((slug) => [slug, Math.max(80, widths[slug] ?? defaultWidth)]));
  const extra = Math.max(0, available - 44 - Object.values(result).reduce((sum, width) => sum + width, 0));
  const flexible = slugs.filter((slug) => slug !== locked);
  const targets = flexible.length ? flexible : slugs;
  for (const slug of targets) result[slug] = result[slug]! + extra / targets.length;
  return result;
}
