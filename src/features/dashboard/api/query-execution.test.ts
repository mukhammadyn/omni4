import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError } from "@/shared/api/client";
import { executeDashboardQuery, type QueryExecutionInput } from "./query-execution";

afterEach(() => vi.restoreAllMocks());
const input: QueryExecutionInput = { menu_id: "fixture-dashboard-menu", sql: "SELECT currency FROM deals WHERE currency = :currency", parameters: [{ name: "currency", type: "text", value: "' OR true; DELETE FROM deals; --" }], limit: 100 };

test("dashboard reuses existing SQL endpoint and binds values separately", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ rows: [{ currency: "USD" }], rows_affected: 1, types: { currency: "text" } });
  const controller = new AbortController();
  expect((await executeDashboardQuery(input, controller.signal)).rows).toEqual([{ currency: "USD" }]);
  const [path, body, options] = post.mock.calls[0]!;
  expect(path).toBe("/v1/custom-endpoints/exec-query");
  expect(body).toEqual({ sql: 'SELECT * FROM (\nSELECT currency FROM deals WHERE currency = $1::text\n) AS "dashboard_preview" LIMIT 101', params: [input.parameters[0]!.value] });
  expect(options).toEqual({ skipAuthRefresh: true, signal: controller.signal, timeout: 15000 });
  expect(JSON.stringify(body)).not.toContain("fixture-dashboard-menu");
});

test("manual SELECT star works without a new backend or capability request", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ rows: [{ guid: "id", title: "Chat" }], rows_affected: 1, types: { guid: "text", title: "varchar" } });
  expect((await executeDashboardQuery({ ...input, sql: "select * from chats", parameters: [] })).rows[0]).toEqual({ guid: "id", title: "Chat" });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]?.[1]).toEqual({ sql: 'SELECT * FROM (\nselect * from chats\n) AS "dashboard_preview" LIMIT 101' });
});

test("existing server denial is surfaced without retrying another SQL route", async () => {
  const post = vi.spyOn(api, "post").mockRejectedValue(new ApiError(403, "Existing SQL access denied"));
  await expect(executeDashboardQuery(input)).rejects.toThrow("HTTP 403");
  expect(post).toHaveBeenCalledTimes(1);
});

test("missing server metadata is not shown as successful empty query", async () => {
  vi.spyOn(api, "post").mockResolvedValue({ rows: null, rows_affected: 0, types: null });
  await expect(executeDashboardQuery({ ...input, sql: "SELECT missing FROM deals", parameters: [] })).rejects.toThrow("hidden a SQL error");
});

test("dashboard write/multi-statement controls stop requests locally", async () => {
  const post = vi.spyOn(api, "post");
  for (const sql of ["DELETE FROM deals", "SELECT guid FROM deals; DELETE FROM deals", "SELECT guid INTO copied FROM deals"]) await expect(executeDashboardQuery({ ...input, sql, parameters: [] })).rejects.toThrow("one SELECT");
  expect(post).not.toHaveBeenCalled();
});
