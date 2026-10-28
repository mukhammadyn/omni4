import { expect, test } from "vitest";
import { buildCell, type RowInput } from "./timesheet";
import { isEdited, jobOn, loadRange, mergeDay, monthNorm, ownDates, sheetTotals, toDayRow, type Job } from "./timesheet-days";

const input = (patch: Partial<RowInput> = {}): RowInput => ({
  dates: [],
  today: "2026-10-27",
  hireDate: "",
  dismissalDate: "",
  planByDate: new Map([["2026-10-05", 480]]),
  dayByDate: new Map([
    [
      "2026-10-05",
      { id: "d", date: "2026-10-05", status: "late", review: "none", firstIn: "2026-10-05T04:40:00Z", lastOut: "", workedMinutes: null, lateMinutes: 40, earlyMinutes: 0, requestId: "", comment: "" },
    ],
  ]),
  leaves: [],
  holidays: new Map(),
  ...patch,
});
const job: Job = { employeeId: "e", departmentId: "sales", from: "2026-01-01", to: "", salary: 3000000, unit: "month", currency: "UZS" };

test("строка дня из ячейки: опоздание, нет ухода, ставка дня, исходные значения", () => {
  const row = toDayRow(buildCell(input(), "2026-10-05"), 480, job, false);
  expect(row).toMatchObject({
    day_kind: "missing_mark",
    late_minutes: 40,
    no_checkout: true,
    has_shift: true,
    plan_minutes: 480,
    salary: 3000000,
    pay_unit: "month",
    orig_late_minutes: 40,
  });
  expect(isEdited({ ...row, guid: "g", hr_employees_id: "e" })).toBe(false);
});

test("повторное «Заполнить»: правка остаётся, исходное обновляется", () => {
  const first = { ...toDayRow(buildCell(input(), "2026-10-05"), 480, job, false), guid: "g", hr_employees_id: "e" };
  const edited = { ...first, late_minutes: 0, reason: "пробка" };
  const fresh = { ...first, late_minutes: 45, orig_late_minutes: 45 };
  expect(mergeDay(fresh, edited)).toMatchObject({ late_minutes: 0, orig_late_minutes: 45, reason: "пробка" });
  // Не поправленный — новый целиком.
  expect(mergeDay(fresh, first).late_minutes).toBe(45);
});

test("день по истории назначений", () => {
  const jobs: Job[] = [job, { ...job, departmentId: "dev", from: "2026-10-15" }];
  const dates = ["2026-09-28", "2026-09-30", "2026-10-01", "2026-10-14", "2026-10-15", "2026-10-20"];
  const sales = ownDates({
    dates,
    from: "2026-10-01",
    to: "2026-10-31",
    departmentOn: (date) => jobOn(jobs, date)?.departmentId ?? "",
    department: "sales",
  });
  expect(sales.inside).toEqual(["2026-10-01", "2026-10-14"]);
  // Неделя на стыке: дни сентября — «вне месяца».
  expect(sales.outside).toEqual(["2026-09-28", "2026-09-30"]);
  const dev = ownDates({ dates, from: "2026-10-01", to: "2026-10-31", departmentOn: (date) => jobOn(jobs, date)?.departmentId ?? "", department: "dev" });
  expect(dev.inside).toEqual(["2026-10-15", "2026-10-20"]);
});

test("загрузка — целые месяцы и недели; норма месяца — смены и средняя длина", () => {
  expect(loadRange("2026-09-28", "2026-10-04")).toEqual({ from: "2026-09-01", to: "2026-10-31" });
  expect(loadRange("2026-10-01", "2026-10-31")).toEqual({ from: "2026-09-28", to: "2026-11-01" });
  const plan = new Map([["2026-10-01", 480], ["2026-10-02", 240], ["2026-10-03", 0], ["2026-11-01", 480]]);
  expect(monthNorm(plan, "2026-10", 8)).toEqual({ shifts_in_month: 2, minutes_per_day: 360 });
  expect(monthNorm(new Map(), "2026-10", 8)).toEqual({ shifts_in_month: 0, minutes_per_day: 480 });
});

test("итоги документа — без «вне месяца» и неподтверждённых", () => {
  const base = { hr_employees_id: "e", outside_period: false, day_kind: "worked" as const, worked_minutes: 540, plan_minutes: 480, unconfirmed: false };
  expect(
    sheetTotals([base, { ...base, outside_period: true }, { ...base, unconfirmed: true }, { ...base, day_kind: "absent", worked_minutes: 0 }]),
  ).toEqual({ people: 1, workedMinutes: 540, overtimeMinutes: 60, absences: 1 });
});
