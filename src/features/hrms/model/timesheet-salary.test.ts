import { describe, expect, it } from "vitest";
import { calculateSalaryRow, fromDays, type HrmsEmployee, type SalaryDay } from "./timesheet-salary";

/* Тесты salary-calculation.test.js HRMS — те же цифры. */
const employee = (over: Partial<HrmsEmployee> = {}): HrmsEmployee => ({
  base_salary: 1_000_000,
  pay_unit: "month",
  work_days: 22,
  actual_work_days: 11,
  plan_hours: 176,
  paid_hours: 88,
  segments: [{ unit_work_days: 22, work_days: 22, credited_days: 11 }],
  ...over,
});

describe("calculateSalaryRow — как HRMS", () => {
  it("месячная ставка ограничена сменами, ставка не меняется", () => {
    expect(calculateSalaryRow(employee({ actual_work_days: 30 }), "daily")).toMatchObject({ workedDays: 22, accruedValue: 1_000_000 });
    expect(calculateSalaryRow(employee(), "daily").accruedValue).toBe(500_000);
  });

  it("округление на половине — порядок действий HRMS", () => {
    const input = employee({ base_salary: 1, work_days: 98, actual_work_days: 49, plan_hours: 98, paid_hours: 49, segments: [{ unit_work_days: 98, work_days: 98, credited_days: 49 }] });
    expect(calculateSalaryRow(input, "daily").accruedValue).toBe(1);
    expect(calculateSalaryRow(input, "hourly").accruedValue).toBe(1);
  });

  it("часовой: часы до сотых, переработка оплачивается", () => {
    expect(calculateSalaryRow(employee({ plan_hours: 8.335, paid_hours: 7.125 }), "hourly")).toMatchObject({ workDays: 8.34, workedDays: 7.13, accruedValue: 854_916 });
    expect(calculateSalaryRow(employee({ paid_hours: 264 }), "hourly").accruedValue).toBe(1_500_000);
  });

  it("ставка за день — с днями без смены; за час — всегда часовой", () => {
    const daily = employee({ base_salary: 200_000, pay_unit: "day", segments: [{ unit_work_days: 10, work_days: 10, credited_days: 11 }] });
    expect(calculateSalaryRow(daily, "daily").accruedValue).toBe(2_200_000);
    expect(calculateSalaryRow(employee({ base_salary: 25_000, pay_unit: "hour", paid_hours: 79 }), "daily")).toMatchObject({ rowHourly: true, accruedValue: 1_975_000 });
  });

  it("неделя ×4 в месяце, месяц ÷4 в неделе, нулевая норма", () => {
    expect(calculateSalaryRow(employee({ pay_unit: "week", paid_hours: 176 }), "hourly", true).accruedValue).toBe(4_000_000);
    expect(calculateSalaryRow(employee({ plan_hours: 40, paid_hours: 40 }), "hourly", false).accruedValue).toBe(250_000);
    expect(calculateSalaryRow(employee({ plan_hours: 0 }), "hourly").accruedValue).toBe(0);
    expect(calculateSalaryRow(employee({ segments: [{ unit_work_days: 0, work_days: 0, credited_days: 2 }] }), "daily").accruedValue).toBe(0);
  });

  it("месяц по отрезкам и неделя с потолком смен недели", () => {
    const monthly = employee({ actual_work_days: 12, work_days: 12, segments: [{ unit_work_days: 20, work_days: 5, credited_days: 5 }, { unit_work_days: 25, work_days: 7, credited_days: 7 }] });
    expect(calculateSalaryRow(monthly, "daily").accruedValue).toBe(530_000);
    const weekly = employee({ pay_unit: "week", segments: [{ unit_work_days: 5, work_days: 3, credited_days: 6 }] });
    expect(calculateSalaryRow(weekly, "daily")).toMatchObject({ workedDays: 3, accruedValue: 600_000 });
  });
});

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
  no_checkout: false,
  salary: 3_000_000,
  pay_unit: "month",
  ...extra,
});
const range = (from: string, to: string) => {
  const out: SalaryDay[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekend = [0, 6].includes(d.getUTCDay());
    out.push(day(d.toISOString().slice(0, 10), weekend ? { has_shift: false, plan_minutes: 0, day_kind: "day_off", worked_minutes: 0 } : {}));
  }
  return out;
};

