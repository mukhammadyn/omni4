import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError } from "@/shared/api/client";
import { executeDashboardQuery, type QueryExecutionInput } from "./query-execution";

afterEach(() => vi.restoreAllMocks());
const input: QueryExecutionInput = { menu_id: "fixture-dashboard-menu", sql: "SELECT currency FROM deals WHERE currency = :currency", parameters: [{ name: "currency", type: "text", value: "' OR true; DELETE FROM deals; --" }], limit: 100 };

test("advanced execution keeps typed values separate and forwards cancellation", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ columns: [{ key: "currency", type: "text" }], rows: [["USD"]], limit: 100, truncated: false });
  const controller = new AbortController();
  expect((await executeDashboardQuery(input, controller.signal)).rows).toEqual([{ currency: "USD" }]);
  expect(post).toHaveBeenCalledExactlyOnceWith("/v2/dashboard/query", input, { signal: controller.signal, timeout: 6500 });
  expect(input.sql).not.toContain(input.parameters[0]!.value);
});
test("disabled or denied execution has no admin SQL fallback", async () => {
  const post = vi.spyOn(api, "post").mockRejectedValue(new ApiError(501, { error: { code: "EXECUTION_DISABLED", message: "Execution disabled for this project" } }));
  await expect(executeDashboardQuery(input)).rejects.toThrow("Execution disabled for this project");
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]?.[0]).toBe("/v2/dashboard/query");
});
