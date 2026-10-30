import { isWeekend, type SheetTotals } from "./timesheet";

/** Статусы документа «Табель» (`hr_timesheets.status`). */
export const SHEET_STATUS = { draft: "draft", review: "review", approved: "approved" } as const;

/** Действие истории (`hr_timesheet_events.action`). */
export type SheetAction = "filled" | "approved" | "returned" | "edited" | "comment";
export type SheetEvent = { action: SheetAction; field?: string; before?: string; after?: string; comment?: string; dayId?: string };

export type DeptSummary = {
  people: number;
  workedMinutes: number;
  overtimeMinutes: number;
  absences: number;
};

/** Итоги строк табеля → по отделу. Люди без отдела — под "". */
export function summarize(rows: { departmentId: string; totals: SheetTotals }[]): Map<string, DeptSummary> {
  const out = new Map<string, DeptSummary>();
  for (const { departmentId, totals } of rows) {
    const sum = out.get(departmentId) ?? { people: 0, workedMinutes: 0, overtimeMinutes: 0, absences: 0 };
    sum.people += 1;
    sum.workedMinutes += totals.workedMinutes;
    sum.overtimeMinutes += totals.overtimeMinutes;
    sum.absences += totals.absences;
    out.set(departmentId, sum);
  }
  return out;
}

/** Рабочие дни месяца по календарю: будни без праздников компании. */
export const workDaysOf = (dates: string[], holidays: ReadonlyMap<string, string>) =>
  dates.filter((date) => !isWeekend(date) && !holidays.has(date)).length;

/** Часы с одним знаком: так их пишет `worked_hours` / `overtime_hours`. */
export const hoursOf = (minutes: number) => Math.round(minutes / 6) / 10;

export type Existing = { guid: string; departmentId: string; status: string };

/**
 * Что сделать с табелями месяца: отдел без документа — создать, с черновиком
 * или «на проверке» — пересчитать, утверждённый — не трогать (по нему уже
 * считают зарплату). Отделы без людей пропускаются.
 */
export function planFill(existing: Existing[], departments: string[]) {
  const byDept = new Map(existing.map((row) => [row.departmentId, row]));
  const create: string[] = [];
  const update: { guid: string; departmentId: string }[] = [];
  const locked: string[] = [];
  for (const departmentId of departments) {
    const row = byDept.get(departmentId);
    if (!row) create.push(departmentId);
    else if (row.status === SHEET_STATUS.approved) locked.push(departmentId);
    else update.push({ guid: row.guid, departmentId });
  }
  return { create, update, locked };
}

/** «Октябрь 2026» — заглавной, как в названии табеля прототипа. */
export const monthName = (month: string, locale: string) => {
  const name = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .formatToParts(new Date(`${month}-01T00:00:00Z`))
    .filter((part) => part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** «28.09 – 04.10.2026» — неделя пн–вс табеля. */
export const weekName = (monday: string, locale: string) => {
  const end = new Date(`${monday}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const short = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  return `${short.format(new Date(`${monday}T00:00:00Z`))} – ${full.format(end)}`;
};
