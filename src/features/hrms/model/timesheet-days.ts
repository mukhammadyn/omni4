/*
 * Строки дня табеля (`hr_timesheet_days`, ADR-0018): копия табеля
 * посещаемости в момент «Заполнить» — вход функции расчёта зарплаты.
 * Здесь только правила: что копировать, чей день, что сохранить при
 * повторном «Заполнить», норма месяца и итоги документа.
 */
import { overtimeOf, plusDays, rangeOf, type CellKind, type Leave, type SheetCell } from "./timesheet";

export type PeriodKind = "month" | "week";
export type PayUnit = "month" | "week" | "day" | "hour";

/** Вид дня строки (`day_kind`): CellKind без «вне работы» и «на работе». */
export type DayKind = "worked" | "late" | "absent" | "leave" | "day_off" | "holiday" | "missing_mark" | "empty" | "future";
export const DAY_KINDS: readonly DayKind[] = ["worked", "late", "absent", "leave", "day_off", "holiday", "missing_mark", "empty", "future"];

/** Что правит бухгалтер; у каждого — исходное `orig_*`. */
export const EDITABLE = ["late_minutes", "early_minutes", "worked_minutes", "no_checkout", "day_kind"] as const;
export type Editable = (typeof EDITABLE)[number];
export type Edit = { late_minutes: number; early_minutes: number; worked_minutes: number; no_checkout: boolean; day_kind: DayKind };

export type DayRow = Edit & {
  guid: string;
  hr_employees_id: string;
  date: string;
  outside_period: boolean;
  check_in: string | null;
  check_out: string | null;
  salary: number;
  currency: string;
  pay_unit: PayUnit;
  plan_minutes: number;
  is_holiday: boolean;
  has_shift: boolean;
  is_remote: boolean;
  is_excused: boolean;
  has_absence: boolean;
  absence_paid: boolean;
  off_schedule: boolean;
  outside_employment: boolean;
  unconfirmed: boolean;
  hr_absence_types_id: string | null;
  reason: string;
  orig_late_minutes: number;
  orig_early_minutes: number;
  orig_worked_minutes: number;
  orig_no_checkout: boolean;
  orig_day_kind: DayKind;
};

/** Назначение (`hr_job_history`): отдел и ставка на отрезок дат. */
export type Job = { employeeId: string; departmentId: string; from: string; to: string; salary: number; unit: PayUnit; currency: string };

/** Назначение на дату: последнее начавшееся и ещё не закрытое. */
export const jobOn = (jobs: Job[], date: string): Job | undefined =>
  jobs.filter((job) => job.from <= date && (!job.to || job.to >= date)).sort((a, b) => b.from.localeCompare(a.from))[0];

/** Границы периода табеля: месяц или неделя пн–вс от `period`. */
export const periodRange = (period: string, kind: PeriodKind) => rangeOf(kind, period);

/**
 * Что грузить: целые месяцы, которые задевает период (норма месяца),
 * и целые недели (недельная ставка делится по сменам всей недели).
 */
export function loadRange(from: string, to: string) {
  const months = { from: rangeOf("month", from).from, to: rangeOf("month", to).to };
  const weeks = { from: rangeOf("week", from).from, to: rangeOf("week", to).to };
  return { from: months.from < weeks.from ? months.from : weeks.from, to: months.to > weeks.to ? months.to : weeks.to };
}

const KIND: Partial<Record<CellKind, DayKind>> = { at_work: "missing_mark", outside: "empty" };
const dayKindOf = (kind: CellKind): DayKind => KIND[kind] ?? (kind as DayKind);

/** Строка дня из ячейки табеля посещаемости и назначения на эту дату. */
export function toDayRow(cell: SheetCell, plan: number, job: Job | undefined, outsidePeriod: boolean): Omit<DayRow, "guid" | "hr_employees_id"> {
  const day = cell.day;
  const kind = dayKindOf(cell.kind);
  const edit: Edit = {
    late_minutes: cell.lateMinutes,
    early_minutes: day?.earlyMinutes ?? 0,
    worked_minutes: cell.workedMinutes ?? 0,
    no_checkout: Boolean(day?.firstIn && !day.lastOut),
    day_kind: kind,
  };
  return {
    ...edit,
    date: cell.date,
    outside_period: outsidePeriod,
    check_in: day?.firstIn || null,
    check_out: day?.lastOut || null,
    salary: job?.salary ?? 0,
    currency: job?.currency || "UZS",
    pay_unit: job?.unit ?? "month",
    // План — по сменам, до того как отсутствие сняло его с нормы ячейки.
    plan_minutes: plan,
    is_holiday: Boolean(cell.holiday),
    has_shift: plan > 0,
    is_remote: cell.remote,
    is_excused: day?.status === "excused",
    has_absence: cell.kind === "leave",
    absence_paid: cell.leave?.paid === true,
    off_schedule: day?.status === "off_schedule",
    outside_employment: cell.kind === "outside",
    unconfirmed: !cell.counted || cell.pending.length > 0,
    hr_absence_types_id: cell.leave?.typeId || null,
    reason: "",
    orig_late_minutes: edit.late_minutes,
    orig_early_minutes: edit.early_minutes,
    orig_worked_minutes: edit.worked_minutes,
    orig_no_checkout: edit.no_checkout,
    orig_day_kind: edit.day_kind,
  };
}

