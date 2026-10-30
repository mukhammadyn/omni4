import { describe, expect, it } from "vitest";
import { newChart } from "@/features/item";
import type { Field } from "@/features/table";
import { assignBuilderField, builderRoles } from "./builder-fields";
const widgetDraft = () => ({ ...newChart(), tableSlug: "events", filters: {}, answers: {} });
const field = (slug: string, type: string) => ({ slug, type }) as Field;
describe("builder field assignment", () => {
  it("maps dates to the existing bucket contract and keeps SQL grouping raw", () => {
    expect(assignBuilderField(widgetDraft(), field("date", "DATE"), "group", false)).toEqual({ groupSlug: "date", groupBucket: "month" });
    expect(assignBuilderField(widgetDraft(), field("date", "DATE"), "group", true)).toEqual({ groupSlug: "date" });
  });
  it("rejects text as a sum and does not reset filters or other widget settings", () => {
    const widget = { ...widgetDraft(), filters: { name: { op: "is" as const, values: ["A"] } } };
    expect(assignBuilderField(widget, field("name", "SINGLE_LINE"), "value", false)).toBeNull();
    expect(assignBuilderField(widget, field("amount", "MONEY"), "value", false)).toEqual({ valueSlug: "amount", aggregation: "sum" });
    expect(widget.filters.name.values).toEqual(["A"]);
  });
  it("does not overwrite advanced, raw or multiple-measure configuration", () => {
    expect(builderRoles({ ...widgetDraft(), kind: "scatter" }, false)).toEqual([]);
    expect(builderRoles({ ...widgetDraft(), type: "pivot" }, false)).toEqual([]);
    expect(builderRoles({ ...widgetDraft(), measures: [{ id: "a", field: "amount", aggregation: "sum" }] }, false)).not.toContain("value");
  });
  it("deduplicates visible record columns for both table and SQL sources", () => {
    const widget = { ...widgetDraft(), type: "records" as const, columns: ["name"] };
    expect(assignBuilderField(widget, field("name", "SINGLE_LINE"), "columns", false)).toEqual({ columns: ["name"] });
    expect(assignBuilderField(widget, field("amount", "NUMBER"), "columns", true)).toEqual({ columns: ["name", "amount"] });
  });
});

it("allows an SQL calendar order column without displaying numeric month labels", () => {
  const widget = { ...widgetDraft(), kind: "column" as const, groupSlug: "month", valueSlug: "total" };
  expect(assignBuilderField(widget, field("month_order", "NUMBER"), "sort", true)).toEqual({ sorts: [{ field: "month_order", direction: "asc" }] });
  expect(assignBuilderField(widget, field("month_order", "NUMBER"), "sort", false)).toBeNull();
});