describe("fromDays — вход HRMS из строк дня", () => {
  it("месяц: смены, засчитанное, опоздания, нет ухода; норма месяца — из табеля", () => {
    const days = range("2026-10-01", "2026-10-31");
    days[0]!.day_kind = "absent";
    days[1]!.late_minutes = 25;
    days[5]!.no_checkout = true;
    const input = fromDays(days, new Map([["2026-10-01", { shifts: 22, minutesPerDay: 480 }]]), { from: "2026-10-01", to: "2026-10-31" })!;
    expect(input).toMatchObject({ base_salary: 3_000_000, work_days: 22, actual_work_days: 21, late_minutes: 25, daily_minutes: 480, segments: [{ unit_work_days: 22, work_days: 22, credited_days: 21 }] });
    expect(input.no_checkout).toEqual(["06.10"]);
    expect(calculateSalaryRow(input, "daily").accruedValue).toBe(Math.round(3_000_000 * (21 / 22)));
  });

  it("неделя на стыке: месячная ставка — два отрезка по месяцам", () => {
    const days = range("2026-09-28", "2026-10-04");
    const input = fromDays(days, new Map([["2026-09-01", { shifts: 22, minutesPerDay: 480 }], ["2026-10-01", { shifts: 22, minutesPerDay: 480 }]]), { from: "2026-09-28", to: "2026-10-04" })!;
    expect(input.segments).toEqual([{ unit_work_days: 22, work_days: 3, credited_days: 3 }, { unit_work_days: 22, work_days: 2, credited_days: 2 }]);
    expect(calculateSalaryRow(input, "daily", false).accruedValue).toBe(Math.round((3_000_000 * 3) / 22 + (3_000_000 * 2) / 22));
  });

  it("смен в графике нет — норма 0, оклад 0, как в HRMS", () => {
    const days = range("2026-08-24", "2026-08-30").map((d) => ({ ...d, has_shift: false, plan_minutes: 0 }));
    const input = fromDays(days, new Map([["2026-08-01", { shifts: 0, minutesPerDay: 480 }]]), { from: "2026-08-24", to: "2026-08-30" })!;
    expect(input.has_work_schedule).toBe(false);
    expect(calculateSalaryRow(input, "daily", false).accruedValue).toBe(0);
  });

  it("принят 15-го, смены на весь месяц: дни до приёма — «вне работы», в норме, но не засчитаны (как HRMS)", () => {
    const days = range("2026-10-01", "2026-10-31").map((d) => (d.date < "2026-10-15" ? { ...d, outside_employment: true, salary: 0 } : d));
    const input = fromDays(days, new Map([["2026-10-01", { shifts: 22, minutesPerDay: 480 }]]), { from: "2026-10-01", to: "2026-10-31" })!;
    expect(input).toMatchObject({ base_salary: 3_000_000, work_days: 22, actual_work_days: 12 });
    expect(calculateSalaryRow(input, "daily").accruedValue).toBe(Math.round(3_000_000 * (12 / 22)));
    // Часовой: норма часов — тоже весь месяц, а не только дни с назначением.
    expect(calculateSalaryRow(input, "hourly").accruedValue).toBe(Math.round(3_000_000 * (96 / 176)));
  });

  it("введённые 0 часов — 0, план только когда нет ухода (COALESCE(fact, plan) HRMS)", () => {
    const days = range("2026-10-05", "2026-10-09");
    days[0]!.worked_minutes = 0;
    days[1]!.worked_minutes = 0;
    days[1]!.no_checkout = true;
    const input = fromDays(days, new Map(), { from: "2026-10-05", to: "2026-10-09" })!;
    expect(input.paid_hours).toBe(8 * 4);
  });

  it("дней в периоде нет — null", () => {
    expect(fromDays([], new Map(), { from: "2026-10-01", to: "2026-10-31" })).toBeNull();
  });
});
