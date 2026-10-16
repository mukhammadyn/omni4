import { expect, test } from "vitest";
import type { Dataset, DatasetTable } from "./datasets";
import { buildJoinSql, type JoinDraft } from "./sql-join-builder";
import { sqlSupportIssue } from "./sql-query-guidance";
import { sqlWidgetFrom, stageSqlWidget } from "./sql-widget";
import { newDashboard, newFolder, toTree, toTreeAttribute } from "./dashboard";

const catalog: DatasetTable[] = [{ slug: "deals", label: "Deals", fields: [{ slug: "owner_id", label: "Owner", type: "LOOKUP" }, { slug: "currency", label: "Currency", type: "SINGLE_LINE" }] }, { slug: "employees", label: "People", fields: [{ slug: "guid", label: "ID", type: "UUID" }, { slug: "name", label: "Name", type: "SINGLE_LINE" }] }];
const plan: JoinDraft = { base: { table: "deals", alias: "d" }, joins: [{ table: "employees", alias: "e", kind: "left", from: "d", left: "owner_id", right: "guid" }], columns: [{ alias: "e", field: "name" }, { alias: "d", field: "currency" }], count: true };

test("visual JOIN emits supported quoted SELECT with selected dimensions and count", () => {
  const result = buildJoinSql(plan, catalog);
  expect(result.issue).toBeNull();
  expect(result.sql).toContain('LEFT JOIN "employees" AS "e" ON "d"."owner_id" = "e"."guid"');
  expect(result.sql).toContain('GROUP BY "e"."name", "d"."currency"');
  expect(result.sql).toContain('COUNT(*) AS "total"');
  expect(sqlSupportIssue(result.sql)).toBeNull();
  expect(buildJoinSql({ ...plan, joins: [{ ...plan.joins[0]!, kind: "inner" }] }, catalog).sql).toContain("INNER JOIN");
});

test("visual JOIN fails closed for unavailable fields, disconnected aliases, unknown sources and unsupported types", () => {
  for (const invalid of [
    { ...plan, base: { table: "private", alias: "d" } },
    { ...plan, joins: [{ ...plan.joins[0]!, alias: "d" }] },
    { ...plan, joins: [{ ...plan.joins[0]!, from: "later" }] },
    { ...plan, joins: [{ ...plan.joins[0]!, left: "secret" }] },
    { ...plan, columns: [{ alias: "e", field: "password" }] },
    { ...plan, base: { ...plan.base, alias: 'd"; DROP TABLE deals' } },
    { ...plan, joins: Array.from({ length: 4 }, () => plan.joins[0]!) },
  ]) expect(buildJoinSql(invalid, catalog).sql).toBe("");
  expect(buildJoinSql({ ...plan, count: false, columns: [] }, catalog).issue).toBe("columns");
});

test("JOIN identifiers are quoted and raw output uses distinct stable column aliases", () => {
  const special = [{ slug: 'odd"table', label: "Odd", fields: [{ slug: 'a"b', label: "Odd field", type: "SINGLE_LINE" }] }];
  const result = buildJoinSql({ base: { table: special[0]!.slug, alias: "t" }, joins: [], columns: [{ alias: "t", field: 'a"b' }], count: false }, special);
  expect(result.sql).toContain('"t"."a""b" AS "Odd field"');
  expect(result.sql).toContain('FROM "odd""table" AS "t"');
});

test("source changes stage SQL and widget together without changing reused sources", () => {
  const original: Dataset = { id: "original", name: "Original", source: { kind: "sql", sql: "SELECT currency FROM deals", parameters: [], columns: [] } };
  const edited: Dataset = { ...original, id: "edited", source: { ...original.source, kind: "sql", sql: buildJoinSql(plan, catalog).sql, parameters: [], columns: [] } };
  const widget = sqlWidgetFrom(original), next = stageSqlWidget([original], widget, edited);
  expect(next.datasets[0]).toBe(original);
  expect(next.widget.datasetId).toBe("edited");
  expect(next.datasets).toEqual([original, edited]);
  const tree = { folders: [{ ...newFolder("crm", "Sales"), dashboards: [{ ...newDashboard("Analytics"), widgets: [next.widget] }] }], datasets: next.datasets };
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
  const unchanged = stageSqlWidget([original], widget, { ...original, id: "new-unused" });
  expect(unchanged.widget.datasetId).toBe(original.id);
  expect(unchanged.datasets).toEqual([original]);
});
