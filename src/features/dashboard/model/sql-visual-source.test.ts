import { expect, test } from "vitest";
import { buildJoinSql, completeJoinColumns, initialJoinDraft, JOIN_KINDS, type JoinDraft } from "./sql-join-builder";
import { syncVisualSql } from "./sql-visual-source";
import { toDatasets, type Dataset, type DatasetTable } from "./datasets";
import { newDashboard, newFolder, toTree, toTreeAttribute } from "./dashboard";
import { sqlWidgetFrom, stageSqlWidget, SQL_VISUALIZATIONS, reconcileSqlFields } from "./sql-widget";
import { sqlSupportIssue } from "./sql-query-guidance";
import { labelQueryResult, visibleQueryColumns, type QueryResult } from "./query-result";

export const visualCatalog: DatasetTable[] = [
  { slug: "qa_left", label: "Orders", fields: [{ slug: "id", label: "ID", type: "NUMBER" }, { slug: "name", label: "Order", type: "SINGLE_LINE" }] },
  { slug: "qa_right", label: "People", fields: [{ slug: "id", label: "ID", type: "NUMBER" }, { slug: "title", label: "Person", type: "SINGLE_LINE" }] },
];
const fresh = (): Dataset => ({ id: "visual", name: "Visual", source: { kind: "sql", sql: "", parameters: [], columns: [], sqlMode: "visual" } });
export const joinPlan = (kind: typeof JOIN_KINDS[number]): JoinDraft => completeJoinColumns({ ...initialJoinDraft("qa_left"), joins: [{ table: "qa_right", alias: "j1", kind, from: "t", left: "id", right: "id" }] }, visualCatalog);

for (const kind of JOIN_KINDS) test(`${kind.toUpperCase()} visual query, column visibility and visual controls survive dashboard save/reopen`, () => {
  const plan = joinPlan(kind), dataset = syncVisualSql(fresh(), "qa_left", visualCatalog, plan);
  if (dataset.source.kind !== "sql") throw Error("SQL source missing");
  expect(dataset.source.sql).toContain(`${kind.toUpperCase()} JOIN "qa_right"`);
  expect(sqlSupportIssue(dataset.source.sql)).toBeNull();
  const widget = sqlWidgetFrom(dataset, { type: "table", kind: "bar", group: "", value: "", split: "", columns: ["Order", "Person"] });
  const staged = stageSqlWidget([], widget, dataset);
  const tree = { folders: [{ ...newFolder("hr", "HR"), dashboards: [{ ...newDashboard("QA"), widgets: [staged.widget] }] }], datasets: staged.datasets };
  const restored = toTree(toTreeAttribute(tree));
  expect(restored).toEqual(tree);
  const source = restored.datasets![0]!.source;
  if (source.kind !== "sql" || !source.visual) throw Error("Visual source missing on reopen");
  expect(buildJoinSql(source.visual, visualCatalog).sql).toBe(dataset.source.sql);
  expect(restored.folders[0]?.dashboards[0]?.widgets[0]?.columns).toEqual(["Order", "Person"]);
});

test("selected table opens nonblank even before catalog resolves, then fills business-label projections", () => {
  const seeded = syncVisualSql(fresh(), "qa_left", []);
  expect(seeded.source).toMatchObject({ sql: 'SELECT *\nFROM "qa_left"\nLIMIT 100' });
  const resolved = syncVisualSql(seeded, "qa_left", visualCatalog);
  expect(resolved.source).toMatchObject({ sqlMode: "visual" });
  if (resolved.source.kind === "sql") expect(resolved.source.sql).toContain('"t"."name" AS "Order"');
});

test("manual SQL and deliberately cleared drafts survive table, JOIN, catalog and tab changes", () => {
  for (const sql of ['SELECT * FROM "qa_left" -- exact manual draft\n', ""]) {
    const manual = { ...fresh(), source: { kind: "sql" as const, sql, parameters: [], columns: [], sqlMode: "manual" as const } };
    for (const kind of JOIN_KINDS) expect(syncVisualSql(manual, "qa_left", visualCatalog, joinPlan(kind)).source).toMatchObject({ sql, sqlMode: "manual" });
    const explicit = syncVisualSql(manual, "qa_left", visualCatalog, joinPlan("full"), true);
    expect(explicit.source).toMatchObject({ sqlMode: "visual" });
    expect(explicit.source.kind === "sql" && explicit.source.sql).toContain("FULL JOIN");
  }
  expect(toDatasets([{ ...fresh(), source: { kind: "sql", sql: "SELECT 1", parameters: [], columns: [], visual: { bad: true } } }])[0]?.source).not.toHaveProperty("visual");
});

test("preview labels and column visibility never alter backend keys, rows or SQL", () => {
  const result: QueryResult = { columns: [{ key: "name", type: "text" }, { key: "hr_departments_id", type: "uuid" }], rows: [{ name: "Order A", hr_departments_id: null }], limit: 100, truncated: false };
  const labeled = labelQueryResult(result, visualCatalog, "ru");
  expect(labeled.columns.map((column) => column.label)).toEqual(["Order", "Колонка 2"]);
  expect(labeled.rows).toBe(result.rows);
  expect(visibleQueryColumns(labeled, ["name"]).map((column) => column.key)).toEqual(["name"]);
  expect(visibleQueryColumns(labeled, ["removed_field"])).toEqual(labeled.columns);
  expect(SQL_VISUALIZATIONS).toEqual(expect.arrayContaining(["column", "stat", "pie", "area"]));
});


test("new manual results replace stale chart keys and retain valid visibility without changing chart kind", () => {
  const old = { ...sqlWidgetFrom(fresh()), type: "chart" as const, kind: "column" as const, groupSlug: "old_group", valueSlug: "old_total", splitSlug: "old_split", columns: ["old_group"] };
  const next = reconcileSqlFields(old, [{ slug: "label", type: "SINGLE_LINE" }, { slug: "amount", type: "NUMBER" }]);
  expect(next).toMatchObject({ kind: "column", groupSlug: "label", valueSlug: "amount", splitSlug: "" });
  expect(next).not.toHaveProperty("columns");
  expect(reconcileSqlFields({ ...next, columns: ["amount"] }, [{ slug: "label", type: "SINGLE_LINE" }, { slug: "amount", type: "NUMBER" }]).columns).toEqual(["amount"]);
});
