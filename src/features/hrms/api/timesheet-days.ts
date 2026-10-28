import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Item } from "@/features/item";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { buildCell, datesOf } from "../model/timesheet";
import {
  jobOn,
  loadRange,
  mergeDay,
  monthNorm,
  monthsOf,
  ownDates,
  periodRange,
  sheetTotals,
  toDayRow,
  type DayKind,
  type DayRow,
  type Edit,
  type Job,
  type PayUnit,
  type PeriodKind,
} from "../model/timesheet-days";
import { hoursOf, workDaysOf } from "../model/timesheet-docs";
import { JOB_HISTORY } from "./job-history";
import { PAYROLL_LINES } from "./payroll";
import { firstText, text } from "./org";
import { upsert } from "./schedule";
import { useAll, useTimesheet } from "./timesheet";
import { logEvent, TIMESHEETS, TIMESHEET_EVENTS } from "./timesheet-docs";

/** Строки дня табеля и норма месяца (ADR-0018). */
export const TIMESHEET_DAYS = "hr_timesheet_days";
const TIMESHEET_NORMS = "hr_timesheet_norms";
const UNITS: readonly string[] = ["month", "week", "day", "hour"];

const num = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
const bool = (value: unknown) => value === true;

/** Строка `hr_timesheet_days` → DayRow; PICK_LIST читается первым значением. */
export const toStoredDay = (row: Item): DayRow => ({
  guid: text(row.guid),
  hr_employees_id: text(row.hr_employees_id),
  date: text(row.date).slice(0, 10),
  outside_period: bool(row.outside_period),
  check_in: text(row.check_in) || null,
  check_out: text(row.check_out) || null,
  salary: num(row.salary),
  currency: firstText(row.currency) || "UZS",
  pay_unit: (firstText(row.pay_unit) || "month") as PayUnit,
  plan_minutes: num(row.plan_minutes),
  is_holiday: bool(row.is_holiday),
  has_shift: bool(row.has_shift),
  is_remote: bool(row.is_remote),
  is_excused: bool(row.is_excused),
  has_absence: bool(row.has_absence),
  absence_paid: bool(row.absence_paid),
  off_schedule: bool(row.off_schedule),
  outside_employment: bool(row.outside_employment),
  unconfirmed: bool(row.unconfirmed),
  hr_absence_types_id: text(row.hr_absence_types_id) || null,
  late_minutes: num(row.late_minutes),
  early_minutes: num(row.early_minutes),
  worked_minutes: num(row.worked_minutes),
  no_checkout: bool(row.no_checkout),
  day_kind: (firstText(row.day_kind) || "empty") as DayKind,
  reason: text(row.reason),
  orig_late_minutes: num(row.orig_late_minutes),
  orig_early_minutes: num(row.orig_early_minutes),
  orig_worked_minutes: num(row.orig_worked_minutes),
  orig_no_checkout: bool(row.orig_no_checkout),
  orig_day_kind: (firstText(row.orig_day_kind) || "empty") as DayKind,
});

const toJob = (row: Item): Job => ({
  employeeId: text(row.hr_employees_id),
  departmentId: text(row.hr_departments_id),
  from: text(row.date_from).slice(0, 10),
  to: text(row.date_to).slice(0, 10),
  salary: num(row.salary),
  unit: (UNITS.includes(firstText(row.pay_unit)) ? firstText(row.pay_unit) : "month") as PayUnit,
  currency: firstText(row.currency) || "UZS",
});

/** Строки дня одного табеля — для страницы. */
export function useTimesheetDays(guid: string) {
  const query = useAll(TIMESHEET_DAYS, { hr_timesheets_id: { op: "is", values: [guid] } }, false);
  const rows = useMemo(() => query.rows.map(toStoredDay), [query.rows]);
  return { rows, loading: query.loading };
}

export type FillTarget = { guid: string; departmentId: string };
export type FillResult = { people: number; skipped: number };

/**
 * «Заполнить» в строки дня (ADR-0018): табель посещаемости компании за
 * период с целыми месяцами и неделями, история назначений, уже занятые
 * другими табелями дни и прежние строки. `fill(target)` пишет один табель.
 *
 * ponytail: грузится вся компания за период — отдел по истории назначений
 * на день известен только после загрузки. Сотни людей × 40 дней — порции
 * MAX_LIMIT; станет тяжело — отбирать по назначениям периода.
 */
