import { expect, test } from "vitest";
import { newChart, chartSeries } from "@/features/item";
import { toField } from "@/features/table";
import { calculatedProjection, compileCalculation } from "./calculated-fields";
import { parseFieldPresentation, presentFields } from "./field-presentation";
import { toDatasets } from "./datasets";
import { sqlWidgetFrom } from "./sql-widget";
import { assignBuilderField } from "./builder-fields";
import { toTree, toTreeAttribute } from "./dashboard";
const fields = [toField({ id: "amount", slug: "amount", label: "Amount", type: "NUMBER" }), toField({ id: "name", slug: "name", label: "Name", type: "SINGLE_LINE" })];
test("arithmetic follows precedence, supports numeric strings and rejects missing/null/divide-zero values", () => {
 const calc = compileCalculation("([amount] + 2) * 3 - 4 / 2", fields);
 expect(calc({ amount: "4" })).toBe(16);
 expect(calc({ amount: null })).toBeNull();
 expect(compileCalculation("[amount] / 0", fields)({ amount: 4 })).toBeNull();
});
test("formulas cannot execute JS, read hidden fields, chain definitions, or overwrite source fields", () => {
 for (const expr of ["alert(1)", "[private_amount]+1", "[name]*2", "[calc_a]*2", "constructor.constructor('return 1')()", "(".repeat(30)+"1"+")".repeat(30)]) expect(() => compileCalculation(expr, fields)).toThrow();
 const result = calculatedProjection(fields, [{ slug: "amount", label: "Overwrite", expression: "42" }, { slug: "calc_bad", label: "Hidden", expression: "[private_amount]" }, { slug: "calc_tax", label: "Tax", expression: "[amount]*0.12" }]);
 expect(result.fields.map((f) => f.slug)).toEqual(["amount", "name", "calc_tax"]);
 expect(result.rows([{ amount: 100 }])[0]).toMatchObject({ amount: 100, calc_tax: 12 });
});
test("display overrides never create fields or change IDs and numeric types", () => {
 const presentation = parseFieldPresentation({ amount: { label: "Revenue", description: "Net", hidden: true }, secret: { label: "Private" } });
 expect(presentFields(fields, presentation)).toHaveLength(2);
 expect(presentFields(fields, presentation)[0]).toMatchObject({ slug: "amount", type: "NUMBER", label: "Revenue" });
});
test("SQL defaults preserve exact decimal strings and legacy parameters remain optional", () => {
 const parsed = toDatasets([{ id: "sql", name: "Query", source: { kind: "sql", sql: "SELECT :n", parameters: [{ name: "n", type: "number", required: true, defaultValue: "9007199254740993.12" }, { name: "old", type: "text", required: true }] } }]);
 expect(parsed[0]?.source.kind === "sql" && parsed[0].source.parameters).toEqual([{ name: "n", type: "number", required: true, defaultValue: "9007199254740993.12" }, { name: "old", type: "text", required: true }]);
});
test("new widget attributes survive dashboard save/reopen alongside existing fields", () => {
 const tree = toTree({ folders: [{ id: "f", dashboards: [{ id: "d", widgets: [{ ...newChart(), table_slug: "events", refresh_interval: 900000, calculated_fields: [{ slug: "calc_tax", label: "Tax", expression: "[amount]*.12" }], field_presentation: { amount: { label: "Revenue", description: "Net", hidden: true } }, sorts: [{ field: "amount", direction: "asc" }] }] }] }] });
 expect(toTree(toTreeAttribute(tree))).toEqual(tree);
 expect(tree.folders[0]?.dashboards[0]?.widgets[0]?.calculatedFields?.[0]?.expression).toBe("[amount]*.12");
});
test("explicit chart sorting uses aggregated values rather than source-row order", () => {
 const config = { ...newChart(), kind: "column" as const, aggregation: "sum" as const, groupSlug: "name", valueSlug: "amount", sorts: [{ field: "amount", direction: "asc" as const }] };
 expect(chartSeries([{ name: "B", amount: 2 }, { name: "A", amount: 1 }, { name: "A", amount: 5 }], config).points.map((p) => p.value)).toEqual([2, 6]);
 expect(chartSeries([{ name: "B", amount: 2 }, { name: "A", amount: 6 }], { ...config, sorts: [{ field: "name", direction: "asc" }] }).points.map((p) => p.key)).toEqual(["A", "B"]);
});

test("record sorting excludes client formula fields while chart sorting accepts the aggregated measure", () => {
 const derived = toField({ id: "calc_tax", slug: "calc_tax", label: "Tax", type: "NUMBER" });
 const widget = { ...newChart(), tableSlug: "events", filters: {}, answers: {}, valueSlug: "calc_tax", calculatedFields: [{ slug: "calc_tax", label: "Tax", expression: "[amount]*.12" }] };
 expect(assignBuilderField({ ...widget, type: "records" }, derived, "sort", false)).toBeNull();
 expect(assignBuilderField({ ...widget, kind: "column" }, derived, "sort", false)).toEqual({ sorts: [{ field: "calc_tax", direction: "asc" }] });
});

test("numeric field aggregation defaults persist and assigning a field respects chart constraints", () => {
 const metadata = parseFieldPresentation({ amount: { aggregation: "avg" }, name: { aggregation: "unsafe" } });
 expect(metadata.amount?.aggregation).toBe("avg"); expect(metadata.name?.aggregation).toBeUndefined();
 const widget = { ...newChart(), tableSlug: "events", filters: {}, answers: {}, fieldPresentation: metadata };
 expect(assignBuilderField({ ...widget, kind: "column" }, fields[0]!, "value", false)).toMatchObject({ aggregation: "avg" });
 expect(assignBuilderField({ ...widget, kind: "pie" }, fields[0]!, "value", false)).toMatchObject({ aggregation: "sum" });
 expect(assignBuilderField({ ...widget, kind: "column" }, fields[0]!, "value", true)).toMatchObject({ aggregation: "sum" });
 const tree = toTree({ folders: [{ id: "f", dashboards: [{ id: "d", widgets: [{ ...newChart(), kind: "column", table_slug: "events", show_legend: false, show_grid: true, stacked: true, field_presentation: metadata }] }] }] });
 expect(toTree(toTreeAttribute(tree))).toEqual(tree);
 expect(tree.folders[0]?.dashboards[0]?.widgets[0]).toMatchObject({ showLegend: false, showGrid: true, stacked: true, fieldPresentation: metadata });
});
test("SQL presentations preserve optional appearance flags", () => {
 const dataset = { id: "sql", name: "SQL", source: { kind: "sql" as const, sql: "SELECT amount FROM events", parameters: [], columns: [] } };
 expect(sqlWidgetFrom(dataset, { type: "chart", kind: "column", group: "category", value: "amount", split: "series", showLegend: false, showGrid: true, stacked: true })).toMatchObject({ showLegend: false, showGrid: true, stacked: true });
});
