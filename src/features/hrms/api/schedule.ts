import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Item } from "@/features/item";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { SHIFT_KINDS, WEEKDAYS, type Shift, type ShiftDraft, type ShiftKind, type Template } from "../model/schedule";
import { EMPLOYEES } from "./employee";
import { text, toPerson, type Person } from "./org";
import { useAll } from "./timesheet";

/** График работы: смены, шаблоны и их дни (`ucode/erp/erp.dbml`). */
export const SHIFTS = "hr_shifts";
export const WORK_SCHEDULES = "hr_work_schedules";
export const WORK_SCHEDULE_DAYS = "hr_work_schedule_days";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const kindOf = (value: unknown): ShiftKind => (SHIFT_KINDS as readonly unknown[]).includes(value) ? (value as ShiftKind) : "day";
/** TIME приходит «ЧЧ:ММ» или «ЧЧ:ММ:СС». */
const clock = (value: unknown) => text(value).slice(0, 5);

export const toShift = (row: Item): Shift => ({
  id: text(row.guid),
  employeeId: text(row.employees_id),
  date: text(row.date).slice(0, 10),
  start: clock(row.start_time),
  end: clock(row.end_time),
  breakMinutes: num(row.break_minutes),
  plannedMinutes: num(row.planned_minutes),
  kind: kindOf(row.shift_kind),
  seriesId: text(row.series_id),
  templateId: text(row.hr_work_schedules_id),
  locationId: text(row.locations_id),
  positionId: text(row.positions_id),
  projectId: text(row.pm_projects_id),
  comment: text(row.comment),
});

/*
 * Строка для upsert-many: у каждой строки пачки — все колонки списка,
 * иначе бэкенд отвергает пачку целиком (справочник API, §4.3). Пустая
 * ссылка — null: колонка uuid пустую строку не принимает.
 */
const toRow = (draft: ShiftDraft, guid: string) => ({
  guid,
  employees_id: draft.employeeId,
  date: draft.date,
  start_time: draft.start,
  end_time: draft.end,
  break_minutes: draft.breakMinutes,
  planned_minutes: draft.plannedMinutes,
  shift_kind: draft.kind,
  series_id: draft.seriesId,
  hr_work_schedules_id: draft.templateId || null,
  locations_id: draft.locationId || null,
  positions_id: draft.positionId || null,
  pm_projects_id: draft.projectId || null,
  comment: draft.comment,
  exception_type: "none",
});

export const toTemplate = (row: Item, days: Item[]): Template => {
  const own = days.filter((day) => text(day.hr_work_schedules_id) === text(row.guid));
  return {
    id: text(row.guid),
    name: text(row.name),
    color: text(row.color),
    type: row.type === "cycle" ? "cycle" : "weekly",
    breakMinutes: num(row.break_minutes),
    graceMinutes: num(row.grace_minutes),
    description: text(row.description),
    active: row.is_active !== false,
    days: WEEKDAYS.map((weekday) => {
      const day = own.find((item) => item.weekday === weekday);
      return {
        working: day?.is_working === true,
        start: clock(day?.start_time) || "09:00",
        end: clock(day?.end_time) || "18:00",
        kind: kindOf(day?.shift_kind),
      };
    }),
    cycle: {
      work: num(row.cycle_work_days) || 2,
      off: num(row.cycle_off_days) || 2,
      start: clock(row.cycle_start_time) || "08:00",
      end: clock(row.cycle_end_time) || "20:00",
      kind: kindOf(row.cycle_shift_kind),
    },
  };
};

/** Шаблоны с днями. */
export function useTemplates() {
  const templates = useAll(WORK_SCHEDULES, {}, false);
  const days = useAll(WORK_SCHEDULE_DAYS, {}, false);
  const list = useMemo(
    () => templates.rows.map((row) => toTemplate(row, days.rows)).sort((a, b) => a.name.localeCompare(b.name)),
    [templates.rows, days.rows],
  );
  return { templates: list, loading: templates.loading || days.loading };
}

export type ScheduleEmployee = Person & { positionId: string; templateId: string };

/**
 * Всё, из чего рисуется график за период: сотрудники, их смены, шаблоны
 * и праздники. Смены — одним запросом на период, как у табеля.
 */
export function useSchedule({ from, to, employeeId }: { from: string; to: string; employeeId?: string }) {
  const one = employeeId ? { employees_id: { op: "any" as const, values: [employeeId] } } : {};
  const people = useAll(EMPLOYEES, employeeId ? { guid: { op: "any", values: [employeeId] } } : {});
  const shifts = useAll(SHIFTS, { ...one, date: { op: "between", values: [from, to] } }, false);
  const holidays = useAll("hr_holidays", { date: { op: "between", values: [from, to] } }, false);
  const { templates, loading: templatesLoading } = useTemplates();

  return useMemo(
    () => ({
      employees: people.rows
        .map((row): ScheduleEmployee => ({
          ...toPerson(row),
          positionId: text(row.positions_id),
          templateId: text(row.hr_work_schedules_id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      shifts: shifts.rows.map(toShift),
      templates,
      // ponytail: праздник общий на всех, как в табеле (api/timesheet).
      holidays: new Map(
        holidays.rows
          .filter((row) => text(row.type) !== "working_weekend")
          .map((row) => [text(row.date).slice(0, 10), text(row.name)]),
      ),
      loading: people.loading || shifts.loading || holidays.loading || templatesLoading,
      fetching: shifts.fetching,
    }),
    [people.rows, shifts.rows, holidays.rows, templates, people.loading, shifts.loading, holidays.loading, templatesLoading, shifts.fetching],
  );
}

/** Смены серии целиком, за любой период — открыть её на правку. */
export function useSeries(seriesId: string) {
  const query = useAll(seriesId ? SHIFTS : undefined, { series_id: { op: "any", values: [seriesId] } }, false);
  return { rows: useMemo(() => query.rows.map(toShift), [query.rows]), loading: query.loading };
}

/** Порция одной записи: год графика отдела — десятки тысяч строк. */
const CHUNK = 1000;
const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Запись графика: сначала удаляются снятые смены, потом пишутся новые
 * одним upsert-many на порцию (справочник API, §4.3) — а не POST на
 * каждый день. guid новым строкам даём сами: ответ upsert-many пуст.
 */
export function useWriteShifts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ remove, add }: { remove: string[]; add: ShiftDraft[] }) => {
      for (const ids of chunks(remove)) await api.delete<unknown>(`/v1/object/${SHIFTS}`, { data: { ids } });
      const rows = add.map((draft) => toRow(draft, crypto.randomUUID()));
      const fields = Object.keys(rows[0] ?? {});
      for (const objects of chunks(rows))
        await api.post<unknown>(`/v2/items/${SHIFTS}/upsert-many`, { data: { field_slug: "guid", fields, objects } });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.items.table(SHIFTS) }),
  });
}
