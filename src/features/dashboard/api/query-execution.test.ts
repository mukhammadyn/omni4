import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError } from "@/shared/api/client";
import { executeDashboardQuery, type QueryExecutionInput } from "./query-execution";

afterEach(() => vi.restoreAllMocks());
const input: QueryExecutionInput = { menu_id: "fixture-dashboard-menu", sql: "SELECT currency FROM deals WHERE currency = :currency", parameters: [{ name: "currency", type: "text", value: "' OR true; DELETE FROM deals; --" }], limit: 100 };

test("dashboard reuses existing SQL endpoint and binds values separately", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ rows: [{ currency: "USD" }], rows_affected: 1, types: { currency: "text" } });
  const controller = new AbortController();
  expect((await executeDashboardQuery(input, controller.signal)).rows).toEqual([{ currency: "USD" }]);
  expect(post).toHaveBeenCalledTimes(2);
  const [path, body, options] = post.mock.calls[1]!;
  expect((post.mock.calls[0]?.[1] as { sql: string }).sql).toContain('AS "dashboard_types" LIMIT 0');
  expect(path).toBe("/v1/custom-endpoints/exec-query");
  expect(body).toEqual({ sql: 'SELECT * FROM (\nSELECT currency FROM deals WHERE currency = $1::text\n) AS "dashboard_preview" LIMIT 101', params: [input.parameters[0]!.value] });
  expect(options).toMatchObject({ skipAuthRefresh: true, signal: controller.signal, timeout: expect.any(Number) });
  expect(options?.timeout).toBeLessThanOrEqual(15000);
  expect(JSON.stringify(body)).not.toContain("fixture-dashboard-menu");
});

test("manual SELECT star works with a schema preflight and no new backend or capability request", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ rows: [{ guid: "id", title: "Chat" }], rows_affected: 1, types: { guid: "text", title: "varchar" } });
  expect((await executeDashboardQuery({ ...input, sql: "select * from chats", parameters: [] })).rows[0]).toEqual({ guid: "id", title: "Chat" });
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[1]?.[1]).toEqual({ sql: 'SELECT * FROM (\nselect * from chats\n) AS "dashboard_preview" LIMIT 101' });
});

test("existing server denial is surfaced without retrying another SQL route", async () => {
  const post = vi.spyOn(api, "post").mockRejectedValue(new ApiError(403, "Existing SQL access denied"));
  await expect(executeDashboardQuery(input)).rejects.toThrow("HTTP 403");
  expect(post).toHaveBeenCalledTimes(1);
});

test("missing server metadata is not shown as successful empty query", async () => {
  vi.spyOn(api, "post").mockResolvedValue({ rows: null, rows_affected: 0, types: null });
  await expect(executeDashboardQuery({ ...input, sql: "SELECT missing FROM deals", parameters: [] })).rejects.toThrow("no column metadata");
});

test("dashboard write/multi-statement controls stop requests locally", async () => {
  const post = vi.spyOn(api, "post");
  for (const sql of ["DELETE FROM deals", "SELECT guid FROM deals; DELETE FROM deals", "SELECT guid INTO copied FROM deals"]) await expect(executeDashboardQuery({ ...input, sql, parameters: [] })).rejects.toThrow("one SELECT");
  expect(post).not.toHaveBeenCalled();
});

test("numeric SUM/AVG use native type inspection then exact SQL text transport", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValueOnce({ rows: null, rows_affected: 0, types: { total: "numeric", count: "int8" } }).mockResolvedValueOnce({ rows: [{ total: "9007199254740993.01", count: "9007199254740993" }], rows_affected: 1, types: { total: "text", count: "text" } });
  const result = await executeDashboardQuery({ ...input, sql: "SELECT SUM(amount) AS total,COUNT(*) AS count FROM deals", parameters: [] });
  expect(result.rows).toEqual([{ total: "9007199254740993.01", count: "9007199254740993" }]);
  const body = post.mock.calls[1]?.[1] as { sql: string };
  expect(body.sql).toContain('"dashboard_values"."total"::text AS "total"');
  expect(body.sql).not.toContain("float8");
  expect(result.columns).toContainEqual({ key: "total", type: "numeric" });
});
test("numeric transport or a changing output schema cannot be silently accepted", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValueOnce({ rows: [], types: { total: "numeric" } }).mockResolvedValueOnce({ rows: [{ total: 12.34 }], types: { total: "text" } });
  await expect(executeDashboardQuery({ ...input, sql: "SELECT SUM(amount) AS total FROM deals", parameters: [] })).rejects.toThrow("Exact SQL numeric text");
  post.mockResolvedValueOnce({ rows: [], types: { total: "numeric" } }).mockResolvedValueOnce({ rows: [{ other: "12.34" }], types: { other: "text" } });
  await expect(executeDashboardQuery({ ...input, sql: "SELECT SUM(amount) AS total FROM deals", parameters: [] })).rejects.toThrow("schema changed");
});
test("schema and values share one client timeout budget and cancellation", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ rows: [], types: { total: "int8" } });
  vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(100).mockReturnValueOnce(15101);
  await expect(executeDashboardQuery({ ...input, sql: "SELECT COUNT(*) AS total FROM deals", parameters: [] })).rejects.toThrow("timed out");
  expect(post).toHaveBeenCalledTimes(1);
  const controller = new AbortController(); controller.abort();
  await expect(executeDashboardQuery(input, controller.signal)).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
});