const ORIG: Record<Editable, keyof DayRow> = {
  late_minutes: "orig_late_minutes",
  early_minutes: "orig_early_minutes",
  worked_minutes: "orig_worked_minutes",
  no_checkout: "orig_no_checkout",
  day_kind: "orig_day_kind",
};

/** Поправлен ли день бухгалтером: значение не равно исходному. */
export const isEdited = (row: Pick<DayRow, Editable | (typeof ORIG)[Editable]>) =>
  EDITABLE.some((key) => row[key] !== row[ORIG[key] as keyof typeof row]);

/**
 * Повторное «Заполнить»: непоправленный день берётся новым целиком,
 * у поправленного новые только исходные значения и всё нередактируемое —
 * правки и причина остаются.
 */
export function mergeDay(fresh: Omit<DayRow, "guid" | "hr_employees_id">, old: DayRow | undefined): Omit<DayRow, "guid" | "hr_employees_id"> {
  if (!old || !isEdited(old)) return fresh;
  const kept = Object.fromEntries(EDITABLE.map((key) => [key, old[key]])) as Edit;
  return { ...fresh, ...kept, reason: old.reason };
}

/**
 * Дни сотрудника в табеле отдела: в периоде — те, где он по истории
 * назначений в этом отделе; для недель на стыке — дни соседних месяцев
 * «вне месяца» (только для расчёта). Что день уже лежит в другом табеле,
 * не запрет, а предупреждение (ADR-0018, дополнение от 2026-10-28).
 */
export function ownDates({
  dates,
  from,
  to,
  departmentOn,
  department,
}: {
  dates: string[];
  from: string;
  to: string;
  departmentOn: (date: string) => string;
  department: string;
}): { inside: string[]; outside: string[] } {
  const inside = dates.filter((date) => date >= from && date <= to && departmentOn(date) === department);
  if (!inside.length) return { inside, outside: [] };
  const weekFrom = rangeOf("week", from).from;
  const weekTo = plusDays(rangeOf("week", to).from, 6);
  const outside = dates.filter((date) => date >= weekFrom && date <= weekTo && (date < from || date > to));
  return { inside, outside };
}

/**
 * Норма месяца (`hr_timesheet_norms`): смен в месяце и средняя длина смены —
 * знаменатель старой формулы HRMS (`get-salary-excel-template.js:521-529`);
 * смен нет — `max_hours_per_day` настроек.
 */
export function monthNorm(planByDate: ReadonlyMap<string, number>, month: string, maxHoursPerDay: number) {
  const plans = [...planByDate].filter(([date, plan]) => date.startsWith(month) && plan > 0).map(([, plan]) => plan);
  const average = plans.length ? plans.reduce((sum, plan) => sum + plan, 0) / plans.length : maxHoursPerDay * 60;
  return { shifts_in_month: plans.length, minutes_per_day: Math.round(average) };
}

/** Месяцы ГГГГ-ММ, которые задевает период. */
export const monthsOf = (from: string, to: string) => [...new Set([from.slice(0, 7), to.slice(0, 7)])];

const WORKED: ReadonlySet<DayKind> = new Set(["worked", "late", "missing_mark"]);

/** Итоги документа из строк дня, без «вне месяца». */
export function sheetTotals(rows: Pick<DayRow, "hr_employees_id" | "outside_period" | "day_kind" | "worked_minutes" | "plan_minutes" | "unconfirmed">[]) {
  const own = rows.filter((row) => !row.outside_period);
  let worked = 0;
  let overtime = 0;
  let absences = 0;
  for (const row of own) {
    if (row.day_kind === "absent") absences += 1;
    if (!WORKED.has(row.day_kind) || row.unconfirmed) continue;
    worked += row.worked_minutes;
    overtime += overtimeOf(row.worked_minutes, row.plan_minutes);
  }
  return { people: new Set(own.map((row) => row.hr_employees_id)).size, workedMinutes: worked, overtimeMinutes: overtime, absences };
}

/**
 * Строка дня → ячейка табеля для показа (CellView). Отсутствие снимает
 * день с нормы, как у табеля посещаемости; неподтверждённый — с точкой.
 */
export function toSheetCell(row: DayRow, leaveOf: (typeId: string | null) => Leave | null): SheetCell {
  const leave = row.day_kind === "leave" ? leaveOf(row.hr_absence_types_id) : null;
  const plan = row.day_kind === "leave" || row.outside_employment ? 0 : row.plan_minutes;
  const worked = WORKED.has(row.day_kind);
  return {
    date: row.date,
    kind: row.outside_employment ? "outside" : row.day_kind,
    counted: !row.unconfirmed,
    workedMinutes: worked && !(row.no_checkout && !row.worked_minutes) ? row.worked_minutes : null,
    planMinutes: plan,
    lateMinutes: worked ? row.late_minutes : 0,
    overtimeMinutes: worked ? overtimeOf(row.worked_minutes, plan) : 0,
    remote: row.is_remote,
    day: null,
    leave,
    holiday: "",
    pending: row.unconfirmed ? ["mark"] : [],
    pendingLeave: null,
  };
}
