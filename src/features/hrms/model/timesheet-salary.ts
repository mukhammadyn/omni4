/**
 * Строка ведомости Excel «Зарплаты» — арифметика шаблона HRMS один в один
 * (`udevs-hrms-reports/src/methods/salary-calculation.js`: rowMode,
 * hourlyFactor, creditedDays, accruedSalary, calculateSalaryRow), чтобы и
 * цифры, и формулы в файле были как в HRMS (ADR-0018, дополнение от
 * 2026-10-28). Вход HRMS собирается из строк дня: утверждённых табелей, а
 * где их нет — из посещаемости (`fromDays`).
 */
import type { CalcMode } from "./payroll";
import type { DayRow, PayUnit } from "./timesheet-days";

/** Отрезок ставки: месяц (у месячной) или неделя (у недельной), как `segments` HRMS. */
export type Segment = { unit_work_days: number; work_days: number; credited_days: number };

/** Вход `calculateSalaryRow` HRMS. */
export type HrmsEmployee = {
  base_salary: number;
  pay_unit: PayUnit;
  work_days: number;
  actual_work_days: number;
  plan_hours: number;
  paid_hours: number;
  segments: Segment[];
};

const hours2 = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

/** Ставка за час — всегда часовой, остальные — режим ведомости. */
export const rowMode = (employee: Pick<HrmsEmployee, "pay_unit">, mode: CalcMode): CalcMode => (employee.pay_unit === "hour" ? "hourly" : mode);

/** Множитель ставки к периоду в часовом шаблоне и он же кусок формулы. */
export function hourlyFactor(employee: Pick<HrmsEmployee, "pay_unit" | "work_days">, isMonthPeriod: boolean) {
  if (employee.pay_unit === "day") {
    const shifts = Math.max(0, employee.work_days);
    return { k: shifts, excel: `*${shifts}` };
  }
  if (employee.pay_unit === "week" && isMonthPeriod) return { k: 4, excel: "*4" };
  if (employee.pay_unit === "month" && !isMonthPeriod) return { k: 1 / 4, excel: "/4" };
  return { k: 1, excel: "" };
}

function hourlyPrice(employee: HrmsEmployee, isMonthPeriod: boolean) {
  if (employee.pay_unit === "hour") return employee.base_salary;
  const norm = employee.plan_hours;
  return norm > 0 ? (employee.base_salary * hourlyFactor(employee, isMonthPeriod).k) / norm : 0;
}

function creditedDays(employee: HrmsEmployee) {
  return employee.segments.reduce((total, s) => total + (employee.pay_unit === "day" ? s.credited_days : Math.min(s.credited_days, s.work_days)), 0);
}

function accruedSalary(employee: HrmsEmployee, mode: CalcMode, isMonthPeriod: boolean) {
  const salary = employee.base_salary;
  if (rowMode(employee, mode) === "hourly") return Math.round(hourlyPrice(employee, isMonthPeriod) * employee.paid_hours);
  if (employee.pay_unit === "day") return Math.round(salary * creditedDays(employee));
  return Math.round(
    employee.segments.reduce((total, s) => {
      const cap = employee.pay_unit === "month" ? s.unit_work_days : s.work_days;
      return s.unit_work_days > 0 ? total + (salary * Math.min(s.credited_days, cap)) / s.unit_work_days : total;
    }, 0),
  );
}

/** Точно арифметика ячеек ведомости HRMS: порядок действий и округление часов до сотых не менять. */
export function calculateSalaryRow(employee: HrmsEmployee, mode: CalcMode, isMonthPeriod = true) {
  const salaryMonth = employee.base_salary;
  const unit = employee.pay_unit;
  const rowHourly = rowMode(employee, mode) === "hourly";
  const workDays = rowHourly ? hours2(employee.plan_hours) : Math.max(0, employee.work_days);
  const creditedAll = Math.max(0, employee.actual_work_days);
  const workedDays = rowHourly
    ? hours2(employee.paid_hours)
    : unit === "month"
      ? workDays > 0
        ? Math.min(creditedAll, workDays)
        : creditedAll
      : creditedDays(employee);
  const segments = employee.segments;
  const single = unit === "month" && segments.length === 1 ? segments[0]! : null;
  const monthNorm = single ? single.unit_work_days : 0;
  let priceValue: number;
  let accruedValue: number;
  // Доли кусков «засчитано/смены» — и для цены, и для формулы цены в файле.
  const shares = segments
    .filter((s) => s.unit_work_days > 0)
    .map((s) => [Math.min(s.credited_days, unit === "month" ? s.unit_work_days : s.work_days), s.unit_work_days] as const);
  if (rowHourly && unit !== "hour") {
    const { k } = hourlyFactor(employee, isMonthPeriod);
    priceValue = workDays > 0 ? (salaryMonth * k) / workDays : 0;
    accruedValue = workDays > 0 ? Math.round(k === 1 ? salaryMonth * (workedDays / workDays) : priceValue * workedDays) : 0;
  } else if (unit === "day" || unit === "hour") {
    priceValue = salaryMonth;
    accruedValue = Math.round(salaryMonth * workedDays);
  } else if (single) {
    priceValue = monthNorm > 0 ? salaryMonth / monthNorm : 0;
    accruedValue = monthNorm > 0 ? Math.round(salaryMonth * (workedDays / monthNorm)) : 0;
  } else {
    accruedValue = accruedSalary(employee, mode, isMonthPeriod);
    const shareSum = shares.reduce((total, [credited, shifts]) => total + credited / shifts, 0);
    priceValue = workedDays > 0 ? (salaryMonth * shareSum) / workedDays : 0;
  }
  return { salaryMonth, unit, rowHourly, workDays, workedDays, single, monthNorm, priceValue, accruedValue, shares };
}

