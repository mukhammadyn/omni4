import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { toField } from "@/features/table";
import { chartSeries, newChart, toCharts, toChartsAttribute } from "../model/chart";
import { stackedBands } from "../model/chart-geometry";
import { CartesianChart, PieChart } from "./ChartExtra";
import { ChartCard } from "./ChartView";

vi.mock("react-i18next", async (importOriginal) => ({ ...await importOriginal<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
const config = { ...newChart(), kind: "column" as const, groupSlug: "category", splitSlug: "series", valueSlug: "amount", aggregation: "sum" as const };
const rows = [{ category: "A", series: "First", amount: 2 }, { category: "A", series: "Second", amount: 3 }, { category: "B", series: "First", amount: -2 }, { category: "B", series: "Second", amount: 4 }];
const series = chartSeries(rows, config);
const noop = () => {};

test("appearance flags round trip and absent flags retain legacy defaults", () => {
  const legacy = toCharts(toChartsAttribute([config]))[0]!;
  expect(legacy.showGrid).toBeUndefined();
  expect(legacy.showLegend).toBeUndefined();
  expect(legacy.stacked).toBeUndefined();
  const next = { ...config, showGrid: true, showLegend: false, stacked: true };
  expect(toCharts(toChartsAttribute([next]))[0]).toMatchObject({ showGrid: true, showLegend: false, stacked: true });
  expect(toCharts([{ ...toChartsAttribute([config])[0], show_grid: "yes", show_legend: 0, stacked: "true" }])[0]).toEqual(legacy);
});
test("comparison palettes and axis titles remain editable for ordinary columns", () => {
  const appearance = {palette:"warm" as const,axisTicks:true,axisTitleLeft:"Минуты",axisTitleX:"Сотрудник"};
  expect(toCharts(toChartsAttribute([{...config,appearance}]))[0]?.appearance).toEqual(appearance);
  const html=renderToStaticMarkup(<CartesianChart config={{...config,appearance}} series={series} locale="ru"/>);
  expect(html).toContain("Минуты");expect(html).toContain("Сотрудник");
});
test("grid is opt-in and absolute stacks retain values and separate negative bands", () => {
  const plain = renderToStaticMarkup(<CartesianChart config={config} series={series} locale="en" />);
  const grid = renderToStaticMarkup(<CartesianChart config={{ ...config, showGrid: true }} series={series} locale="en" />);
  expect(plain).not.toContain("data-chart-grid");
  expect(grid.match(/data-chart-grid/g)).toHaveLength(5);
  const bands = stackedBands(series);
  const a = bands[series.points.findIndex((point) => point.key === "A")]!;
  expect(a.min).toBe(0); expect(a.max).toBe(5);
  const b = bands[series.points.findIndex((point) => point.key === "B")]!;
  expect(b.min).toBe(-2); expect(b.max).toBe(4);
  expect(b.bands.map((band) => band.value).sort()).toEqual([-2, 4]);
  const stacked = renderToStaticMarkup(<CartesianChart config={{ ...config, stacked: true }} series={series} locale="en" />);
  expect(stacked).not.toEqual(plain);
  expect(stacked).toContain("A"); expect(stacked).toContain("Second");
});
test("hidden legends stay available to screen readers and chart values remain unchanged", () => {
  const fields = [toField({ id: "category", slug: "category", type: "SINGLE_LINE" }), toField({ id: "series", slug: "series", type: "SINGLE_LINE" }), toField({ id: "amount", slug: "amount", type: "NUMBER" })];
  for (const value of ["A", "B"]) fields[0]!.options.set(value, { value, label: value, labels: {}, color: "", icon: null, group: null });
  for (const value of ["First", "Second"]) fields[1]!.options.set(value, { value, label: value, labels: {}, color: "", icon: null, group: null });
  const props = { columns: fields, relations: [], rows, language: "en", editing: false, dragged: false, over: false, onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDrop: noop, onMove: noop, onChange: noop, onRemove: noop };
  const shown = renderToStaticMarkup(<ChartCard {...props} config={config} />);
  const hidden = renderToStaticMarkup(<ChartCard {...props} config={{ ...config, showLegend: false }} />);
  expect(shown).toContain('data-chart-legend="true"');
  expect(hidden).toContain('class="sr-only" data-chart-legend="true"');
  expect(hidden).toContain("First"); expect(hidden).toContain("Second");
});

test("pie appearance survives save and rejects malformed settings", () => {
  const appearance = { legendPosition: "bottom" as const, legendPercent: true, pieSize: 240, palette: "cool" as const };
  expect(toCharts(toChartsAttribute([{ ...config, appearance }]))[0]?.appearance).toEqual(appearance);
  expect(toCharts([{ ...toChartsAttribute([config])[0], appearance: { legendPosition: "absolute", pieSize: 9000, legendPercent: "true", palette: "url(secret)" } }])[0]?.appearance).toEqual({ pieSize: 400 });
});
test("pie legend percentages preserve zero categories and selection remains accessible", () => {
  const pie = chartSeries([{ category: "A", amount: 3 }, { category: "B", amount: 1 }, { category: "C", amount: 0 }], { ...config, splitSlug: "", kind: "pie" });
  const html = renderToStaticMarkup(<PieChart series={pie} locale="en" appearance={{ legendPosition: "bottom", legendPercent: true, pieSize: 240, palette: "cool" }} onPick={noop} selectedKey="A" />);
  expect(html).toContain("75.00%"); expect(html).toContain("25.00%"); expect(html).toContain("0.00%");
  expect(html).toContain('aria-pressed="true"'); expect(html).toContain("var(--color-border-strong)"); expect(html).toContain("var(--color-chart-cool-1)");
  expect(html).toContain("data-tooltip-anchor"); expect(html).not.toContain("NaN");
});
