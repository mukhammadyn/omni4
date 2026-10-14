import { expect, test } from "vitest";
import { newChart, type Item } from "@/features/item";
import type { Field } from "@/features/table";
import { toTree, toTreeAttribute, patchDashboard, patchFolder, type Widget } from "./dashboard";
import { resolveDataset, toDatasets, type Dataset } from "./datasets";
import { chartSelection, ratioValue, widgetFieldSlugs, widgetReady } from "./widget-advanced";
import { planWidgetReads, resetWidgetSource } from "./widget-source";

const base: Widget = { ...newChart(), tableSlug: "events", filters: {}, answers: {} };
const fields = [{ slug: "amount", type: "NUMBER" }, { slug: "stage", type: "STATUS" }, { slug: "other", type: "NUMBER" }] as Field[];
const source: Dataset = { id: "shared", name: "Done events", source: { kind: "table", tableSlug: "events", fields: ["stage", "amount"], filters: { stage: { op: "is", values: ["Done"] } }, joins: [] } };

test("catalog and advanced widgets survive save, reopen and folder/dashboard changes", () => {
  const widget: Widget = { ...base, type: "ratio", datasetId: "shared", ratio: { numerator: { id: "numerator", aggregation: "sum", field: "amount" }, denominator: { id: "denominator", aggregation: "count", field: "" }, percent: false } };
  const tree = { datasets: [source], folders: [{ id: "f", moduleId: "m", title: "folder", dashboards: [{ id: "d", title: "dashboard", emoji: "📊", description: "", filters: [], widgets: [widget, { ...base, type: "heading" as const, body: "Sales\nsummary" }, { ...base, type: "pivot" as const, pivotRows: ["stage"], pivotSkipEmpty: true }, { ...base, type: "goal" as const, goal: 2000 }] }] }] };
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
  expect(patchDashboard(tree, "d", (d) => ({ ...d, title: "updated" })).datasets).toEqual([source]);
  expect(patchFolder(tree, "f", (f) => ({ ...f, title: "updated" })).datasets).toEqual([source]);
});
test("shared mandatory filters intersect card scope and missing/SQL/joined sources never fall back", () => {
  const card = { ...base, datasetId: "shared", filters: { stage: { op: "is" as const, values: ["Done", "New"] } } };
  expect(resolveDataset(card, [source]).widget.filters).toEqual({ stage: { op: "is", values: ["Done"] } });
  expect(resolveDataset(card, []).widget.tableSlug).toBe("");
  const sql: Dataset = { id: "shared", name: "SQL", source: { kind: "sql", sql: "SELECT 1", columns: [], parameters: [] } };
  expect(resolveDataset(card, [sql]).error).toBe("dashboard.datasetUnavailable");
  expect(resolveDataset(card, [{ ...source, source: { ...source.source as Extract<Dataset["source"], { kind: "table" }>, joins: [{ fromTable: "events", field: "owner", toTable: "employees", kind: "left" }] } }]).widget.tableSlug).toBe("");
  expect(toDatasets([{ ...source, source: { ...source.source, filters: { stage: "invalid" } } }])).toEqual([]);
});
test("ratios reduce original data and zero denominators return no value", () => {
  const card = { ...base, type: "ratio" as const, ratio: { numerator: { id: "numerator", field: "amount", aggregation: "sum" as const }, denominator: { id: "denominator", field: "", aggregation: "count" as const }, percent: false } };
  const rows: Item[] = [{ amount: 10 }, { amount: 20 }, { amount: 100 }];
  expect(ratioValue(rows, card)).toEqual({ numerator: 130, denominator: 3, value: 130 / 3 });
  expect(ratioValue([], card).value).toBeNull();
  expect(widgetReady(card, fields)).toBe(true);
  expect(widgetReady(card, fields.filter((field) => field.slug !== "amount"))).toBe(false);
  expect(widgetReady({ ...base, type: "goal", kind: "stat", goal: 0 }, fields)).toBe(false);
});
test("advanced roles obey rights and source reset clears all field-dependent settings", () => {
  const card = { ...base, kind: "bubble" as const, groupSlug: "stage", xSlug: "amount", ySlug: "other", sizeSlug: "secret", pivotRows: ["secret"], datasetId: "shared" };
  expect(widgetFieldSlugs(card)).toEqual(["stage", "amount", "other", "secret"]);
  expect(planWidgetReads(card, {}, [], {}, fields, [], {}, () => true, {}).forbidden).toBe(true);
  const reset = resetWidgetSource(card, "people");
  for (const key of ["xSlug", "ySlug", "sizeSlug", "pivotRows", "datasetId"]) expect(reset).not.toHaveProperty(key);
});
test("chart selection uses exact IN categories and excludes buckets, blanks and Other", () => {
  const card = { ...base, groupSlug: "stage" };
  expect(chartSelection(card, "Done", fields)).toEqual({ stage: { op: "is", values: ["Done"] } });
  expect(chartSelection(card, " other", fields)).toBeNull();
  expect(chartSelection({ ...card, groupBucket: "month" }, "2026-10", fields)).toBeNull();
});

test("ratio source resets keep usable defaults and clear numeric roles", () => {
  const ratio = { ...base, type: "ratio" as const, ratio: { numerator: { id: "numerator", field: "secret", aggregation: "sum" as const }, denominator: { id: "denominator", field: "other", aggregation: "avg" as const }, percent: true } };
  const reset = resetWidgetSource(ratio, "people");
  expect(reset.ratio).toEqual({ numerator: { id: "numerator", field: "", aggregation: "count" }, denominator: { id: "denominator", field: "", aggregation: "count" }, percent: false });
  expect(widgetReady(reset, fields)).toBe(true);
});
