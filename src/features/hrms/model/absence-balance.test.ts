import { expect, test } from "vitest";
import { balanceOf, limitPeriod, type AbsenceType } from "./absence-balance";

const type = (id: string, limit: number | null, period: string): AbsenceType => ({
  id,
  title: id,
  icon: "",
  color: "",
  limit,
  period,
});

test("limit periods: week from Monday, month, year, none", () => {
  expect(limitPeriod("week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  expect(limitPeriod("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(limitPeriod("year", "2026-10-09")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  expect(limitPeriod("none", "2026-10-09")).toBeNull();
});

test("balance: approved of the period is used, pending apart, outside the period ignored", () => {
  const [vacation, dayOff, trip] = balanceOf(
    [type("vac", 10, "year"), type("off", 1, "month"), type("trip", null, "none")],
    [
      { typeId: "vac", status: "approved", from: "2026-03-02", days: 5 },
      { typeId: "vac", status: "approved", from: "2025-12-29", days: 4 },
      { typeId: "vac", status: "pending", from: "2026-11-02", days: 3 },
      { typeId: "vac", status: "rejected", from: "2026-05-04", days: 2 },
      { typeId: "off", status: "approved", from: "2026-09-10", days: 1 },
      { typeId: "off", status: "approved", from: "2026-10-01", days: 1 },
      { typeId: "trip", status: "approved", from: "2024-01-10", days: 7 },
    ],
    "2026-10-09",
  );
  expect(vacation).toMatchObject({ used: 5, pending: 3, left: 5 });
  expect(dayOff).toMatchObject({ used: 1, pending: 0, left: 0 });
  expect(trip).toMatchObject({ used: 7, left: null });
});
