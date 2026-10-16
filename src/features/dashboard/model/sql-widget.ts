import { newChart, type ChartKind } from "@/features/item";
import type { Dataset } from "./datasets";
import type { Widget } from "./dashboard";

export type SqlPresentation = { type: "table" | "chart"; kind: ChartKind; group: string; value: string; split: string };
export function sqlWidgetFrom(dataset: Dataset, presentation?: SqlPresentation): Widget {
  return { ...newChart(), title: dataset.name, tableSlug: "", datasetId: dataset.id, filters: {}, answers: {}, type: presentation?.type === "chart" ? "chart" : "records", kind: presentation?.kind ?? "bar", groupSlug: presentation?.group ?? "", valueSlug: presentation?.value ?? "", splitSlug: presentation?.split ?? "", aggregation: "sum", width: 12, height: 2 };
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