export function useFillDays(period: string, kind: PeriodKind) {
  const { from, to } = periodRange(period, kind);
  const wide = loadRange(from, to);
  const dates = useMemo(() => datesOf(wide), [wide.from, wide.to]);
  const sheet = useTimesheet({ ...wide, dates, today: todayInput(), search: "", dismissed: true });
  const jobs = useAll(JOB_HISTORY, { date_from: { op: "before", values: [wide.to] } }, false);
  const stored = useAll(TIMESHEET_DAYS, { date: { op: "between", values: [wide.from, wide.to] } }, false);
  const settings = useAll("core_settings", {}, false);
  const queryClient = useQueryClient();
  const loading = sheet.loading || jobs.loading || stored.loading || settings.loading;

  const fill = async (target: FillTarget): Promise<FillResult> => {
    const allJobs = jobs.rows.map(toJob);
    const days = stored.rows.map((row) => ({ ...toStoredDay(row), sheet: text(row.hr_timesheets_id) }));
    const taken = new Set(days.filter((d) => d.sheet !== target.guid && !d.outside_period).map((d) => `${d.hr_employees_id}:${d.date}`));
    const old = new Map(days.filter((d) => d.sheet === target.guid).map((d) => [`${d.hr_employees_id}:${d.date}`, d]));
    const maxHours = num(settings.rows[0]?.max_hours_per_day) || 8;

    const rows: Record<string, unknown>[] = [];
    const norms: Record<string, unknown>[] = [];
    let skipped = 0;
    let people = 0;
    for (const employee of sheet.employees) {
      const own = allJobs.filter((job) => job.employeeId === employee.id);
      // ponytail: без истории назначений — отдел карточки; заведут историю — уйдёт само.
      const departmentOn = (date: string) => (own.length ? (jobOn(own, date)?.departmentId ?? "") : employee.departmentId);
      const picked = ownDates({
        dates,
        from,
        to,
        departmentOn,
        department: target.departmentId,
        taken: (date) => taken.has(`${employee.id}:${date}`),
      });
      skipped += picked.skipped;
      if (!picked.inside.length) continue;
      people += 1;
      const input = sheet.inputOf(employee);
      for (const [list, outside] of [[picked.inside, false], [picked.outside, true]] as const) {
        for (const date of list) {
          const key = `${employee.id}:${date}`;
          const fresh = toDayRow(buildCell(input, date), input.planByDate.get(date) ?? 0, jobOn(own, date), outside);
          const prev = old.get(key);
          old.delete(key);
          rows.push({ guid: prev?.guid ?? crypto.randomUUID(), hr_timesheets_id: target.guid, hr_employees_id: employee.id, ...mergeDay(fresh, prev) });
        }
      }
      for (const month of monthsOf(from, to)) {
        norms.push({ guid: crypto.randomUUID(), hr_timesheets_id: target.guid, hr_employees_id: employee.id, month: `${month}-01`, ...monthNorm(input.planByDate, month, maxHours) });
      }
    }

    // ponytail: без транзакции — сбой посреди оставит часть строк; повтор «Заполнить» доделает.
    for (let i = 0; i < rows.length; i += 1000) await upsert(TIMESHEET_DAYS, rows.slice(i, i + 1000));
    const stale = [...old.values()].map((d) => d.guid);
    if (stale.length) await api.delete<unknown>(`/v1/object/${TIMESHEET_DAYS}`, { data: { ids: stale } });
    const oldNorms = await api.post<{ data?: { response?: Item[] } }>(`/v2/object/get-list/${TIMESHEET_NORMS}`, {
      data: { hr_timesheets_id: target.guid, limit: 1000 },
    });
    const normIds = (oldNorms.data?.response ?? []).map((row) => text(row.guid));
    if (normIds.length) await api.delete<unknown>(`/v1/object/${TIMESHEET_NORMS}`, { data: { ids: normIds } });
    await upsert(TIMESHEET_NORMS, norms);

    const sum = sheetTotals(rows as unknown as DayRow[]);
    await api.put<unknown>(`/v2/items/${TIMESHEETS}`, {
      data: {
        guid: target.guid,
        period: from,
        period_kind: kind,
        people: sum.people,
        work_days: workDaysOf(datesOf({ from, to }), sheet.holidays),
        worked_hours: hoursOf(sum.workedMinutes),
        overtime_hours: hoursOf(sum.overtimeMinutes),
        absence_days: sum.absences,
      },
    });
    await logEvent(target.guid, { action: "filled" });
    await Promise.all(
      [TIMESHEETS, TIMESHEET_DAYS, TIMESHEET_EVENTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })),
    );
    return { people, skipped };
  };

  // Отделы, у которых в периоде есть люди: по назначениям, без них — по карточке.
  const { departments, unassigned } = useMemo(() => {
    const out = new Set<string>();
    let none = 0;
    const allJobs = jobs.rows.map(toJob);
    for (const employee of sheet.employees) {
      const own = allJobs.filter((job) => job.employeeId === employee.id && job.from <= to && (!job.to || job.to >= from));
      const ids = own.length ? own.map((job) => job.departmentId) : [employee.departmentId];
      for (const id of ids) if (id) out.add(id);
      if (!ids.some(Boolean)) none += 1;
    }
    return { departments: out, unassigned: none };
  }, [sheet.employees, jobs.rows, from, to]);

  return { loading, fill, from, to, departments, unassigned };
}

