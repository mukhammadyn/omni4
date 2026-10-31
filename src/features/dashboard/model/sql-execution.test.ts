import { expect, test } from "vitest";
import { newDashboard, newFolder, toTree, toTreeAttribute } from "./dashboard";
import type { Dataset, DatasetTable } from "./datasets";
import { boundedSqlSuggestions, sqlSupportIssue, supportedSqlExamples } from "./sql-query-guidance";
import { sqlWidgetFrom } from "./sql-widget";

test("advanced guidance names unsupported cases and leaves typed names alone", () => {
  for (const [sql, issue] of [
    ["WITH q AS (SELECT amount FROM deals) SELECT amount FROM q", "cte"],
    ["SELECT COALESCE(amount, 0) FROM deals", "function"], ["SELECT amount FROM (SELECT amount FROM deals) d", "nested"],
    ["DELETE FROM deals", "write"], ["SELECT amount FROM deals WHERE amount IN (:value)", "clause"],
  ] as const) expect(sqlSupportIssue(sql)).toBe(issue);
  for (const sql of ["SELECT * FROM chats", "SELECT currency FROM deals WHERE currency = 'USD'", "SELECT COUNT(*) FROM deals", "SELECT SUM(amount) AS total FROM deals WHERE amount >= :update AND currency = :or", 'SELECT "update" FROM "with"', "SELECT amount FROM deals -- DROP TABLE deals"]) expect(sqlSupportIssue(sql)).toBeNull();
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

test("calendar reports allow complete age and zero-filled months without arbitrary SQL functions", () => {
  for (const sql of [
    "SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date::date)) AS age FROM hr_employees",
    "SELECT ROUND(AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date::date))), 1) AS age FROM hr_employees",
    "SELECT m, COUNT(e.guid) FROM generate_series(1, 12) AS m LEFT JOIN hr_employees AS e ON EXTRACT(MONTH FROM e.birth_date) = m GROUP BY m",
    "SELECT CASE WHEN birth_date IS NULL THEN 'Unknown' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) <= 25 THEN '≤25' ELSE '26+' END AS band FROM hr_employees",
  ]) expect(sqlSupportIssue(sql), sql).toBeNull();
  for (const sql of [
    "SELECT pg_sleep(10)", "SELECT evil.age(birth_date) FROM hr_employees", 'SELECT "age"(birth_date) FROM hr_employees',
    "SELECT EXTRACT(EPOCH FROM birth_date) FROM hr_employees", "SELECT generate_series(0,12)",
    "SELECT generate_series(1,10000000)", "SELECT generate_series(1,:last)", "SELECT generate_series(1,12,1)",
    "SELECT generate_series(12,1)", "SELECT generate_series(1,12), generate_series(1,12)",
    "SELECT generate_series(1,12 /* hidden */)",
  ]) expect(sqlSupportIssue(sql), sql).toBe("function");
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
  expect(sqlWidgetFrom(dataset, { type: "chart", kind: "column", group: "month", value: "total", split: "", sorts: [{ field: "month", direction: "asc" }] }).sorts).toEqual([{ field: "month", direction: "asc" }]);
});

test("reserved syntax groups pure expressions but never permits qualified or nested arbitrary calls",()=>{
 expect(sqlSupportIssue("SELECT (1 + 2) AS value FROM people WHERE (age > 20) AND (age < 30)")).toBeNull();
 expect(sqlSupportIssue("SELECT CASE WHEN (age > 20) THEN (age + 1) ELSE (0) END FROM people")).toBeNull();
 for(const sql of ["SELECT CASE WHEN (pg_sleep(1)) THEN 1 ELSE 0 END FROM people", "SELECT public.when(1) FROM people", "SELECT public.count(*) FROM people", "SELECT (pg_catalog.age(now(), birth_date)) FROM people", 'SELECT "when"(1) FROM people']) expect(sqlSupportIssue(sql)).toBe("function");
});
