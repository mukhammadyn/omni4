import { newChart, type ChartKind, type Sort } from "@/features/item";
import type { Dataset } from "./datasets";
import type { Widget } from "./dashboard";

export type SqlPresentation = { type: "table" | "chart"; kind: ChartKind; group: string; value: string; split: string; sorts?: Sort[] | undefined; columns?: string[] | undefined; showLegend?: boolean | undefined; showGrid?: boolean | undefined; stacked?: boolean | undefined };
export function sqlWidgetFrom(dataset: Dataset, presentation?: SqlPresentation): Widget {
  return { ...newChart(), title: dataset.name, tableSlug: "", datasetId: dataset.id, filters: {}, answers: {}, type: presentation?.type === "chart" ? "chart" : "records", kind: presentation?.kind ?? "bar", groupSlug: presentation?.group ?? "", valueSlug: presentation?.value ?? "", splitSlug: presentation?.split ?? "", aggregation: "sum", ...(presentation?.showLegend !== undefined ? { showLegend: presentation.showLegend } : {}), ...(presentation?.showGrid !== undefined ? { showGrid: presentation.showGrid } : {}), ...(presentation?.stacked !== undefined ? { stacked: presentation.stacked } : {}), width: 12, height: 2, ...(presentation?.sorts ? { sorts: presentation.sorts } : {}), ...(presentation?.columns ? { columns: presentation.columns } : {}) };
}

/** SQL results use the shared picker with the renderers supported for returned columns. */
export const SQL_VISUALIZATIONS = ["records", "stat", "column", "bar", "line", "donut", "pie", "area"] as const;

export function stageSqlWidget(datasets: Dataset[], widget: Widget, dataset: Dataset) {
  const previous = datasets.find((item) => item.id === widget.datasetId);
  // A reused dataset must never silently change another widget's SQL.
  const unchanged = previous?.source.kind === "sql" && JSON.stringify(previous.source) === JSON.stringify(dataset.source);
  const saved = unchanged ? previous : dataset;
  return { widget: { ...widget, tableSlug: "", datasetId: saved.id, filters: {}, answers: {} }, datasets: unchanged ? datasets : [...datasets.filter((item) => item.id !== saved.id), saved] };
}


/** A new result schema keeps valid choices and replaces stale chart/visibility keys. */
export function reconcileSqlFields(widget: Widget, fields: { slug: string; type: string }[]): Widget {
  const exists = (slug: string) => fields.some((field) => field.slug === slug);
  const next = { ...widget, groupSlug: exists(widget.groupSlug) ? widget.groupSlug : fields.find((field) => field.type !== "NUMBER")?.slug ?? fields[0]?.slug ?? "", valueSlug: fields.some((field) => field.slug === widget.valueSlug && field.type === "NUMBER") ? widget.valueSlug : fields.find((field) => field.type === "NUMBER")?.slug ?? "", splitSlug: exists(widget.splitSlug) ? widget.splitSlug : "" };
  if (widget.columns) { const selected = widget.columns.filter(exists); if (selected.length) next.columns = selected; else delete next.columns; }
  return next;
}
