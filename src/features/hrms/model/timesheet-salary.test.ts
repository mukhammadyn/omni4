import { describe, expect, it } from "vitest";
import { sheetSalary, type SalaryDay } from "./timesheet-salary";

/* Те же случаи, что timesheet-payroll.test.js функции omni5-hrms-hickvision. */
const day = (date: string, extra: Partial<SalaryDay> = {}): SalaryDay => ({
  date,
  outside_period: false,
  outside_employment: false,
  unconfirmed: false,
  off_schedule: false,
  has_shift: true,
  plan_minutes: 480,
  day_kind: "worked",
  absence_paid: false,
  worked_minutes: 480,
  late_minutes: 0,
  salary: 3_000_000,
  pay_unit: "month",
  currency: "UZS",
  ...extra,
});
const range = (from: string, to: string, extra: Partial<SalaryDay> = {}) => {
  const out: SalaryDay[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekend = [0, 6].includes(d.getUTCDay());
    out.push(day(d.toISOString().slice(0, 10), weekend ? { has_shift: false, plan_minutes: 0, day_kind: "day_off", worked_minutes: 0, ...extra } : extra));
  }
  return out;
};
const norms = new Map([
  ["2026-09-01", { shifts: 22, minutesPerDay: 480 }],
  ["2026-10-01", { shifts: 22, minutesPerDay: 480 }],
]);
const run = (days: SalaryDay[], extra: Partial<Parameters<typeof sheetSalary>[0]> = {}) =>
  sheetSalary({ days, norms, kind: "month", mode: "daily", legacy: false, settings: { coefficient: 0, grace: 0 }, ...extra });

describe("sheetSalary", () => {
  it("месячная ставка — доля смен месяца из нормы", () => {
    const days = range("2026-10-01", "2026-10-31");
    days[0]!.day_kind = "absent";
    days[1]!.day_kind = "absent";
    const [piece] = run(days).pieces;
    expect(piece).toMatchObject({ worked: 20, amount: Math.round(3_000_000 * (20 / 22)), to: "2026-10-31", mode: "daily" });
  });

  it("новая ставка с 20-го — свой кусок", () => {
    const days = range("2026-10-01", "2026-10-31").map((d) => (d.date >= "2026-10-20" ? { ...d, salary: 4_000_000 } : d));
    expect(run(days).pieces.map((p) => [p.rate, p.from, p.to, p.amount])).toEqual([
      [3_000_000, "2026-10-01", "2026-10-19", Math.round((3_000_000 * 13) / 22)],
      [4_000_000, "2026-10-20", "2026-10-31", Math.round((4_000_000 * 9) / 22)],
    ]);
  });

  it("неделя на стыке: по куску на месяц, знаменатель — смены всей недели", () => {
    const days = range("2026-09-28", "2026-10-04", { pay_unit: "week", salary: 700_000 }).map((d) => ({ ...d, pay_unit: "week" as const, salary: 700_000 }));
    expect(run(days, { kind: "week" }).pieces.map((p) => [p.month, p.amount])).toEqual([
      ["2026-09-01", Math.round((700_000 * 3) / 5)],
      ["2026-10-01", Math.round((700_000 * 2) / 5)],
    ]);
  });

  it("месячная ставка в недельном табеле, часовой — оклад ÷ 4; один табель считается в обоих режимах", () => {
    const days = range("2026-10-05", "2026-10-11");
    const [hourly] = run(days, { kind: "week", mode: "hourly" }).pieces;
    expect(hourly).toMatchObject({ norm: 40, amount: Math.round((3_000_000 / 4 / 40) * 40), mode: "hourly" });
    expect(run(days, { kind: "week", mode: "daily" }).pieces[0]).toMatchObject({ mode: "daily", worked: 5 });
  });

  it("ставка за час — всегда по часам", () => {
    const days = range("2026-10-05", "2026-10-11", { pay_unit: "hour", salary: 50_000 }).map((d) => ({ ...d, pay_unit: "hour" as const, salary: 50_000 }));
    expect(run(days, { kind: "week", mode: "daily" }).pieces[0]).toMatchObject({ mode: "hourly", worked: 40, amount: 2_000_000 });
  });

  it("«вне работы» в норме, но не засчитан; неподтверждённый и «вне графика» — тоже", () => {
    const days = range("2026-10-01", "2026-10-31").map((d) => (d.date < "2026-10-15" ? { ...d, outside_employment: true } : d));
    expect(run(days).pieces[0]).toMatchObject({ worked: 12, amount: Math.round((3_000_000 * 12) / 22) });
    const other = range("2026-10-01", "2026-10-31");
    other[0]!.unconfirmed = true;
    other[1]!.off_schedule = true;
    expect(run(other).pieces[0]!.worked).toBe(20);
  });

  it("старая формула опозданий — только в дневном режиме", () => {
    const days = range("2026-10-01", "2026-10-31");
    days[0]!.late_minutes = 50;
    days[1]!.late_minutes = 40;
    const settings = { coefficient: 4, grace: 30 };
    expect(run(days, { legacy: true, settings }).lateness[0]!.amount).toBe(Math.round((3_000_000 / (22 * 480)) * 60 * 4));
    expect(run(days, { legacy: true, settings, mode: "hourly" }).lateness).toEqual([]);
    expect(run(days, { legacy: false, settings }).lateness).toEqual([]);
  });
});
