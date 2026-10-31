import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CHART_KINDS, newChart } from "../model/chart";
import type { Field } from "@/features/table";
import { ChartCard } from "./ChartView";

vi.mock("react-i18next", async original => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
const noop = () => {};
const fields = ["category", "split", "amount", "x", "y", "lat", "lon"].map(slug => ({ slug, label: slug, labels: {}, type: ["category", "split"].includes(slug) ? "SINGLE_LINE" : "NUMBER", options: new Map(["Alpha", "Beta", "One", "Two"].map(value => [value, { value, label: value, labels: {}, color: null, icon: null, group: null }])) })) as Field[];
const rows = [{ category: "Alpha", split: "One", amount: 4, x: 2, y: 3, lat: 40, lon: 69 }, { category: "Beta", split: "Two", amount: 7, x: 4, y: 5, lat: 41, lon: 70 }];
const config = { ...newChart(), groupSlug: "category", splitSlug: "split", valueSlug: "amount", aggregation: "sum" as const, xSlug: "x", ySlug: "y", sizeSlug: "amount", latitudeSlug: "lat", longitudeSlug: "lon" };
const render = (kind: typeof CHART_KINDS[number], selectedKey?: string) => renderToStaticMarkup(<ChartCard config={{ ...config, kind }} columns={fields} relations={[]} rows={rows} language="en" editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} onPick={noop} selectedKey={selectedKey} hideHeader plain />);

test.each(CHART_KINDS)("%s exposes data through the shared portal tooltip", kind => {
  expect(render(kind)).toContain("data-tooltip-anchor");
});
test("selection preserves data and marks the selected category while muting other bars", () => {
  const html = render("column", "Alpha");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("fill-border-strong stroke-border-strong");
  expect(html).toContain("Beta");
  expect(render("column")).not.toContain("fill-border-strong stroke-border-strong");
});

test("a statistic label below its value wraps instead of losing text", () => {
  const html = renderToStaticMarkup(<ChartCard config={{ ...config, kind: "stat", title: "Average tenure before dismissal", appearance: { titleBelow: true } }} columns={fields} relations={[]} rows={rows} language="en" editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} onPick={noop} plain />);
  expect(html).toMatch(/<h3[^>]*whitespace-normal break-words[^>]*>Average tenure before dismissal<\/h3>/);
  expect(html).not.toMatch(/<h3[^>]*truncate/);
});
