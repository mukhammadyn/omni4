/**
 * Оклад и старая формула опозданий по строкам дня утверждённого табеля —
 * для шаблона Excel «Зарплаты», в выбранном режиме (дневной / часовой), как
 * ведомость HRMS (ADR-0018, дополнение от 2026-10-28). Перенос
 * `omni5-hrms-hickvision/src/methods/timesheet-payroll.js` без штрафов:
 * штрафы по политикам пишет функция при «Утвердить». Арифметика —
 * salary-calculation.js HRMS; правишь здесь — правь и там.
 */
import type { CalcMode, SalaryPiece } from "./payroll";
import type { DayRow, PeriodKind } from "./timesheet-days";

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
  | "salary"
  | "pay_unit"
  | "currency"
>;

/** Норма месяца по сотруднику (`hr_timesheet_norms`): смен в месяце и минут в дне. */
export type MonthNorm = { shifts: number; minutesPerDay: number };

/** Кусок оклада с месяцем, к которому он относится (первое число). */
export type SheetPiece = SalaryPiece & { month: string };
export type SheetLateness = { month: string; from: string; to: string; amount: number };

const WORKED: ReadonlySet<string> = new Set(["worked", "late", "missing_mark"]);
const month1 = (date: string) => `${date.slice(0, 7)}-01`;
const round2 = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

const monday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};

// Смена дня входит в норму; «вне работы» — тоже, но не засчитывается.
const isShift = (day: SalaryDay) => day.has_shift && day.plan_minutes > 0;

/** Засчитан ли день ставке: приход или оплачиваемое отсутствие (`fetchEmployeesWithSalary` HRMS). */
function credited(day: SalaryDay, unit: string) {
  if (day.outside_period || day.outside_employment || day.unconfirmed) return false;
  const byUnit = unit === "day" || unit === "hour";
  const worked = WORKED.has(day.day_kind) && (byUnit || !day.off_schedule);
  const paidLeave = day.day_kind === "leave" && day.absence_paid && (isShift(day) || !byUnit);
  return worked || paidLeave;
}

// Оплачиваемые часы засчитанного дня: факт, без ухода и отпуск — по плану.
const paidHours = (day: SalaryDay) => (WORKED.has(day.day_kind) && day.worked_minutes > 0 ? day.worked_minutes : day.plan_minutes) / 60;

type Piece = { month: string; salary: number; unit: string; currency: string; days: SalaryDay[] };

// Куски периода: месяц × ставка × единица × валюта (новая ставка с 20-го — свой кусок).
function piecesOf(days: SalaryDay[]): Piece[] {
  const map = new Map<string, Piece>();
  for (const day of days) {
    if (day.outside_period) continue;
    const key = [month1(day.date), day.salary, day.pay_unit, day.currency].join("|");
    if (!map.has(key)) map.set(key, { month: month1(day.date), salary: day.salary, unit: day.pay_unit, currency: day.currency, days: [] });
    map.get(key)!.days.push(day);
  }
  return [...map.values()];
}

