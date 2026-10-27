import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { MAX_LIMIT, PEOPLE, useItem, useItems, useUpdateItem } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { datesOf, totalsOf, type Leave, type SheetCell } from "../model/timesheet";
import { periodRange, toSheetCell, type PeriodKind } from "../model/timesheet-days";
import { planFill, SHEET_STATUS, type SheetEvent } from "../model/timesheet-docs";
import { EMPLOYEES } from "./employee";
import { firstText, text } from "./org";
import { useAll } from "./timesheet";
import { useFillDays, useTimesheetDays, type FillResult, type FillTarget } from "./timesheet-days";

/** «Табели» — документ «табель за месяц по отделу» (`timesheets.html` прототипа). */
export const TIMESHEETS = "hr_timesheets";
/** История табеля — `history` прототипа: событие на действие и правку. */
export const TIMESHEET_EVENTS = "hr_timesheet_events";

/**
 * «Заполнить из посещаемости» на списке: по табелю на отдел за период
 * (месяц или неделя). Отдел без документа — создать черновиком, с
 * черновиком или «на проверке» — заполнить заново, утверждённый — не
 * трогать. Дни — useFillDays: принадлежность по истории назначений.
 */
export function useTimesheetFill(period: string, kind: PeriodKind) {
  const days = useFillDays(period, kind);
  const departments = useAll("hr_departments", {}, false);
  const existing = useAll(TIMESHEETS, { period: { op: "between", values: [days.from, days.from] } }, false);
  const loading = days.loading || departments.loading || existing.loading;

  const plan = useMemo(() => {
    if (loading) return null;
    const names = new Map(departments.rows.map((row) => [text(row.guid), text(row.name)]));
    // Без отдела документ не завести: Many2One пустым — не «отдел».
    const depts = [...days.departments].filter((id) => names.has(id));
    const same = existing.rows.filter((row) => (firstText(row.period_kind) || "month") === kind);
    return {
      ...planFill(
        same.map((row) => ({ guid: text(row.guid), departmentId: text(row.hr_departments_id), status: firstText(row.status) })),
        depts,
      ),
      names,
      unassigned: days.unassigned,
    };
  }, [loading, departments.rows, existing.rows, days.departments, days.unassigned, kind]);

  return { loading, plan, fill: days.fill, from: days.from };
}

export type FillPlan = NonNullable<ReturnType<typeof useTimesheetFill>["plan"]>;

/** Событие истории; автор — вошедший (у ADMIN без строки `core_users` — пусто). */
export async function logEvent(timesheet: string, event: SheetEvent) {
  await api.post<unknown>(`/v2/items/${TIMESHEET_EVENTS}`, {
    data: {
      guid: crypto.randomUUID(),
      hr_timesheets_id: timesheet,
      core_users_id: session.getObjectIds()[PEOPLE] ?? null,
      action: event.action,
      field: event.field ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      comment: event.comment ?? null,
      hr_timesheet_days_id: event.dayId ?? null,
    },
  });
}

/** Лента истории табеля, новые сверху (порядок бэкенда по умолчанию). */
export function useTimesheetEvents(guid: string) {
  const { page, isLoading } = useItems(TIMESHEET_EVENTS, {
    limit: 200,
    page: 1,
    filters: { hr_timesheets_id: { op: "contains", values: [guid] } },
  });
  return { rows: page.rows, isLoading };
}

/**
 * Записать событие истории. Отдельно от правки: сбой истории не должен
 * откатывать уже сохранённое поле, а лишь сказать о себе.
 */
export function useLogEvent(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: SheetEvent) => logEvent(guid, event),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.items.table(TIMESHEET_EVENTS) }),
  });
}

/** Новые табели — черновиком, ответственный — вошедший; затем каждый заполняется днями. */
export function useWriteTimesheets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      plan,
      period,
      kind,
      title,
      fill,
    }: {
      plan: FillPlan;
      period: string;
      kind: PeriodKind;
      title: (dept: string) => string;
      fill: (target: FillTarget) => Promise<FillResult>;
    }) => {
      let skipped = 0;
      for (const departmentId of plan.create) {
        const guid = crypto.randomUUID();
        await api.post<unknown>(`/v2/items/${TIMESHEETS}`, {
          data: {
            guid,
            title: title(plan.names.get(departmentId) ?? ""),
            period,
            period_kind: kind,
            hr_departments_id: departmentId,
            status: SHEET_STATUS.draft,
            core_users_id: session.getObjectIds()[PEOPLE] ?? null,
          },
        });
        const result = await fill({ guid, departmentId });
        skipped += result.skipped;
        // Все дни отдела уже в других табелях — пустой документ не нужен.
        if (!result.people) await api.delete<unknown>(`/v1/object/${TIMESHEETS}`, { data: { ids: [guid] } });
      }
      for (const target of plan.update) skipped += (await fill(target)).skipped;
      return { skipped };
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all(
        [TIMESHEETS, TIMESHEET_EVENTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })),
      ),
  });
}

