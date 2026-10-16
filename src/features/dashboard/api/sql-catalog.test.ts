import { expect, test } from "vitest";
import { sqlCatalog } from "./sql-catalog";
import { buildJoinSql } from "../model/sql-join-builder";

test("JOIN catalog reuses SQL-console schema links and omits sensitive suggestions", () => {
  const field = (slug: string, type: string) => ({ slug, label: slug === "owner_id" ? "Owner" : "Business field", type, required: false, unique: false });
  const catalog = sqlCatalog({ tables: [
    { slug: "deals", label: "Deals", group: "other", section: null, rows: null, fields: [field("owner_id", "LOOKUP"), field("amount", "NUMBER"), field("secret", "PASSWORD")] },
    { slug: "employees", label: "People", group: "other", section: null, rows: null, fields: [field("guid", "UUID"), field("name", "SINGLE_LINE")] },
    { slug: "role", label: "Roles", group: "platform", section: null, rows: null, fields: [] },
  ], links: [{ from: "deals", field: "owner_id", to: "employees", type: "Many2One" }] });
  expect(catalog.map((table) => table.slug)).toEqual(["deals", "employees"]);
  expect(catalog[0]?.fields.map((field) => field.slug)).toEqual(["owner_id", "amount"]);
  expect(catalog[0]?.fields[0]).toMatchObject({ label: "Owner", target: "employees", joinable: true });
  const generated = buildJoinSql({ base: { table: "deals", alias: "d" }, joins: [{ table: "employees", alias: "e", kind: "left", from: "d", left: "owner_id", right: "guid" }], columns: [{ alias: "e", field: "name" }], count: true }, catalog);
  expect(generated.issue).toBeNull();
  expect(generated.sql).toContain('LEFT JOIN "employees"');
  expect(sqlCatalog(undefined)).toEqual([]);
});


test("missing business labels use localized generic names, never backend slugs", () => {
  const catalog = sqlCatalog({ tables: [{ slug: "core_currency", label: "core_currency", group: "core", section: null, rows: null, fields: [{ slug: "core_users_id", label: "core_users_id", type: "LOOKUP", required: false, unique: false }] }], links: [] }, "ru");
  expect(catalog[0]?.label).toBe("Таблица 1");
  expect(catalog[0]?.fields[0]?.label).toBe("Поле 1");
});