function pieceSalary(piece: Piece, all: SalaryDay[], kind: PeriodKind, mode: CalcMode, norm: MonthNorm | undefined) {
  const { salary, unit } = piece;
  const hourly = unit === "hour" || mode === "hourly";
  const mine = piece.days.filter((day) => credited(day, unit));
  const creditedDays = mine.length;
  const hours = round2(mine.reduce((sum, day) => sum + paidHours(day), 0));
  const periodDays = all.filter((day) => !day.outside_period);
  const planHours = round2(periodDays.filter(isShift).reduce((sum, day) => sum + day.plan_minutes, 0) / 60);
  const periodShifts = periodDays.filter(isShift).length;

  if (hourly) {
    if (unit === "hour") return { norm: planHours, worked: hours, amount: Math.round(salary * hours) };
    // Ставка, приведённая к периоду, ÷ норма часов (hourlyFactor HRMS).
    const k = unit === "day" ? periodShifts : unit === "week" && kind === "month" ? 4 : unit === "month" && kind === "week" ? 1 / 4 : 1;
    if (planHours <= 0) return { norm: planHours, worked: hours, amount: 0 };
    // k = 1 — порядком действий HRMS: на ровно .5 иначе ±1.
    const amount = k === 1 ? Math.round(salary * (hours / planHours)) : Math.round(((salary * k) / planHours) * hours);
    return { norm: planHours, worked: hours, amount };
  }
  if (unit === "day") return { norm: periodShifts, worked: creditedDays, amount: Math.round(salary * creditedDays) };
  if (unit === "month") {
    const shifts = norm?.shifts ?? 0;
    const worked = shifts > 0 ? Math.min(creditedDays, shifts) : creditedDays;
    return { norm: shifts, worked, amount: shifts > 0 ? Math.round(salary * (worked / shifts)) : 0 };
  }
  // Неделя: каждая неделя пн–вс по сменам целой недели, дни соседнего месяца — в знаменателе.
  let share = 0;
  let worked = 0;
  for (const week of new Set(piece.days.map((day) => monday(day.date)))) {
    const unitShifts = all.filter((day) => monday(day.date) === week && isShift(day)).length;
    const ownShifts = piece.days.filter((day) => monday(day.date) === week && isShift(day)).length;
    const done = Math.min(mine.filter((day) => monday(day.date) === week).length, ownShifts);
    if (unitShifts > 0) share += done / unitShifts;
    worked += done;
  }
  return { norm: periodShifts, worked, amount: Math.round(salary * share) };
}

// Старая формула опозданий HRMS (get-salary-excel-template.js:543-565): месячная ставка, дневной режим.
function legacyLateness(piece: Piece, mode: CalcMode, norm: MonthNorm | undefined, settings: { coefficient: number; grace: number }) {
  if (piece.unit !== "month" || mode !== "daily" || !piece.days.some(isShift)) return 0;
  const monthMinutes = (norm?.shifts ?? 0) * (norm?.minutesPerDay ?? 0);
  if (monthMinutes <= 0) return 0;
  const late = piece.days.filter((day) => !day.outside_employment && WORKED.has(day.day_kind)).reduce((sum, day) => sum + day.late_minutes, 0);
  return Math.round((piece.salary / monthMinutes) * Math.max(0, late - settings.grace) * settings.coefficient);
}

/**
 * Оклад одного сотрудника по одному табелю. `days` — его строки дня (с «вне
 * месяца»), `norms` — «ГГГГ-ММ-01» → норма, `legacy` — нет назначений
 * политики штрафов, работает старая формула опозданий.
 */
export function sheetSalary({
  days,
  norms,
  kind,
  mode,
  legacy,
  settings,
}: {
  days: SalaryDay[];
  norms: ReadonlyMap<string, MonthNorm>;
  kind: PeriodKind;
  mode: CalcMode;
  legacy: boolean;
  settings: { coefficient: number; grace: number };
}): { pieces: SheetPiece[]; lateness: SheetLateness[] } {
  const pieces: SheetPiece[] = [];
  const lateness: SheetLateness[] = [];
  for (const piece of piecesOf(days)) {
    const dates = piece.days.map((day) => day.date).sort();
    const from = dates[0]!;
    const to = dates[dates.length - 1]!;
    const norm = norms.get(piece.month);
    const pay = pieceSalary(piece, days, kind, mode, norm);
    const unit = (["month", "week", "day", "hour"].includes(piece.unit) ? piece.unit : "month") as SalaryPiece["unit"];
    if (pay.amount > 0) pieces.push({ month: piece.month, from, to, rate: piece.salary, unit, mode: unit === "hour" ? "hourly" : mode, ...pay });
    if (legacy) {
      const amount = legacyLateness(piece, mode, norm, settings);
      if (amount > 0) lateness.push({ month: piece.month, from, to, amount });
    }
  }
  return { pieces, lateness };
}
