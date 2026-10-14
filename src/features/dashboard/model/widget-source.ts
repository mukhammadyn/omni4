import { ME, isFilterSet, type Filters, type Sort } from "@/features/item";
import type { Field, Relation } from "@/features/table";
import type { Widget } from "./dashboard";
import { widgetFieldSlugs } from "./widget-advanced";
import { NOBODY, filterKey, type DashFilter, type FilterValues } from "./filters";

export function resetWidgetSource(widget: Widget, tableSlug: string): Widget {
  const next = { ...widget, tableSlug, groupSlug: "", groupBucket: "" as const, splitSlug: "", splitBucket: "" as const, valueSlug: "", filters: {}, answers: {} };
  delete next.pivotRows; delete next.pivotSkipEmpty; delete next.ratio;
  if (widget.type === "ratio") next.ratio = { numerator: { id: "numerator", field: "", aggregation: "count" }, denominator: { id: "denominator", field: "", aggregation: "count" }, percent: false };
  delete next.datasetId; delete next.measures; delete next.xSlug; delete next.ySlug; delete next.sizeSlug; delete next.latitudeSlug; delete next.longitudeSlug; delete next.interaction;
  delete next.columns; delete next.columnWidths; delete next.sorts; delete next.currencySlug;
  return next;
}

/** Identity comes from the session and actual relation metadata, not a guessed slug. */
export function resolveWidgetIdentities(filters: Filters, fields: Field[], relations: Relation[], identities: Record<string, string>): Filters {
  return Object.fromEntries(Object.entries(filters).map(([slug, filter]) => {
    const field = fields.find((item) => item.slug === slug);
    const target = relations.find((relation) => relation.id === field?.relationId)?.toSlug;
    // STATUS stores one scalar option. Its UI shares the any-of operator with
    // array fields, whose conjunction must remain conservative.
    return [slug, { ...filter, ...(field?.type === "STATUS" && filter.op === "any" ? { op: "is" as const } : {}), values: filter.values.map((value) => value === ME ? target && identities[target] || NOBODY : value) }];
  }));
}

export function planWidgetReads(widget: Widget, viewer: Filters, filters: DashFilter[], values: FilterValues, fields: Field[], relations: Relation[], relatedFields: Record<string, Field[]>, canRead: (table: string) => boolean, identities: Record<string, string>, sorts?: Sort[], constraints: Filters[] = []) {
  const visible = new Set(fields.map((field) => field.slug));
  const records = widget.type === "records";
  const active = (source: Filters) => Object.keys(source).filter((slug) => isFilterSet(source[slug]));
  const used = [...(records ? [] : widgetFieldSlugs(widget)), widget.currencySlug ?? "", ...active(widget.filters), ...active(viewer), ...constraints.flatMap(active), ...(sorts ?? widget.sorts ?? []).map((sort) => sort.field)];
  const lookups: { key: string; table: string; via: string; values: string[] }[] = [];
  let forbidden = !canRead(widget.tableSlug) || used.some((field) => field && field !== "guid" && !visible.has(field));
  for (const filter of filters) {
    const key = filterKey(filter), answer = widget.answers[key], value = values[key];
    if (!answer?.field || !value?.length) continue;
    if (!visible.has(answer.field) || (filter.kind === "record" && !canRead(filter.table))) { forbidden = true; continue; }
    if (filter.kind !== "record" || !answer.via) continue;
    const field = fields.find((item) => item.slug === answer.field);
    const table = relations.find((item) => item.id === field?.relationId)?.toSlug;
    const via = table && relatedFields[table]?.find((item) => item.slug === answer.via);
    if (!table || !canRead(table) || !via || !["LOOKUP", "LOOKUPS"].includes(via.type)) { forbidden = true; continue; }
    lookups.push({ key, table, via: answer.via, values: value.map((id) => id === ME ? identities[filter.table] ?? NOBODY : id) });
  }
  return { forbidden, lookups: forbidden ? [] : lookups };
}
