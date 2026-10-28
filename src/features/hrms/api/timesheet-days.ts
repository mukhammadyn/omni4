import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchRow, type Item } from "@/features/item";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { buildCell, datesOf } from "../model/timesheet";
import {
  isEdited,
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
export const TIMESHEET_NORMS = "hr_timesheet_norms";
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

/** Отдел сотрудника на дату. ponytail: без истории назначений — отдел карточки; заведут историю — уйдёт само. */
const departmentOf = (own: Job[], employee: { departmentId: string }) => (date: string) =>
  own.length ? (jobOn(own, date)?.departmentId ?? "") : employee.departmentId;

/**
 * Строка дня принадлежит табелю. Удалённый через общую таблицу табель
 * оставляет строки дня с пустой ссылкой (бэкенд её обнуляет, а не удаляет
 * строку) — это не «другой табель», их не считаем и правки из них не берём.
 */
const ofSheet = (row: Item) => Boolean(text(row.hr_timesheets_id));

/**
 * День табеля компании, как ведомость HRMS (`salary-attendance.js:34-55`):
 * у кого есть назначение в периоде — его дни с назначением (с отделом или
 * без) и смены без назначения: их HRMS тоже считает в норме, но не засчитывает
 * (`unit_work_days`), — такие строки копируются «вне работы» (`noJob`). Без
 * истории назначений — по отделу карточки, как и `departmentOf`.
 */
const worksOf = (own: Job[], employee: { departmentId: string }, plan: ReadonlyMap<string, number>, from: string, to: string) => {
  if (!own.length) return () => Boolean(employee.departmentId);
  const employed = own.some((job) => job.from <= to && (!job.to || job.to >= from));
  return (date: string) => Boolean(jobOn(own, date)) || (employed && (plan.get(date) ?? 0) > 0);
};

/** Строка дня из посещаемости; смена без назначения — «вне работы»: в норме, не засчитана. */
const dayRow = (input: { planByDate: ReadonlyMap<string, number> }, cell: Parameters<typeof toDayRow>[0], own: Job[], outside: boolean) => {
  const job = jobOn(own, cell.date);
  const row = toDayRow(cell, input.planByDate.get(cell.date) ?? 0, job, outside);
  return own.length && !job ? { ...row, outside_employment: true } : row;
};

/**
 * `departmentId` пуст — табель компании (все, у кого есть назначение);
 * задан — табель отдела, заведённый до 2026-10-28. `fresh` — табель только
 * что заведён: прежних норм у него нет, искать нечего.
 */
export type FillTarget = { guid: string; departmentId: string; fresh?: boolean };
export type FillResult = { people: number };

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

  const allJobs = useMemo(() => jobs.rows.map(toJob), [jobs.rows]);

  /**
   * Без кэша: после «Заполнить» перечитать табели, дни и историю — делает
   * вызывающий, один раз. Пакет по отделам иначе на каждом отделе тянул бы
   * дни всего периода заново (~1 МБ за месяц).
   */
  const fill = async (target: FillTarget): Promise<FillResult> => {
    const days = stored.rows.filter(ofSheet).map((row) => ({ ...toStoredDay(row), sheet: text(row.hr_timesheets_id) }));
    const old = new Map(days.filter((d) => d.sheet === target.guid).map((d) => [`${d.hr_employees_id}:${d.date}`, d]));
    /*
     * Правка того же дня в другом табеле (месячный черновик → недельная копия):
     * без неё копия взяла бы сырую посещаемость, и правку пришлось бы повторять.
     * ponytail: правлен в нескольких табелях — берётся первый попавшийся.
     */
    const foreign = new Map<string, DayRow>();
    for (const d of days) {
      const key = `${d.hr_employees_id}:${d.date}`;
      if (d.sheet !== target.guid && !d.outside_period && isEdited(d) && !foreign.has(key)) foreign.set(key, d);
    }
    const maxHours = num(settings.rows[0]?.max_hours_per_day) || 8;

    const rows: Record<string, unknown>[] = [];
    const norms: Record<string, unknown>[] = [];
    let people = 0;
    for (const employee of sheet.employees) {
      const own = allJobs.filter((job) => job.employeeId === employee.id);
      const departmentOn = departmentOf(own, employee);
      const picked = ownDates({
        dates,
        from,
        to,
        belongs: target.departmentId ? (date) => departmentOn(date) === target.departmentId : worksOf(own, employee, sheet.inputOf(employee).planByDate, from, to),
      });
      if (!picked.inside.length) continue;
      people += 1;
      const input = sheet.inputOf(employee);
      for (const [list, outside] of [[picked.inside, false], [picked.outside, true]] as const) {
        for (const date of list) {
          const key = `${employee.id}:${date}`;
          const fresh = dayRow(input, buildCell(input, date), own, outside);
          const prev = old.get(key);
          old.delete(key);
          // Своя правка важнее чужой; guid — всегда своей строки, чужую не забираем.
          const edits = prev && isEdited(prev) ? prev : (foreign.get(key) ?? prev);
          rows.push({ guid: prev?.guid ?? crypto.randomUUID(), hr_timesheets_id: target.guid, hr_employees_id: employee.id, ...mergeDay(fresh, edits) });
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
    const oldNorms = target.fresh
      ? null
      : await api.post<{ data?: { response?: Item[] } }>(`/v2/object/get-list/${TIMESHEET_NORMS}`, {
          data: { hr_timesheets_id: target.guid, limit: 1000 },
        });
    const normIds = (oldNorms?.data?.response ?? []).map((row) => text(row.guid));
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
    return { people };
  };

  const refresh = () =>
    Promise.all(
      [TIMESHEETS, TIMESHEET_DAYS, TIMESHEET_EVENTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })),
    );

  /*
   * `cover` — дни периода «сотрудник:дата» табеля компании (ключ "") и отделов,
   * `holder` — в каких табелях день уже лежит: по ним окно предупреждает
   * о пересечении.
   */
  const { cover, holder } = useMemo(() => {
    const cover = new Map<string, string[]>();
    const add = (id: string, key: string) => (cover.get(id) ?? cover.set(id, []).get(id)!).push(key);
    for (const employee of sheet.employees) {
      const own = allJobs.filter((job) => job.employeeId === employee.id);
      const departmentOn = departmentOf(own, employee);
      const works = worksOf(own, employee, sheet.inputOf(employee).planByDate, from, to);
      for (const date of dates) {
        if (date < from || date > to || !works(date)) continue;
        add("", `${employee.id}:${date}`);
        const id = departmentOn(date);
        if (id) add(id, `${employee.id}:${date}`);
      }
    }
    const holder = new Map<string, string[]>();
    for (const row of stored.rows) {
      if (row.outside_period || !ofSheet(row)) continue;
      const key = `${text(row.hr_employees_id)}:${text(row.date).slice(0, 10)}`;
      (holder.get(key) ?? holder.set(key, []).get(key)!).push(text(row.hr_timesheets_id));
    }
    return { cover, holder };
  }, [sheet.employees, allJobs, stored.rows, dates, from, to]);

  /** Сколько дней табеля (компании — `""`, или отдела) уже лежат в других табелях; `own` — сам табель. */
  const overlap = useCallback(
    (departmentId: string, own?: string) =>
      (cover.get(departmentId) ?? []).filter((key) => (holder.get(key) ?? []).some((sheetId) => sheetId !== own)).length,
    [cover, holder],
  );

  /**
   * Табель компании в памяти — тот же расчёт дней и норм, что у «Заполнить»,
   * без записи. Нужен шаблону Excel «Зарплаты» там, где утверждённого табеля
   * за период нет: как в HRMS, цифры тогда из посещаемости, с предупреждением.
   */
  const draft = useCallback(() => {
    const maxHours = num(settings.rows[0]?.max_hours_per_day) || 8;
    const out = new Map<string, { days: Omit<DayRow, "guid" | "hr_employees_id">[]; norms: Map<string, { shifts: number; minutesPerDay: number }> }>();
    for (const employee of sheet.employees) {
      const own = allJobs.filter((job) => job.employeeId === employee.id);
      const input = sheet.inputOf(employee);
      const picked = ownDates({ dates, from, to, belongs: worksOf(own, employee, input.planByDate, from, to) });
      if (!picked.inside.length) continue;
      const days = [...picked.inside.map((date) => [date, false] as const), ...picked.outside.map((date) => [date, true] as const)].map(([date, outside]) =>
        dayRow(input, buildCell(input, date), own, outside),
      );
      const norms = new Map(
        monthsOf(from, to).map((month) => {
          const norm = monthNorm(input.planByDate, month, maxHours);
          return [`${month}-01`, { shifts: norm.shifts_in_month, minutesPerDay: norm.minutes_per_day }] as const;
        }),
      );
      out.set(employee.id, { days, norms });
    }
    return out;
  }, [sheet, allJobs, dates, from, to, settings.rows]);

  return { loading, fill, refresh, draft, stored: stored.rows, from, to, overlap };
}

/**
 * Правка дня бухгалтером: значения и причина в строку, событие — в историю
 * табеля с ссылкой на день. Итоги документа — заново из строк.
 *
 * Строка дня меняется в кэше сразу, а три записи идут параллельно: дни
 * табеля компании за месяц — ~1 700 строк, ~3 МБ, и перечитывать их ради
 * одной ячейки значило ждать каждую правку по 4–6 с. Перечитываются
 * только сам табель (итоги) и история.
 */
export function useEditDay(timesheet: string, rows: DayRow[]) {
  const queryClient = useQueryClient();
  const refresh = (slugs: string[]) => Promise.all(slugs.map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })));
  return useMutation({
    // Правки одного табеля — по очереди: окно закрывается сразу, и две быстрые правки
    // иначе гонялись бы (итоги табеля последней правки могли прийти раньше).
    scope: { id: `timesheet-day-edit:${timesheet}` },
    mutationFn: async ({ row, label, values, reason, before, after }: { row: DayRow; label: string; values: Edit; reason: string; before: string; after: string }) => {
      const sum = sheetTotals(rows.map((item) => (item.guid === row.guid ? { ...item, ...values } : item)));
      await Promise.all([
        api.put<unknown>(`/v2/items/${TIMESHEET_DAYS}`, { data: { guid: row.guid, ...values, reason } }),
        api.put<unknown>(`/v2/items/${TIMESHEETS}`, {
          data: { guid: timesheet, worked_hours: hoursOf(sum.workedMinutes), overtime_hours: hoursOf(sum.overtimeMinutes), absence_days: sum.absences },
        }),
        logEvent(timesheet, { action: "edited", field: label, before, after, ...(reason ? { comment: reason } : {}), dayId: row.guid }),
      ]);
    },
    onMutate: async ({ row, values, reason }) => {
      // Летящий запрос дней перезаписал бы патч старым ответом.
      await queryClient.cancelQueries({ queryKey: keys.items.table(TIMESHEET_DAYS) });
      queryClient.setQueriesData({ queryKey: keys.items.table(TIMESHEET_DAYS) }, (page: unknown) =>
        patchRow(page, { guid: row.guid, values: { ...values, reason } }),
      );
    },
    onError: (error) => {
      reportError(error, "common.saveFailed");
      // Запись могла пройти частично (день — да, итоги или история — нет): правду знает только сервер.
      void refresh([TIMESHEET_DAYS]);
    },
    onSettled: () => refresh([TIMESHEETS, TIMESHEET_EVENTS]),
  });
}

