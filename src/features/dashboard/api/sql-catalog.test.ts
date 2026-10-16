import { expect, test } from "vitest";
import { sqlCatalog } from "./sql-catalog";
import { buildJoinSql } from "../model/sql-join-builder";
import { boundedSqlSuggestions } from "../model/sql-query-guidance";

test("dashboard catalog supplies application tables for manual and visual JOIN without CRUD role metadata", () => {
  const catalog = sqlCatalog({ tables: [
    { slug: "deals", fields: [{ key: "owner_id", type: "uuid" }, { key: "amount", type: "numeric" }, { key: "active", type: "bool" }, { key: "created_at", type: "timestamptz" }] },
    { slug: "employees", fields: [{ key: "guid", type: "uuid" }, { key: "name", type: "text" }] },
  ] });
  expect(catalog.map((table) => table.slug)).toEqual(["deals", "employees"]);
  expect(catalog[0]?.fields.map((field) => field.type)).toEqual(["UUID", "NUMBER", "CHECKBOX", "DATE_TIME"]);
  expect(boundedSqlSuggestions("SELECT e.na FROM employees e", 11, catalog).map((item) => item.label)).toContain("name");
  const generated = buildJoinSql({ base: { table: "deals", alias: "d" }, joins: [{ table: "employees", alias: "e", kind: "left", from: "d", left: "owner_id", right: "guid" }], columns: [{ alias: "e", field: "name" }], count: true }, catalog);
  expect(generated.issue).toBeNull();
  expect(generated.sql).toContain('LEFT JOIN "employees" AS "e" ON "d"."owner_id" = "e"."guid"');
  expect(generated.sql).toContain('GROUP BY "e"."name"');
});

test("malformed catalog entries never become suggestions", () => {
  for (const value of [null, {}, { tables: "all" }]) expect(sqlCatalog(value)).toEqual([]);
  expect(sqlCatalog({ tables: [null, {}, { slug: 3, fields: [] }, { slug: "deals", fields: [null, {}, { key: "amount", type: 4 }, { key: "currency", type: "text" }] }] })).toEqual([
    { slug: "deals", label: "deals", fields: [{ slug: "currency", label: "currency", type: "SINGLE_LINE" }] },
  ]);
});
