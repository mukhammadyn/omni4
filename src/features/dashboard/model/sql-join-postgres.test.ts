import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { buildJoinSql, completeJoinColumns, initialJoinDraft, JOIN_KINDS } from "./sql-join-builder";
import type { DatasetTable } from "./datasets";
const socket = process.env["OMNI4_SQL_UI_PG_SOCKET"];
const catalog: DatasetTable[] = [{ slug: "qa_left", label: "Orders", fields: [{ slug: "id", label: "ID", type: "NUMBER" }, { slug: "name", label: "Order", type: "SINGLE_LINE" }] }, { slug: "qa_right", label: "People", fields: [{ slug: "id", label: "ID", type: "NUMBER" }, { slug: "title", label: "Person", type: "SINGLE_LINE" }] }];
for (const kind of JOIN_KINDS) test.skipIf(!socket)(`${kind.toUpperCase()} generated SQL runs in real isolated PostgreSQL with unmatched and NULL rows`, () => {
  const plan = completeJoinColumns({ ...initialJoinDraft("qa_left"), joins: [{ table: "qa_right", alias: "j1", kind, from: "t", left: "id", right: "id" }] }, catalog);
  const generated = buildJoinSql(plan, catalog); expect(generated.issue).toBeNull();
  const raw = execFileSync("/opt/homebrew/opt/postgresql@14/bin/psql", ["-XAt", "-h", socket!, "-p", process.env["OMNI4_SQL_UI_PG_PORT"] ?? "55486", "-U", "omni4sql", "-d", process.env["OMNI4_SQL_UI_PG_DATABASE"] ?? "sql_ui_fixture", "-c", `SELECT json_agg(r) FROM (${generated.sql}) r`], { encoding: "utf8" });
  const rows = JSON.parse(raw) as Record<string, unknown>[];
  expect(rows).toHaveLength({ inner: 1, left: 3, right: 3, full: 5 }[kind]);
  expect(rows).toContainEqual({ "Orders · ID": 2, Order: "matched", "People · ID": 2, Person: "matched person" });
  if (kind === "left" || kind === "full") {
    expect(rows).toContainEqual({ "Orders · ID": 1, Order: "left only", "People · ID": null, Person: null });
    expect(rows).toContainEqual({ "Orders · ID": null, Order: "left null", "People · ID": null, Person: null });
  }
  if (kind === "right" || kind === "full") {
    expect(rows).toContainEqual({ "Orders · ID": null, Order: null, "People · ID": 4, Person: "right only" });
    expect(rows).toContainEqual({ "Orders · ID": null, Order: null, "People · ID": null, Person: "right null" });
  }
});
