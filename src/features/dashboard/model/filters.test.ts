import { expect, test } from "vitest";
import { ME } from "@/features/item";
import { NOBODY, dayKey, periodRange, widgetFilters, type DashFilter } from "./filters";

const days = (value: string[], today: Date) => {
  const p = periodRange(value, today);
  return p && [p.range, p.previous].map((r) => `${dayKey(r.from)}..${dayKey(r.to)}`);
};

test("готовый период — от начала единицы, сравнение — тем же числом дней", () => {
  expect(days(["month"], new Date(2026, 9, 5))).toEqual(["2026-10-01..2026-10-05", "2026-09-01..2026-09-05"]);
  // В сентябре 30 дней: сравнение не залезает в октябрь.
  expect(days(["month"], new Date(2026, 9, 31))).toEqual(["2026-10-01..2026-10-31", "2026-09-01..2026-09-30"]);
  expect(days(["week"], new Date(2026, 9, 14))).toEqual(["2026-10-12..2026-10-14", "2026-10-05..2026-10-07"]);
  expect(days(["custom", "2026-10-01", "2026-10-05"], new Date())).toEqual([
    "2026-10-01..2026-10-05",
    "2026-09-26..2026-09-30",
  ]);
  expect(periodRange(["custom", "2026-10-01"])).toBeNull();
  expect(periodRange(["nope"])).toBeNull();
});

test("отбор: прямой, через справочник, «Я», без ответа", () => {
  const filters: DashFilter[] = [
    { kind: "period", label: "" },
    { kind: "record", label: "Менеджер", table: "core_users", sourceTable: "crm_deals", sourceField: "core_users_id" },
    { kind: "record", label: "Отдел", table: "hr_departments", sourceTable: "core_users", sourceField: "hr_departments_id" },
  ];
  const result = widgetFilters(
    { title: { op: "contains", values: ["x"] } },
    { period: { field: "created_at" }, core_users: { field: "core_users_id" }, hr_departments: { field: "core_users_id", via: "hr_departments_id" } },
    filters,
    { period: ["custom", "2026-10-01", "2026-10-02"], core_users: [ME], hr_departments: ["d1"] },
    { hr_departments: ["me-guid", "other"] },
    (table) => (table === "core_users" ? "me-guid" : NOBODY),
  );
  // Менеджер «Я» и отдел по одному полю — пересечение.
  expect(result).toEqual({
    title: { op: "contains", values: ["x"] },
    created_at: { op: "between", values: ["2026-10-01", "2026-10-02T23:59:59.999"] },
    core_users_id: { op: "is", values: ["me-guid"] },
  });
});
