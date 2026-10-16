import { expect, test } from "vitest";
import { newDashboard, newFolder, toTree, toTreeAttribute } from "./dashboard";
import type { Dataset, DatasetTable } from "./datasets";
import { queryCapability } from "./query-capability";
import { boundedSqlSuggestions, sqlSupportIssue, supportedSqlExamples } from "./sql-query-guidance";
import { sqlWidgetFrom } from "./sql-widget";

test("only a matching bounded server capability can enable the query runner", () => {
  const caps = { enabled: true, protocol_version: 3, project_id: "project", environment_id: "env", menu_id: "menu", row_limit: 1000, statement_timeout_ms: 5000 };
  const read = (value: unknown) => queryCapability(value, "project", "env", "menu");
  expect(read(caps)).toEqual({ enabled: true, limit: 1000 });
  expect(queryCapability({ ...caps, project_id: undefined, environment_id: undefined }, undefined, undefined, "menu").enabled).toBe(false);
  for (const value of [null, {}, { ...caps, enabled: false }, { ...caps, enabled: "true" }, { ...caps, protocol_version: 2 }, { ...caps, project_id: "other" }, { ...caps, environment_id: "other" }, { ...caps, menu_id: "other" }, { ...caps, row_limit: 1001 }, { ...caps, row_limit: 0 }, { ...caps, row_limit: 1.5 }, { ...caps, statement_timeout_ms: 0 }]) expect(read(value).enabled).toBe(false);
});

test("advanced guidance names unsupported cases and leaves typed names alone", () => {
  for (const [sql, issue] of [
    ["SELECT * FROM deals", "star"], ["WITH q AS (SELECT amount FROM deals) SELECT amount FROM q", "cte"],
    ["SELECT COALESCE(amount, 0) FROM deals", "function"], ["SELECT amount FROM (SELECT amount FROM deals) d", "nested"],
    ["DELETE FROM deals", "write"], ["SELECT amount FROM deals WHERE amount IN (:value)", "clause"],
    ["SELECT amount FROM deals WHERE currency = 'USD'", "literal"],
  ] as const) expect(sqlSupportIssue(sql)).toBe(issue);
  for (const sql of ["SELECT COUNT(*) FROM deals", "SELECT SUM(amount) AS total FROM deals WHERE amount >= :update AND currency = :or", 'SELECT "update" FROM "with"', "SELECT amount FROM deals -- DROP TABLE deals"]) expect(sqlSupportIssue(sql)).toBeNull();
});

test("schema examples use explicit permitted columns and keep JOIN currency grouping", () => {
  const catalog: DatasetTable[] = [{ slug: "deals", label: "Deals", fields: [{ slug: "amount", label: "Amount", type: "NUMBER" }, { slug: "currency", label: "Currency", type: "SINGLE_LINE" }, { slug: "owner_id", label: "Owner", type: "LOOKUP", target: "employees", joinable: true }] }, { slug: "employees", label: "People", fields: [{ slug: "guid", label: "ID", type: "UUID" }, { slug: "name", label: "Name", type: "SINGLE_LINE" }] }];
  const examples = supportedSqlExamples(catalog);
  expect(examples.map(example => example.kind)).toEqual(["table", "totals", "join"]);
  expect(examples.every(example => sqlSupportIssue(example.sql) === null)).toBe(true);
  expect(examples.find(example => example.kind === "join")?.sql).toContain('GROUP BY "related"."name", "t"."currency"');
  expect(examples.every(example => !example.sql.includes("secret") && !example.sql.includes("SELECT *"))).toBe(true);
  expect(supportedSqlExamples([])).toEqual([]);
  expect(boundedSqlSuggestions("", 0, catalog).some(item => ["WITH", "HAVING", "OR", "COALESCE", "NULLIF"].includes(item.value))).toBe(false);
});

test("SQL widget and dataset survive real menu serialization without query output or values", () => {
  const dataset: Dataset = { id: "sql-dataset", name: "Joined total", source: { kind: "sql", sql: "SELECT currency, COUNT(*) AS total FROM deals WHERE amount >= :minimum GROUP BY currency", parameters: [{ name: "minimum", type: "number", required: true }], columns: [] } };
  const widget = sqlWidgetFrom(dataset, { type: "chart", kind: "bar", group: "currency", value: "total", split: "" });
  const tree = { folders: [{ ...newFolder("crm", "Sales"), dashboards: [{ ...newDashboard("Analytics"), widgets: [widget] }] }], datasets: [dataset] };
  const serialized = toTreeAttribute(tree);
  expect(toTree(serialized)).toEqual(tree);
  expect(JSON.stringify(serialized)).not.toContain('"rows"');
  expect(JSON.stringify(serialized)).not.toContain('"minimum":"');
  expect(widget.tableSlug).toBe("");
  expect(sqlWidgetFrom(dataset).type).toBe("records");
});
