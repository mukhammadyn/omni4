import { describe, expect, it } from "vitest";
import { newChart, chartSeries, toCharts, toChartsAttribute } from "@/features/item";
import type { Field } from "@/features/table";
import { fitRecordWidths, selectVisualization, suggestedGroup } from "./widget-editor";
import type { Widget } from "./dashboard";

const field = (slug: string, type = "SINGLE_LINE", options = 0) => ({ slug, type, options: new Map(Array.from({ length: options }, (_, index) => [String(index), {}])) }) as Field;
const widget = (): Widget => ({ ...newChart(), kind: "stat", tableSlug: "deals", filters: { stage: { op: "is", values: ["new"] } }, answers: { person: { field: "employees_id" } } });

describe("simple dashboard creation", () => {
  it("chooses one categorical status, never the unique deal title", () => {
    const fields = [field("deal_title"), field("stage", "STATUS", 4)];
    const next = selectVisualization(widget(), "donut", fields);
    expect(next.groupSlug).toBe("stage");
    expect(next.aggregation).toBe("count");
    expect(next.measures).toEqual([]);
  });
  it("asks for a grouping when categories are ambiguous or only text is available", () => {
    expect(suggestedGroup("bar", [field("name")])).toBe("");
    expect(suggestedGroup("bar", [field("stage", "STATUS", 3), field("priority", "STATUS", 3)])).toBe("");
  });
  it("uses a known creation date or a single date for a trend, with month buckets", () => {
    const dates = [field("created_at", "DATE_TIME"), field("closed_at", "DATE_TIME")];
    expect(selectVisualization(widget(), "line", dates)).toMatchObject({ groupSlug: "created_at", groupBucket: "month", measures: [] });
    expect(suggestedGroup("line", [field("start", "DATE"), field("end", "DATE")])).toBe("");
  });
  it("keeps saved dataset constraints, filters and field settings when editing the visualization", () => {
    const saved = { ...widget(), datasetId: "dataset-1", columns: ["title", "stage"], columnWidths: { title: 220 }, measures: [{ id: "revenue", field: "amount", aggregation: "sum" as const }] };
    const next = selectVisualization(saved, "records", [field("title"), field("stage")]);
    expect(next).toMatchObject({ datasetId: "dataset-1", filters: saved.filters, answers: saved.answers, columns: saved.columns, columnWidths: saved.columnWidths, measures: saved.measures });
    expect(saved.type).toBeUndefined();
  });
  it("does not reset a resized card when its selected visualization is clicked again", () => {
    const saved = { ...widget(), type: "records" as const, width: 10, height: 3, columns: ["title"], datasetId: "scoped" };
    expect(selectVisualization(saved, "records", [field("title")])).toBe(saved);
  });
});

describe("records card widths", () => {
  it("fills a wide card without adding a blank region on the right", () => {
    const fitted = fitRecordWidths(["a", "b", "c", "d"], {}, 1200);
    expect(Object.values(fitted).reduce((sum, width) => sum + width, 44)).toBe(1200);
  });
  it("keeps the actively resized column fixed and fills using the other columns", () => {
    const fitted = fitRecordWidths(["a", "b"], { a: 220, b: 160 }, 800, "a");
    expect(fitted.a).toBe(220);
    expect(fitted.b).toBe(536);
  });
  it("preserves overflowing saved widths on narrow cards instead of shrinking hidden text", () => {
    expect(fitRecordWidths(["a", "b"], { a: 400, b: 300 }, 360)).toEqual({ a: 400, b: 300 });
  });
  it("fits five default columns in the preview so the final heading remains visible", () => {
    const fitted = fitRecordWidths(["a", "b", "c", "d", "e"], {}, 640);
    expect(Object.values(fitted).reduce((sum, width) => sum + width, 44)).toBeCloseTo(640);
    expect(Math.min(...Object.values(fitted))).toBeGreaterThanOrEqual(80);
  });
});

describe("show empty categories", () => {
  it("keeps existing definitions unchanged and round trips an explicit opt-in", () => {
    const base = { ...newChart(), groupSlug: "stage" };
    expect(toCharts(toChartsAttribute([base]))[0]).not.toHaveProperty("showEmpty");
    const configured = { ...base, showEmpty: true };
    expect(toCharts(toChartsAttribute([configured]))[0]?.showEmpty).toBe(true);
    const rows = [{ stage: "new" }, { stage: null }, { stage: "" }];
    expect(chartSeries(rows, base).count).toBe(1);
    expect(chartSeries(rows, configured).points.find((point) => point.key === "")?.value).toBe(2);
  });
  it("retains the missing-date group alongside the enumerated month domain", () => {
    const config = { ...newChart(), kind: "line" as const, groupSlug: "date", groupBucket: "month" as const, showEmpty: true };
    const series = chartSeries([{ date: "2026-10-01" }, { date: null }], config, { group: { bucket: (value) => typeof value === "string" ? value.slice(0, 7) : null } });
    expect(series.points.find((point) => point.key === "")?.value).toBe(1);
    expect(series.points.find((point) => point.key === "2026-10")?.value).toBe(1);
    expect(series.points).toHaveLength(2);
  });
});