/**
 * Правка дня бухгалтером: значения и причина в строку, событие — в историю
 * табеля с ссылкой на день. Итоги документа — заново из строк.
 */
export function useEditDay(timesheet: string, rows: DayRow[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, label, values, reason, before, after }: { row: DayRow; label: string; values: Edit; reason: string; before: string; after: string }) => {
      await api.put<unknown>(`/v2/items/${TIMESHEET_DAYS}`, { data: { guid: row.guid, ...values, reason } });
      const sum = sheetTotals(rows.map((item) => (item.guid === row.guid ? { ...item, ...values } : item)));
      await api.put<unknown>(`/v2/items/${TIMESHEETS}`, {
        data: { guid: timesheet, worked_hours: hoursOf(sum.workedMinutes), overtime_hours: hoursOf(sum.overtimeMinutes), absence_days: sum.absences },
      });
      await logEvent(timesheet, { action: "edited", field: label, before, after, ...(reason ? { comment: reason } : {}), dayId: row.guid });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all(
        [TIMESHEETS, TIMESHEET_DAYS, TIMESHEET_EVENTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })),
      ),
  });
}

/** Функция расчёта: та, что считает посещаемость проекта (`<проект>-hrms-hickvision`). */
async function payrollFunctionId(): Promise<string> {
  const list = await api.get<{ functions?: { id?: string; path?: string }[] | null }>("/v2/function", { params: { limit: 100, offset: 0 } });
  return (list.functions ?? []).find((fn) => fn.path?.endsWith("-hrms-hickvision"))?.id ?? "";
}

export type SheetDecision = "approve" | "return";

/**
 * Строки «Зарплаты» табеля — что снимет «Вернуть на доработку»: сколько
 * и сколько к выплате. Отбор ещё и здесь: в omni4 поля `hr_timesheets_id`
 * у строк нет, а фильтр по чужому полю бэкенд молча пропускает и отдаёт всё.
 */
export function useSheetPay(guid: string) {
  const { rows, loading } = useAll(PAYROLL_LINES, { hr_timesheets_id: { op: "is", values: [guid] } }, false);
  const own = rows.filter((row) => text(row.hr_timesheets_id) === guid);
  return {
    loading,
    count: own.length,
    total: own.reduce((sum, row) => sum + (firstText(row.kind) === "deduction" ? -num(row.amount) : num(row.amount)), 0),
  };
}

/**
 * «Утвердить» / «Вернуть» — метод функции (ADR-0018): строки «Зарплаты»
 * и статус табеля она пишет сама, одной транзакцией. Ответ функции шлюз
 * наружу не отдаёт, а таймаут у него 30 с, поэтому итог — статус табеля,
 * перечитанный после вызова, в том числе после ошибки.
 *
 * Нет функции (omni4, ADR-0018 «Последствия») — меняется только статус.
 */
export function useDecideSheet(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ decision, mode }: { decision: SheetDecision; mode: "daily" | "hourly" }) => {
      const want = decision === "approve" ? "approved" : "review";
      const functionId = await payrollFunctionId();
      let failure: unknown = null;
      if (!functionId) {
        await api.put<unknown>(`/v2/items/${TIMESHEETS}`, { data: { guid, status: want } });
        await logEvent(guid, { action: decision === "approve" ? "approved" : "returned" });
      } else {
        try {
          await api.post<unknown>("/v1/invoke_function", {
            function_id: functionId,
            table_slug: TIMESHEETS,
            object_ids: [guid],
            attributes: {
              method: decision === "approve" ? "timesheet_approve" : "timesheet_return",
              data: { token: session.getAccess(), hr_timesheets_id: guid, mode },
            },
          });
        } catch (error) {
          failure = error;
        }
      }
      const fresh = await api.post<{ data?: { response?: Item[] | null } }>(`/v2/object/get-list/${TIMESHEETS}`, {
        data: { guid, limit: 1 },
      });
      if (firstText(fresh.data?.response?.[0]?.status) !== want) throw failure ?? new Error("status unchanged");
    },
    onError: (error) => reportError(error, "timesheets.decideFailed"),
    onSettled: () =>
      Promise.all(
        [TIMESHEETS, TIMESHEET_EVENTS, PAYROLL_LINES].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })),
      ),
  });
}
