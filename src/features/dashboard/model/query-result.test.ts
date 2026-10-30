import { expect, test } from "vitest";
import { chartSeries, newChart, valueLabelOf } from "@/features/item";
import { hasQueryStatistic, queryChartRows, queryFields, toQueryResult } from "./query-result";

test("ordered SQL output becomes native table items and chart fields", () => {
  const result = toQueryResult({ columns: [{ key: "label", type: "text" }, { key: "total", type: "numeric" }], rows: [["Alice", "12.34"], ["Bob", "20.66"]], limit: 100, truncated: false });
  expect(result.rows).toEqual([{ label: "Alice", total: "12.34" }, { label: "Bob", total: "20.66" }]);
  expect(queryFields(result).map((field) => [field.slug, field.type])).toEqual([["label", "SINGLE_LINE"], ["total", "NUMBER"]]);
  expect(queryFields(result).every((field) => !field.editable)).toBe(true);
  const series = chartSeries(queryChartRows(result), { ...newChart(), kind: "bar", groupSlug: "label", valueSlug: "total", aggregation: "sum" });
  expect(Object.fromEntries(series.points.map((point) => [point.key, point.value]))).toEqual({ Alice: 12.34, Bob: 20.66 });
  const label = valueLabelOf(queryFields(result)[0]!, [], "en");
  const rendered = chartSeries(queryChartRows(result), { ...newChart(), kind: "bar", groupSlug: "label", valueSlug: "total", aggregation: "sum" }, { group: { label } });
  expect(rendered.points.map(point => point.label).sort()).toEqual(["Alice", "Bob"]);
});
test("tables preserve exact numeric values and charts refuse unsafe conversion", () => {
  const result = toQueryResult({ columns: [{ key: "total", type: "numeric" }, { key: "count", type: "int8" }], rows: [["9007199254741005.35", "9007199254740993"]], limit: 100, truncated: true });
  expect(result.rows[0]?.["total"]).toBe("9007199254741005.35");
  expect(() => queryChartRows(result)).toThrow("use a table");
  expect(result.truncated).toBe(true);
  const precise = toQueryResult({ columns: [{ key: "total", type: "numeric" }], rows: [["0.123456789012345678901"]], limit: 100, truncated: false });
  expect(() => queryChartRows(precise)).toThrow("use a table");
});
test("malformed, reordered or untrusted column/cell contracts are rejected", () => {
  const valid = { columns: [{ key: "total", type: "numeric" }], rows: [["12.34"]], limit: 100, truncated: false };
  for (const response of [
    { ...valid, rows: [[12.34]] }, { ...valid, rows: [["NaN"]] }, { ...valid, rows: [["12.34", "extra"]] },
    { ...valid, columns: [{ key: "__proto__", type: "text" }] }, { ...valid, columns: [{ key: "total", type: "unknown" }] },
    { ...valid, limit: 0 }, { ...valid, truncated: "false" }, { ...valid, columns: [{ key: "total", type: "numeric" }, { key: "total", type: "numeric" }] },
  ]) expect(() => toQueryResult(response)).toThrow();
});
test("empty SQL results retain schema and nullable values", () => {
  const result = toQueryResult({ columns: [{ key: "total", type: "numeric" }], rows: [], limit: 100, truncated: false });
  expect(queryFields(result)).toHaveLength(1);
  expect(queryChartRows(result)).toEqual([]);
  expect(hasQueryStatistic(result, "total")).toBe(false);
  expect(hasQueryStatistic(toQueryResult({ ...result, rows: [[null]] }), "total")).toBe(false);
  expect(hasQueryStatistic(toQueryResult({ ...result, rows: [["0"]] }), "total")).toBe(true);
  expect(toQueryResult({ ...result, rows: [[null]] }).rows).toEqual([{ total: null }]);
});

test("calendar names sort by a separate returned number without visible prefixes", () => {
  const result = toQueryResult({ columns: [{ key: "month", type: "text" }, { key: "order", type: "int4" }, { key: "total", type: "int4" }], rows: [["Март", 3, 5], ["Январь", 1, 0], ["Февраль", 2, 1]], limit: 1000, truncated: false });
  const series = chartSeries(queryChartRows(result), { ...newChart(), kind: "column", groupSlug: "month", valueSlug: "total", aggregation: "sum", sorts: [{ field: "order", direction: "asc" }] });
  expect(series.points.map((point) => point.label)).toEqual(["Январь", "Февраль", "Март"]);
  expect(series.points.map((point) => point.value)).toEqual([0, 1, 5]);
});

test("record links stay internal and encode identifiers", async () => {
  const { queryRecordHref } = await import('./query-result');
  expect(queryRecordHref('/employees/{value}', 'a/b?x=1')).toBe('/employees/a%2Fb%3Fx%3D1');
  for (const template of ['https://other.example/{value}', '//other.example/{value}', 'javascript:{value}', '/\\other.example/{value}', '/records/{value}\n']) expect(queryRecordHref(template, 'id')).toBeUndefined();
  expect(queryRecordHref('/employees/{value}', null)).toBeUndefined();
});