/**
 * Один табель — страница `timesheet.html` прототипа: запись, схема, права
 * и сохранённые строки дня (ADR-0018) — сотрудники × дни периода.
 */
export function useTimesheetDoc(guid: string) {
  const record = useItem(TIMESHEETS, guid, true);
  const { schema, isLoading } = useTableSchema(TIMESHEETS);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(TIMESHEETS);
  const row = record.item;
  const kind: PeriodKind = firstText(row?.period_kind) === "week" ? "week" : "month";
  const { from, to } = periodRange(text(row?.period).slice(0, 10) || todayInput(), kind);
  const dates = useMemo(() => datesOf({ from, to }), [from, to]);
  const days = useTimesheetDays(guid);
  const ids = useMemo(() => [...new Set(days.rows.map((day) => day.hr_employees_id))], [days.rows]);
  const people = useAll(ids.length ? EMPLOYEES : undefined, { guid: { op: "any", values: ids } }, false);
  const types = useAll("hr_absence_types", {}, false);
  // Имена пользователей — «Ответственному» в истории: у нового значения связи `_data` ещё старая.
  const users = useAll(PEOPLE, {}, false);
  const userNames = useMemo(
    () => new Map(users.rows.map((user) => [text(user.guid), text(user.full_name) || text(user.email)])),
    [users.rows],
  );
  const absenceTypes = useMemo(
    () => types.rows.map((type) => ({ id: text(type.guid), title: text(type.name), code: text(type.code), icon: text(type.icon), color: text(type.color), paid: type.is_paid === true })),
    [types.rows],
  );
  const holidays = useMemo(() => new Map(days.rows.filter((day) => day.is_holiday).map((day) => [day.date, ""])), [days.rows]);
  const rows = useMemo(() => {
    const leaveOf = (typeId: string | null): Leave | null => {
      const type = absenceTypes.find((item) => item.id === typeId);
      return type ? { ...type, typeId: type.id, status: "approved", from: "", to: "" } : null;
    };
    const names = new Map(people.rows.map((person) => [text(person.guid), person]));
    return ids
      .map((id) => {
        const person = names.get(id);
        const own = days.rows.filter((day) => day.hr_employees_id === id && !day.outside_period);
        const byDate = new Map(own.map((day) => [day.date, day]));
        const cells = dates.map((date) => {
          const day = byDate.get(date);
          return day ? toSheetCell(day, leaveOf) : null;
        });
        const shown = cells.filter((cell): cell is SheetCell => cell !== null);
        return {
          employee: { id, name: text(person?.full_name) || "—", photo: text(person?.photo) },
          cells,
          byDate,
          totals: totalsOf(shown, todayInput()),
        };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [ids, people.rows, days.rows, dates, absenceTypes]);
  return {
    row,
    isLoading: record.isLoading || isLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    can: permissionOf(TIMESHEETS),
    userNames,
    kind,
    dates,
    days: days.rows,
    daysLoading: days.loading || people.loading,
    absenceTypes,
    holidays,
    rows,
    edit: (values: Record<string, unknown>, onSuccess?: () => void) =>
      update.mutate({ guid, values }, { onSuccess: () => onSuccess?.() }),
  };
}

/**
 * «1 из 18» и стрелки страницы табеля: место среди всех табелей, новые
 * месяцы сверху, внутри месяца — по названию. Края не замыкаются:
 * у первого нет «назад», у последнего — «вперёд», как в прототипе.
 *
 * ponytail: весь список ради соседей; табелей — отделы × месяцы, сотни.
 */
export function useTimesheetNeighbours(guid: string) {
  const { page } = useItems(TIMESHEETS, {
    limit: MAX_LIMIT,
    page: 1,
    relations: false,
  });
  /*
   * Порядок — здесь, а не сортировкой запроса: вторая сортировка бэкенда
   * нестабильна, и после правки табель прыгал с «3 из 52» на «29 из 52».
   */
  const ids = [...page.rows]
    .sort((a, b) => text(b.period).localeCompare(text(a.period)) || text(a.title).localeCompare(text(b.title)) || text(a.guid).localeCompare(text(b.guid)))
    .map((row) => text(row.guid));
  const at = ids.indexOf(guid);
  if (at < 0) return null;
  return { index: at + 1, total: ids.length, prev: ids[at - 1], next: ids[at + 1] };
}
