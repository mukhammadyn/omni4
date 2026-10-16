import { expect, test } from "vitest";
import { CLIENT_SQL_CAPABILITY, joinGuidance, type DatasetTable } from "./datasets";
import { insertJoinGuidance, joinSqlGuidance, namedSqlParameters, quoteSqlName, sqlLex, sqlSuggestions } from "./sql-assist";
const catalog: DatasetTable[] = [
  { slug: "deals", label: "Deals", fields: [{ slug: "guid", label: "ID", type: "UUID" }, { slug: "amount", label: "Amount", type: "NUMBER" }, { slug: "owner", label: "Owner", type: "LOOKUP", target: "employees", joinable: true }] },
  { slug: "employees", label: "People", fields: [{ slug: "guid", label: "ID", type: "UUID" }, { slug: "name", label: "Name", type: "SINGLE_LINE" }] },
];
test("SQL assistance uses actual alias columns and sees FROM after the caret", () => {
  const sql = "SELECT d.am FROM deals AS d";
  expect(sqlSuggestions(sql, 11, catalog)).toEqual([{ value: '"amount"', label: "Amount", detail: "Deals", replaceFrom: 9, replaceTo: 11 }]);
  expect(sqlSuggestions("SELECT * FROM de", 16, catalog)[0]?.value).toBe('"deals"');
});
test("parameters exclude casts, literals, dollar strings and nested comments", () => {
  expect(namedSqlParameters("SELECT id::text, ':fake', $$:fake$$ /* :fake /* :also */ */ FROM deals WHERE amount > :minimum AND owner = :owner AND amount < :minimum")).toEqual(["minimum", "owner"]);
  expect(namedSqlParameters("SELECT :minimum -- :comment")).toEqual(["minimum"]);
});
test("SQL autocomplete remains silent inside values and comments", () => {
  for (const sql of ["SELECT 'am", "SELECT $$am", "SELECT /* am", "SELECT -- am"]) expect(sqlSuggestions(sql, sql.length, catalog)).toEqual([]);
  expect(sqlLex('SELECT "a""b"').at(-1)?.kind).toBe("name");
  expect(quoteSqlName('a"b')).toBe('"a""b"');
});
test("join guidance is based on permitted schema relationships, never guessed names", () => {
  expect(joinSqlGuidance(catalog)).toEqual(['LEFT JOIN "employees" ON "deals"."owner" = "employees"."guid"']);
  expect(joinGuidance({ fromTable: "deals", field: "owner", toTable: "employees", kind: "left" }, catalog)).toEqual({ valid: true, reason: "reference" });
  expect(joinGuidance({ fromTable: "deals", field: "amount", toTable: "employees", kind: "left" }, catalog).valid).toBe(false);
  expect(joinSqlGuidance(catalog.slice(0, 1))).toEqual([]);
  expect(CLIENT_SQL_CAPABILITY.execution).toBe("existing-admin-sql");
  expect(CLIENT_SQL_CAPABILITY.serverReadOnly).toBe(false);
});

test("completing a quoted identifier replaces its quotes as one token", () => {
  const sql = 'SELECT d."am" FROM deals d';
  const suggestion = sqlSuggestions(sql, 12, catalog)[0]!;
  expect(sql.slice(0, suggestion.replaceFrom) + suggestion.value + sql.slice(suggestion.replaceTo)).toBe('SELECT d."amount" FROM deals d');
});

test("join guidance excludes incoming and unverified scalar relationships", () => {
  const reversed = catalog.map((table) => ({ ...table, fields: table.fields.map((field) => ({ ...field, joinable: false })) }));
  expect(joinSqlGuidance(reversed)).toEqual([]);
  expect(joinGuidance({ fromTable: "deals", field: "owner", toTable: "employees", kind: "left" }, reversed).valid).toBe(false);
});

const join = 'LEFT JOIN "employees" ON "events"."employees_id" = "employees"."guid"';
test.each([
  "WHERE events.amount > :minimum",
  "GROUP BY events.amount",
  "GROUP BY events.amount HAVING events.amount > 0",
  "ORDER BY events.amount DESC",
  "LIMIT 10 OFFSET 2",
  "OFFSET 2 FETCH FIRST 10 ROWS ONLY",
  "FOR UPDATE",
])("join guidance precedes the trailing clause: %s", (clause) => {
  const sql = `SELECT events.amount FROM events ${clause};`;
  expect(insertJoinGuidance(sql, join, "events")).toBe(`SELECT events.amount FROM events\n${join}\n${clause};`);
});
test("join placement preserves comments and ignores quoted clause words", () => {
  const sql = `SELECT 'WHERE FROM', "where" FROM "events" -- trailing note\nWHERE event = 'ORDER BY'`;
  expect(insertJoinGuidance(sql, join, "events")).toBe(`SELECT 'WHERE FROM', "where" FROM "events"\n${join}\n-- trailing note\nWHERE event = 'ORDER BY'`);
  expect(insertJoinGuidance("SELECT events.amount FROM events; -- note", join, "events")).toBe(`SELECT events.amount FROM events\n${join}\n; -- note`);
});
test.each([
  "SELECT e.amount FROM events e WHERE e.amount > :minimum",
  "SELECT e.amount FROM events AS e WHERE e.amount > :minimum",
  "SELECT * FROM public.events WHERE amount > 0",
  "SELECT COUNT(*) FROM events WHERE amount > 0",
  "SELECT * FROM events WHERE EXISTS (SELECT 1 FROM employees)",
  'SELECT * FROM events LEFT JOIN "employees" ON "events"."employees_id" = "employees"."guid" WHERE amount > 0',
  "WITH events AS (SELECT 1) SELECT * FROM events",
  "SELECT * FROM events UNION SELECT * FROM employees",
  "SELECT * FROM events; SELECT 1",
  "SELECT * FROM events WHERE event = 'unclosed",
  "SELECT * FROM events /* outer /* inner */",
  "SELECT * FROM events WHERE event = E'escaped\\' FROM events'",
  "SELECT amount",
  "SELECT * FROM employees WHERE amount > 0",
])("ambiguous or incomplete SQL stays unchanged for manual guidance: %s", (sql) => {
  expect(insertJoinGuidance(sql, join, "events")).toBeNull();
});
test("repeated guidance and self joins never add duplicate unaliased sources", () => {
  const inserted = insertJoinGuidance("SELECT * FROM events", join, "events")!;
  expect(insertJoinGuidance(inserted, join, "events")).toBeNull();
  expect(insertJoinGuidance("SELECT * FROM events", 'LEFT JOIN "events" ON "events"."parent" = "events"."guid"', "events")).toBeNull();
});
