import { niceChartTicks } from "./chart-geometry";
import { expect, test } from "vitest";
import type { Field } from "@/features/table";
import { CHART_KINDS, chartReady, chartSeries, newChart, toCharts, toChartsAttribute } from "./chart";
import { axisLabelIndexes, smoothChartPath, chartRoleIssue, linearDomain, normalizedBands, partValuesValid, treemapRects, xyPoints } from "./chart-geometry";

test("narrow daily axes retain their first/last labels and do not alter their data domain",()=>{
 const labels=Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0'));
 const narrow=[...axisLabelIndexes(labels,220)];
 expect(narrow[0]).toBe(0);expect(narrow.at(-1)).toBe(30);expect(narrow.length).toBeLessThanOrEqual(10);
 expect(narrow.slice(1).every((n,i)=>n-narrow[i]!>=4)).toBe(true);
 expect(axisLabelIndexes(labels,1100).size).toBe(31);expect(labels).toHaveLength(31);
 const months=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
 expect(axisLabelIndexes(months,900).size).toBe(12);expect(axisLabelIndexes([],390).size).toBe(0);
 const dates=labels.map(day=>`${day}.10.2026`);
 expect([...axisLabelIndexes(dates,226)]).toEqual([0,15,30]);
});
const config = { ...newChart(), groupSlug: "category", aggregation: "sum" as const, valueSlug: "amount" };
test("all 18 shapes serialize while legacy eight configurations remain compatible", () => {
  expect(CHART_KINDS).toHaveLength(18);
  for (const kind of CHART_KINDS) expect(toCharts(toChartsAttribute([{ ...config, kind, xSlug: "x", ySlug: "y", sizeSlug: "amount", latitudeSlug: "lat", longitudeSlug: "lon" }]))[0]?.kind).toBe(kind);
  const advanced = { ...config, kind: "combo" as const, measures: [{ id: "amount", field: "amount", aggregation: "sum" as const, axis: "right" as const, display: "line" as const, unit: "USD" }, { id: "count", field: "", aggregation: "count" as const, display: "column" as const }], interaction: { scope: "card" as const } };
  expect(toCharts(toChartsAttribute([advanced]))[0]).toEqual(advanced);
});
test("multi-measure averages reduce original records and never sum unlike measure totals", () => {
  const series = chartSeries([{ category: "a", amount: 10 }, { category: "a", amount: 20 }, { category: "b", amount: 100 }], { ...config, kind: "combo", measures: [{ id: "avg", field: "amount", aggregation: "avg" }, { id: "count", field: "", aggregation: "count" }] });
  expect(series.points.map((point) => [point.key, point.cells.get("avg"), point.cells.get("count")])).toEqual([["a", 15, 2], ["b", 100, 1]]);
  expect(series.total).toBeCloseTo(130 / 3);
});
test("normalized bands total 100 per category and zero denominators stay zero", () => {
  const series = chartSeries([{ category: "a", segment: "x", amount: 10 }, { category: "a", segment: "y", amount: 30 }, { category: "b", segment: "x", amount: 0 }], { ...config, kind: "column100", splitSlug: "segment" });
  const bands = normalizedBands(series);
  expect(bands.find((point) => point.key === "a")?.bands.map((band) => band.end)).toEqual([25, 100]);
  expect(bands.find((point) => point.key === "b")?.bands.at(-1)?.end).toBe(0);
  expect(partValuesValid(chartSeries([{ category: "a", amount: -1 }], config))).toBe(false);
});
test("raw roles reject hidden/non-numeric fields and geography rejects out-of-range points", () => {
  const raw = { ...config, kind: "bubble" as const, xSlug: "x", ySlug: "y", sizeSlug: "amount" };
  const fields = [{ slug: "category", type: "SINGLE_LINE" }, { slug: "x", type: "NUMBER" }, { slug: "y", type: "NUMBER" }, { slug: "amount", type: "NUMBER" }] as Field[];
  expect(chartReady(raw)).toBe(true); expect(chartRoleIssue(raw, fields)).toBeNull();
  expect(chartRoleIssue(raw, fields.filter((field) => field.slug !== "x"))).toBe("unavailable");
  expect(chartRoleIssue(raw, fields.map((field) => field.slug === "x" ? { ...field, type: "SINGLE_LINE" } : field))).toBe("numeric");
  expect(xyPoints([{ lat: 40, lon: 69 }, { lat: 95, lon: 69 }, { lat: 40, lon: "bad" }], { ...config, kind: "map", latitudeSlug: "lat", longitudeSlug: "lon" })).toMatchObject({ points: [{ x: 69, y: 40 }], excluded: 2 });
  expect(linearDomain([-8, -2])).toEqual({ min: -8, max: 0 });
});
test("treemap rectangles cover the square proportionally without overlap", () => {
  const series = chartSeries([{ category: "a", amount: 6 }, { category: "b", amount: 3 }, { category: "c", amount: 1 }], { ...config, kind: "treemap" });
  const rects = treemapRects(series);
  expect(rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBeCloseTo(10000);
  for (const rect of rects) expect(rect.width * rect.height / 10000).toBeCloseTo(rect.value / 10);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i]!, b = rects[j]!; expect(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) + 1e-8 || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y) + 1e-8).toBe(true); }
});

// Nice report axes remain dynamic for both counts and measured values.
test("nice calendar/count axis ticks", async () => {
  const { niceChartTicks } = await import("./chart-geometry");
  expect(niceChartTicks(0, 27)).toEqual([0, 5, 10, 15, 20, 25, 30]);
  expect(niceChartTicks(0, 9)).toEqual([0, 2, 4, 6, 8, 10]);
});

test("monotone line smoothing preserves endpoints and a zero plateau without overshoot",()=>{
 const path=smoothChartPath([{x:0,y:100},{x:10,y:0},{x:20,y:0}]);
 expect(path.startsWith("M0,100")).toBe(true);expect(path.endsWith("20,0")).toBe(true);expect(path).toContain(" C");expect(path).not.toContain("NaN");
 const coordinates=[...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(match=>Number(match[2]));
 expect(coordinates.every(y=>y>=0 && y<=100)).toBe(true);
 expect(smoothChartPath([])).toBe("");
});

test("integer quantity axes never repeat rounded fractional tick labels",()=>{
 expect(niceChartTicks(0,2,1)).toEqual([0,1,2]);
 expect(niceChartTicks(0,0,1)).toEqual([0,1]);
 expect(niceChartTicks(-1,2,1)).toEqual([-1,0,1,2]);
});

test("funnel presentation survives normal save and reopen",()=>{
 const config={...newChart(),kind:"funnel" as const,appearance:{funnelStyle:"tapered" as const}};
 expect(toCharts(toChartsAttribute([config]))[0]?.appearance?.funnelStyle).toBe("tapered");
});
