import { expect, test } from "vitest";
import { CRM_QUERIES, CRM_PARAMETERS } from "../api/crm-analytics";
import { dashboardSqlValues } from "./sql-controls";
import { prepareDashboardSql } from "./legacy-sql";
import { duration, heatmap, lost, overdueDays, stagePoints, stageTimes, sum, timeline, won } from "./crm-analytics";

test("reference reports use guarded paged SELECTs and the same persisted date/branch controls", () => {
  const values = dashboardSqlValues(CRM_PARAMETERS, { "sql-period:crm-period": ["month", "2026-10-15"], "sql-param:crm_branch": ["office-1"] });
  expect(values).toEqual({ crm_from: "2026-10-01", crm_to: "2026-10-31", crm_branch: "office-1" });
  for (const sql of Object.values(CRM_QUERIES)) {
    const result = prepareDashboardSql(sql, CRM_PARAMETERS.map(p => ({ name: p.name, type: p.type, value: values[p.name]! })), 1000, { key: "guid", offset: 1000 });
    expect(result.sql).toContain('ORDER BY "dashboard_preview"."guid" ASC LIMIT 1001 OFFSET 1000');
    expect(result.sql).not.toContain("office-1");
  }
});
test("lost takes priority over done stage; absent amounts stay absent", () => {
  expect(lost({ is_lost: true, container: "done" })).toBe(true);
  expect(won({ is_lost: true, container: "done" })).toBe(false);
  expect(won({ container: "done" })).toBe(true);
  expect(sum([{ amount: null }, {}], "amount")).toBeNull();
  expect(sum([{ amount: 0 }, { amount: null }], "amount")).toBe(0);
});
test("ribbon uses distinct actual reached IDs and cannot fabricate history from stage order", () => {
  const deals = [{ guid: "a", stage_id: "s2" }, { guid: "b", stage_id: "s1" }], stages = [{ guid: "s1", name: "New" }, { guid: "s2", name: "Won" }];
  expect(stagePoints(deals, stages, []).map(p => p.count)).toEqual([1, 1]);
  expect(stagePoints(deals, stages, [{ deal_id: "a", from_id: "s1", to_id: "s2" }, { deal_id: "a", from_id: "s1", to_id: "s2" }, { deal_id: "outside", from_id: "s1", to_id: "s2" }]).map(p => p.count)).toEqual([2, 1]);
  expect(stageTimes(deals, [])).toEqual([]);
});
test("stage durations retain actual chronology and only the selected deal cohort", () => {
  const result = stageTimes([{ guid: "a", pipeline_id: "p" }], [{ deal_id: "a", moved_at: "2026-10-01T00:00:00Z", to_id: "s1" }, { deal_id: "a", moved_at: "2026-10-03T00:00:00Z", to_id: "s2" }, { deal_id: "outside", moved_at: "2026-01-01T00:00:00Z", to_id: "s1" }], new Date("2026-10-07T00:00:00Z"));
  expect(result).toEqual([{ id: "p", max: 4, min: 2, avg: 3, median: 3, transitions: 2 }]);
});
test("heatmap and month/weekday bars conserve the complete deal population", () => {
  const rows = [{ created_at: "2026-10-05T09:00:00", guid: "a" }, { created_at: "2026-10-05T09:30:00", guid: "b" }, { created_at: "2026-10-06T15:00:00", guid: "c" }];
  const heat = heatmap(rows);
  expect(heat.cells).toHaveLength(7); expect(heat.cells.every(row => row.length === 24)).toBe(true);
  expect(heat.cells[0]![9]).toBe(2); expect(heat.total.reduce((a, b) => a + b, 0)).toBe(3);
  expect(timeline(rows, "created_at")[0]!.rows).toHaveLength(3);
  expect(timeline(rows, "created_at", true).map(p => p.rows.length)).toEqual([2, 1, 0, 0, 0, 0, 0]);
});
test("completed tasks are never overdue; call time uses duration rather than minute rounding", () => {
  const now = new Date("2026-11-06T12:00:00");
  expect(overdueDays({ due_date: "2026-10-01", status: "todo" }, now)).toBe(36);
  expect(overdueDays({ due_date: "2026-10-01", status: "done" }, now)).toBe(0);
  expect(overdueDays({ due_date: null, status: "todo" }, now)).toBe(0);
  expect(duration(5437)).toBe("1:30:37"); expect(duration(124)).toBe("2:04");
});