/* ---------- вход HRMS из строк дня ---------- */

export type SalaryDay = Pick<
  DayRow,
  | "date"
  | "outside_period"
  | "outside_employment"
  | "unconfirmed"
  | "off_schedule"
  | "has_shift"
  | "plan_minutes"
  | "day_kind"
  | "absence_paid"
  | "worked_minutes"
  | "late_minutes"
  | "no_checkout"
  | "salary"
  | "pay_unit"
>;

/** Норма месяца по сотруднику (`hr_timesheet_norms`): смен в месяце и минут в дне. */
export type MonthNorm = { shifts: number; minutesPerDay: number };

/** Всё, что строке ведомости нужно кроме оклада: опоздания, подсказки, норма минут. */
export type SalaryInput = HrmsEmployee & {
  late_minutes: number;
  has_work_schedule: boolean;
  /** Минут в дне — для старой формулы опозданий (средняя смена, иначе часов в дне из настроек). */
  daily_minutes: number;
  /** Смен в месяце первого отрезка — знаменатель старой формулы у недельной ведомости. */
  month_work_days: number;
  no_checkout: string[];
  off_shift: string[];
};

const WORKED: ReadonlySet<string> = new Set(["worked", "late", "missing_mark"]);
const isShift = (day: SalaryDay) => day.has_shift && day.plan_minutes > 0;
const monday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
const ddmm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

function credited(day: SalaryDay, unit: string) {
  if (day.outside_employment || day.unconfirmed) return false;
  const byUnit = unit === "day" || unit === "hour";
  const worked = WORKED.has(day.day_kind) && (byUnit || !day.off_schedule);
  const paidLeave = day.day_kind === "leave" && day.absence_paid && (isShift(day) || !byUnit);
  return worked || paidLeave;
}
// Оплачиваемые часы: факт; план — только когда ухода нет (COALESCE(fact, plan) HRMS): введённый 0 — это 0.
const paidHours = (day: SalaryDay) => (WORKED.has(day.day_kind) && !day.no_checkout ? day.worked_minutes : day.plan_minutes) / 60;

/**
 * Строки дня сотрудника (вместе с «вне месяца» соседних недель) → вход HRMS
 * за период ведомости. Ставка — последняя в периоде, как HRMS берёт
 * последнее назначение. Дней в периоде нет — null.
 */
export function fromDays(
  days: SalaryDay[],
  norms: ReadonlyMap<string, MonthNorm>,
  { from, to }: { from: string; to: string },
): SalaryInput | null {
  const inside = days.filter((day) => !day.outside_period && day.date >= from && day.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  // Ставка — последнего дня с назначением: у дней «вне работы» ставки нет.
  const last = inside.filter((day) => day.salary > 0).at(-1) ?? inside.at(-1);
  if (!last) return null;
  const unit = last.pay_unit;
  const byUnit = unit === "day" || unit === "hour";
  const done = inside.filter((day) => credited(day, unit));

  const group = (key: (date: string) => string) => {
    const keys = [...new Set(inside.map((day) => key(day.date)))];
    return keys.map((id) => {
      const own = inside.filter((day) => key(day.date) === id);
      const whole = unit === "month" ? (norms.get(id)?.shifts ?? days.filter((day) => key(day.date) === id && isShift(day)).length) : days.filter((day) => key(day.date) === id && isShift(day)).length;
      return { unit_work_days: whole, work_days: own.filter(isShift).length, credited_days: own.filter((day) => credited(day, unit)).length };
    });
  };
  const workDays = inside.filter(isShift).length;
  const segments =
    unit === "month"
      ? group((date) => `${date.slice(0, 7)}-01`)
      : unit === "week"
        ? group(monday)
        : [{ unit_work_days: workDays, work_days: workDays, credited_days: done.length }];
  const norm = norms.get(`${from.slice(0, 7)}-01`);
  return {
    base_salary: last.salary,
    pay_unit: unit,
    work_days: workDays,
    actual_work_days: done.length,
    plan_hours: inside.filter(isShift).reduce((sum, day) => sum + day.plan_minutes, 0) / 60,
    paid_hours: done.reduce((sum, day) => sum + paidHours(day), 0),
    segments,
    // Неподтверждённые отметки HRMS в опоздания не берёт.
    late_minutes: inside.filter((day) => !day.outside_employment && !day.unconfirmed && WORKED.has(day.day_kind)).reduce((sum, day) => sum + day.late_minutes, 0),
    has_work_schedule: workDays > 0,
    daily_minutes: norm?.minutesPerDay ?? 0,
    month_work_days: segments[0]?.unit_work_days ?? 0,
    no_checkout: done.filter((day) => WORKED.has(day.day_kind) && day.no_checkout && (isShift(day) || !byUnit)).map((day) => ddmm(day.date)),
    off_shift: done.filter((day) => WORKED.has(day.day_kind) && !isShift(day) && byUnit).map((day) => ddmm(day.date)),
  };
}
