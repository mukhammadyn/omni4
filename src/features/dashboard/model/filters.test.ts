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
    { kind: "record", label: "Менеджер", table: "employees", sourceTable: "crm_deals", sourceField: "employees_id" },
    { kind: "record", label: "Филиал", table: "locations", sourceTable: "employees", sourceField: "locations_id" },
  ];
  const result = widgetFilters(
    { title: { op: "contains", values: ["x"] } },
    { period: { field: "created_at" }, employees: { field: "employees_id" }, locations: { field: "employees_id", via: "locations_id" } },
    filters,
    { period: ["custom", "2026-10-01", "2026-10-02"], employees: [ME], locations: ["l1"] },
    { locations: ["me-guid", "other"] },
    (table) => (table === "employees" ? "me-guid" : NOBODY),
  );
  // Менеджер «Я» и филиал по одному полю — пересечение.
  expect(result).toEqual({
    title: { op: "contains", values: ["x"] },
    created_at: { op: "between", values: ["2026-10-01", "2026-10-02T23:59:59.999"] },
    employees_id: { op: "is", values: ["me-guid"] },
  });
});