/** Функция расчёта: та, что считает посещаемость проекта (`<проект>-hrms-hickvision`). */
async function payrollFunctionId(): Promise<string> {
  const list = await api.get<{ functions?: { id?: string; path?: string }[] | null }>("/v2/function", { params: { limit: 100, offset: 0 } });
  return (list.functions ?? []).find((fn) => fn.path?.endsWith("-hrms-hickvision"))?.id ?? "";
}

export type SheetDecision = "approve" | "return";

/**
 * Дни табеля, которые лежат и в других табелях, — для предупреждения при
 * «Утвердить»: `paid` — из них в утверждённых, за них зарплата уже записана.
 */
export function useSheetOverlap(guid: string, days: DayRow[]) {
  const mine = useMemo(() => new Set(days.filter((day) => !day.outside_period).map((day) => `${day.hr_employees_id}:${day.date}`)), [days]);
  const people = useMemo(() => [...new Set(days.map((day) => day.hr_employees_id))], [days]);
  const dates = days.map((day) => day.date).sort();
  // Только люди этого табеля за его даты, а не дни всей компании за месяц.
  const others = useAll(people.length ? TIMESHEET_DAYS : undefined, {
    hr_employees_id: { op: "any", values: people },
    date: { op: "between", values: [dates[0] ?? "", dates.at(-1) ?? ""] },
  }, false);
  // Статусы — только тех табелей, где нашлись те же дни.
  const ids = useMemo(() => [...new Set(others.rows.map((row) => text(row.hr_timesheets_id)))].filter((id) => id && id !== guid), [others.rows, guid]);
  const sheets = useAll(ids.length ? TIMESHEETS : undefined, { guid: { op: "any", values: ids } }, false);
  return useMemo(() => {
    const approved = new Set(sheets.rows.filter((row) => firstText(row.status) === "approved").map((row) => text(row.guid)));
    let total = 0;
    let paid = 0;
    for (const row of others.rows) {
      const sheet = text(row.hr_timesheets_id);
      if (row.outside_period || !sheet || sheet === guid || !mine.has(`${text(row.hr_employees_id)}:${text(row.date).slice(0, 10)}`)) continue;
      total += 1;
      if (approved.has(sheet)) paid += 1;
    }
    return { loading: others.loading || sheets.loading, total, paid };
  }, [others.rows, others.loading, sheets.rows, sheets.loading, mine, guid]);
}

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
    // Строки табеля теперь — штрафы по политикам: сумма снимаемого, без знака.
    total: own.reduce((sum, row) => sum + num(row.amount), 0),
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
