import { parseFilters, type Filters } from "@/features/item";
import type { Widget } from "./dashboard";
import { mergeFilters } from "./filters";

export type DatasetField = { slug: string; label: string; type: string; target?: string; joinable?: boolean };
/** Table sources use normal role metadata; SQL sources reuse SQL-console schema metadata. */
export type DatasetTable = { slug: string; label: string; fields: DatasetField[] };
export type DatasetParameter = { name: string; type: "text" | "number" | "date" | "boolean"; required: boolean };
export type DatasetJoin = { fromTable: string; field: string; toTable: string; kind: "left" | "inner" };
export type Dataset = {
  id: string; name: string;
  source: { kind: "table"; tableSlug: string; fields: string[]; filters: Filters; joins: DatasetJoin[] }
    | { kind: "sql"; sql: string; parameters: DatasetParameter[]; columns: DatasetField[] };
};

/** Relationship guidance is advisory; executing joins requires a verified server contract. */
export function joinGuidance(join: DatasetJoin, catalog: DatasetTable[]): { valid: boolean; reason: "missing" | "unrelated" | "fanout" | "reference" } {
  const from = catalog.find((table) => table.slug === join.fromTable), to = catalog.find((table) => table.slug === join.toTable);
  const field = from?.fields.find((item) => item.slug === join.field);
  if (!from || !to || !field) return { valid: false, reason: "missing" };
  if (field.target !== to.slug) return { valid: false, reason: "unrelated" };
  return field.type === "LOOKUPS" ? { valid: true, reason: "fanout" } : { valid: field.type === "LOOKUP" && field.joinable === true, reason: "reference" };
}

/** Documents this client adapter; it is not a server security capability. */
export const CLIENT_SQL_CAPABILITY = { execution: "existing-admin-sql", serverReadOnly: false, serverBoundsVerified: false } as const;

export function datasetFields(dataset: Dataset, catalog: DatasetTable[]): DatasetField[] {
  if (dataset.source.kind === "sql") return dataset.source.columns;
  const source = dataset.source, fields = catalog.find((table) => table.slug === source.tableSlug)?.fields ?? [];
  return source.fields.flatMap((slug) => { const field = fields.find((item) => item.slug === slug); return field ? [field] : []; });
}

/** Shared table sources intersect their mandatory scope with each card's own filters. */
export function resolveDataset(widget: Widget, datasets: Dataset[]) {
  if (!widget.datasetId) return { widget, dataset: undefined, error: null };
  const dataset = datasets.find((item) => item.id === widget.datasetId);
  if (!dataset || dataset.source.kind !== "table" || dataset.source.joins.length) return { widget: { ...widget, tableSlug: "" }, dataset, error: "dashboard.datasetUnavailable" };
  try { return { widget: { ...widget, tableSlug: dataset.source.tableSlug, filters: mergeFilters(dataset.source.filters, widget.filters) }, dataset, error: null }; }
  catch { return { widget: { ...widget, tableSlug: "" }, dataset, error: "dashboard.filterConflict" }; }
}

/** Persist only recognized forms, typed parameters and supported relation plans. */
export function toDatasets(value: unknown): Dataset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw): Dataset[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>, source = item["source"] as Record<string, unknown> | undefined;
    if (typeof item["id"] !== "string" || !item["id"] || seen.has(item["id"]) || !source || typeof source !== "object") return [];
    seen.add(item["id"]);
    const identity = { id: item["id"], name: typeof item["name"] === "string" ? item["name"] : "" };
    if (source["kind"] === "table" && typeof source["tableSlug"] === "string" && parseFilters(source["filters"])) return [{ ...identity, source: { kind: "table", tableSlug: source["tableSlug"], fields: Array.isArray(source["fields"]) ? [...new Set(source["fields"].filter((field): field is string => typeof field === "string"))] : [], filters: parseFilters(source["filters"]) ?? {}, joins: Array.isArray(source["joins"]) ? source["joins"].flatMap((raw): DatasetJoin[] => {
      if (!raw || typeof raw !== "object") return [];
      const join = raw as Record<string, unknown>;
      return typeof join["fromTable"] === "string" && typeof join["toTable"] === "string" && typeof join["field"] === "string" && (join["kind"] === "left" || join["kind"] === "inner") ? [{ fromTable: join["fromTable"], toTable: join["toTable"], field: join["field"], kind: join["kind"] }] : [];
    }) : [] } }];
    if (source["kind"] === "sql" && typeof source["sql"] === "string") return [{ ...identity, source: { kind: "sql", sql: source["sql"], columns: [], parameters: Array.isArray(source["parameters"]) ? source["parameters"].flatMap((raw): DatasetParameter[] => {
      if (!raw || typeof raw !== "object") return [];
      const p = raw as Record<string, unknown>;
      return typeof p["name"] === "string" && ["text", "number", "date", "boolean"].includes(p["type"] as string) ? [{ name: p["name"], type: p["type"] as DatasetParameter["type"], required: p["required"] === true }] : [];
    }) : [] } }];
    return [];
  });
}
