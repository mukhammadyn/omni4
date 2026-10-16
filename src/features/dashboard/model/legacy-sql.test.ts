import { expect, test } from "vitest";
import { legacyQueryResult, numericProjection, prepareDashboardSql, restoreNumericSchema } from "./legacy-sql";
import { queryChartRows } from "./query-result";

test("preview wrapping retains manual SQL text and protects trailing comments", () => {
  const sql = "select * from chats; -- preserve my draft";
  expect(prepareDashboardSql(sql, [], 25).sql).toContain('select * from chats -- preserve my draft\n) AS "dashboard_preview" LIMIT 26');
  expect(sql).toBe("select * from chats; -- preserve my draft");
});
test("parameter lexer leaves literals/comments/casts intact and binds repeats once", () => {
  const result = prepareDashboardSql("SELECT currency::text FROM deals WHERE currency=:value AND currency=:value -- :ignored", [{ name: "value", type: "text", value: "x'; DELETE FROM deals; --" }], 100);
  expect(result.params).toEqual(["x'; DELETE FROM deals; --"]);
  expect(result.sql).toContain("currency::text");
  expect(result.sql.match(/\$1::text/g)).toHaveLength(2);
  expect(result.sql).not.toContain("x'; DELETE");
  for (const [type, value] of [["number", "1; DROP TABLE x"], ["boolean", "true OR true"], ["date", "2026-02-31"]] as const) expect(() => prepareDashboardSql("SELECT guid FROM deals WHERE guid=:value", [{ name: "value", type, value }], 100)).toThrow("Invalid");
});
test("legacy map columns, empty schema and extra preview row are normalized honestly", () => {
  const result = legacyQueryResult({ columns: ["label", "total"], rows: [{ label: "Alice", total: 2 }, { label: "Bob", total: 1 }], types: { label: "text", total: "int8" }, rowsAffected: 2 }, 1);
  expect(result.rows).toEqual([{ label: "Alice", total: "2" }]);
  expect(result.truncated).toBe(true);
  expect(queryChartRows(result)).toEqual([{ label: "Alice", total: 2 }]);
  expect(legacyQueryResult({ columns: ["total"], rows: [], types: { total: "int8" }, rowsAffected: 0 }, 100).rows).toEqual([]);
  expect(() => legacyQueryResult({ columns: [], rows: [], types: {}, rowsAffected: 0 }, 100)).toThrow("no column metadata");
});
test("unsafe protobuf numbers cannot be advertised as exact chart values", () => {
  const result = legacyQueryResult({ columns: ["total"], rows: [{ total: 9007199254740992 }], types: { total: "int8" }, rowsAffected: 1 }, 100);
  expect(() => queryChartRows(result)).toThrow("precision");
});

test("SUM/AVG and large integers preserve decimal text while charts reject rounding", () => {
  const schema = { columns: ["total", "average", "big"], rows: [], types: { total: "numeric", average: "numeric", big: "int8" }, rowsAffected: 0 };
  const plan = numericProjection("SELECT SUM(amount) AS total,AVG(amount) AS average,MAX(count) AS big FROM deals", schema);
  expect(plan.sql).not.toContain("float8");
  expect(plan.exactColumns).toEqual(schema.columns);
  const result = legacyQueryResult(restoreNumericSchema(schema, { ...schema, types: { total: "text", average: "text", big: "text" }, rows: [{ total: "132.34", average: "44.1133333333333333", big: "9007199254740993" }] }, plan.exactColumns), 100);
  expect(result.rows[0]).toEqual({ total: "132.34", average: "44.1133333333333333", big: "9007199254740993" });
  expect(() => queryChartRows(result)).toThrow("precision");
  const safe = legacyQueryResult(restoreNumericSchema({ ...schema, columns: ["average"], types: { average: "numeric" } }, { ...schema, columns: ["average"], types: { average: "text" }, rows: [{ average: "56.1700000000000000" }] }, ["average"]), 100);
  expect(queryChartRows(safe)).toEqual([{ average: 56.17 }]);
});
