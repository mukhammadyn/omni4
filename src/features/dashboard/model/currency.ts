import type { Field } from "@/features/table";
import type { Item } from "@/features/item";
import type { Widget } from "./dashboard";

/** A missing monetary unit is a configuration error, not a combined total. */
export function currencyField(widget: Widget, fields: Field[]): { slug: string; required: boolean } {
  if (widget.type === "heading" || widget.type === "records") return { slug: "", required: false };
  const rawFields = widget.kind === "map" ? [widget.sizeSlug] : [widget.xSlug, widget.ySlug, widget.sizeSlug];
  const values = ["scatter", "bubble", "map"].includes(widget.kind) ? rawFields.filter((slug): slug is string => Boolean(slug)) : widget.type === "ratio" && widget.ratio ? [widget.ratio.numerator, widget.ratio.denominator].filter((m) => m.aggregation !== "count").map((m) => m.field) : widget.measures?.length ? widget.measures.filter((m) => m.aggregation !== "count").map((m) => m.field) : widget.aggregation === "count" ? [] : [widget.valueSlug];
  if (!values.length) return { slug: "", required: false };
  const money = values.some((slug) => fields.find((field) => field.slug === slug)?.type === "MONEY" || /amount|salary|price|cost/i.test(slug));
  const slug = widget.currencySlug || (money && fields.some((field) => field.slug === "currency") ? "currency" : "");
  return { slug, required: money && !slug };
}

export function currencyGroups(rows: Item[], previous: Item[] | undefined, slug: string) {
  if (!slug) return [{ currency: "", rows, previous, valid: true }];
  const codes = [...new Set([...rows, ...(previous ?? [])].map((row) => String(row[slug] ?? "").trim()))].sort();
  return codes.map((currency) => ({ currency, valid: Boolean(currency), rows: rows.filter((row) => String(row[slug] ?? "").trim() === currency), previous: previous?.filter((row) => String(row[slug] ?? "").trim() === currency) }));
}
