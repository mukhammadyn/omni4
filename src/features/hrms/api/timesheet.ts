import { useEffect, useMemo } from "react";
import { MAX_LIMIT, useItems, type Filters, type Item } from "@/features/item";
import { toDateValue, wallClock } from "@/shared/lib/date-value";
import { plusDays, type AttendanceDay, type Leave, type RowInput } from "../model/timesheet";
import { EMPLOYEES } from "./employee";
import { related, text } from "./org";

/** Табель — дни посещаемости, посчитанные сервером (`ucode/erp/erp.dbml`). */
export const ATTENDANCE_DAYS = "hr_attendance_days";
export const ATTENDANCE_EVENTS = "hr_attendance_events";
export const REQUESTS = "hr_requests";

/*
 * Отметки записаны ташкентскими часами с суффиксом `Z` — это ошибка записи,
 * а не наша (docs/backend-notes.md, «Посещаемость: местное время записано
 * как UTC»). Поэтому читаем их как время без пояса, а не в поясе
 * пользователя. Запись исправят — вернуть "datetime".
 */
const MARK_KIND = "datetime_naive";

/** «ЧЧ:ММ» отметки. */
export const markClock = (value: string) => {
  const parsed = toDateValue(value, MARK_KIND);
  if (!parsed) return "";
  const { hour, minute } = wallClock(parsed);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const markMinutes = (value: string) => {
  const parsed = toDateValue(value, MARK_KIND);
  if (!parsed) return null;
  const { hour, minute } = wallClock(parsed);
  return hour * 60 + minute;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Все строки по отбору, порциями по MAX_LIMIT. Месяц табеля — это
 * сотрудники × дни, и в июне их уже было больше одной порции.
 */
function useAll(tableSlug: string | undefined, filters: Filters, search = "") {
  const query = useItems(tableSlug, { limit: MAX_LIMIT, page: 1, infinite: true, filters, search });
  const { hasMore, loadMore } = query;
  useEffect(() => {
    if (hasMore) loadMore();
  }, [hasMore, loadMore]);
  return { rows: query.page.rows, loading: query.isLoading || hasMore || query.loadingMore, fetching: query.isFetching };
}

export type SheetEmployee = {
  id: string;
  name: string;
  photo: string;
  position: string;
  hireDate: string;
  dismissalDate: string;
};

const toEmployee = (row: Item): SheetEmployee => ({
  id: text(row.guid),
  name: text(row.full_name) || [text(row.last_name), text(row.first_name)].filter(Boolean).join(" ") || "—",
  photo: text(row.photo),
  position: text(related(row, "positions_id").name),
  hireDate: text(row.hire_date).slice(0, 10),
  dismissalDate: text(row.dismissal_date).slice(0, 10),
});

export const toAttendanceDay = (row: Item): AttendanceDay => ({
  id: text(row.guid),
  date: text(row.date).slice(0, 10),
  status: text(row.status),
  review: text(row.review),
  firstIn: text(row.first_in),
  lastOut: text(row.last_out),
  workedMinutes: num(row.worked_minutes),
  lateMinutes: num(row.late_minutes) ?? 0,
  requestId: text(row.hr_requests_id),
  comment: text(row.comment),
});

/** Заявка на отсутствие; отклонённые и отменённые табелю не нужны. */
const toLeave = (row: Item): Leave | null => {
  const status = text(row.status);
  if (text(row.type) !== "absence" || (status !== "approved" && status !== "pending")) return null;
  const from = text(row.date_from).slice(0, 10);
  if (!from) return null;
  const kind = related(row, "hr_absence_types_id");
  return {
    id: text(row.guid),
    title: text(kind.name),
    code: text(kind.code),
    icon: text(kind.icon),
    color: text(kind.color),
    status,
    from,
    to: text(row.date_to).slice(0, 10) || from,
  };
};

export type Timesheet = {
  employees: SheetEmployee[];
  /** Вход строки табеля по сотруднику. */
  inputOf: (employee: SheetEmployee) => RowInput;
  /** Типы отсутствий — для обозначений. */
  absenceTypes: { title: string; code: string; icon: string; color: string }[];
  loading: boolean;
  fetching: boolean;
};

/**
 * Всё, из чего строится табель за период: сотрудники, их дни, смены
 * (норма), заявки на отсутствие и праздники. Каждая таблица — одним
 * запросом на весь период, а не по сотруднику.
 */
export function useTimesheet({
  from,
  to,
  dates,
  today,
  search,
  employeeId,
}: {
  from: string;
  to: string;
  dates: string[];
  today: string;
  search: string;
  /** Один сотрудник — вкладка «Посещаемость» его страницы. */
  employeeId?: string;
}): Timesheet {
  const one: Filters = employeeId ? { employees_id: { op: "any", values: [employeeId] } } : {};
  const range: Filters = { ...one, date: { op: "between", values: [from, to] } };
  // ponytail: сотрудники одной порцией MAX_LIMIT и без подгрузки строк;
  // при тысячах людей — прокрутка порциями, как в HRMS.
  const people = useAll(EMPLOYEES, employeeId ? { guid: { op: "any", values: [employeeId] } } : {}, search);
  const days = useAll(ATTENDANCE_DAYS, range);
  const shifts = useAll("hr_shifts", range);
  const requests = useAll(REQUESTS, {
    ...one,
    date_from: { op: "before", values: [plusDays(to, 1)] },
    date_to: { op: "after", values: [plusDays(from, -1)] },
  });
  const types = useAll("hr_absence_types", {});
  const holidays = useAll("hr_holidays", range);

  const loading = people.loading || days.loading || shifts.loading || requests.loading || types.loading;
  const fetching = people.fetching || days.fetching || shifts.fetching || requests.fetching;

  return useMemo(() => {
    // Принятые после периода и уволенные до него в нём не работали.
    const employees = people.rows
      .map(toEmployee)
      .filter((e) => (!e.hireDate || e.hireDate <= to) && (!e.dismissalDate || e.dismissalDate >= from))
      .sort((a, b) => a.name.localeCompare(b.name));

    const dayIndex = new Map<string, Map<string, AttendanceDay>>();
    for (const row of days.rows) {
      const day = toAttendanceDay(row);
      const employee = text(row.employees_id);
      const byDate = dayIndex.get(employee) ?? new Map<string, AttendanceDay>();
      byDate.set(day.date, day);
      dayIndex.set(employee, byDate);
    }

    const planIndex = new Map<string, Map<string, number>>();
    for (const row of shifts.rows) {
      const employee = text(row.employees_id);
      const date = text(row.date).slice(0, 10);
      const byDate = planIndex.get(employee) ?? new Map<string, number>();
      byDate.set(date, (byDate.get(date) ?? 0) + (num(row.planned_minutes) ?? 0));
      planIndex.set(employee, byDate);
    }

    const leaveIndex = new Map<string, Leave[]>();
    for (const row of requests.rows) {
      const leave = toLeave(row);
      if (!leave) continue;
      const employee = text(row.employees_id);
      leaveIndex.set(employee, [...(leaveIndex.get(employee) ?? []), leave]);
    }

    // ponytail: праздник общий на всех; у `hr_holidays` есть `locations_id`,
    // делить по филиалам — когда праздники филиалов разойдутся.
    const holidayIndex = new Map(
      holidays.rows
        .filter((row) => text(row.type) !== "working_weekend")
        .map((row) => [text(row.date).slice(0, 10), text(row.name)]),
    );

    return {
      employees,
      inputOf: (employee) => ({
        dates,
        today,
        hireDate: employee.hireDate,
        dismissalDate: employee.dismissalDate,
        planByDate: planIndex.get(employee.id) ?? new Map(),
        dayByDate: dayIndex.get(employee.id) ?? new Map(),
        leaves: leaveIndex.get(employee.id) ?? [],
        holidays: holidayIndex,
      }),
      absenceTypes: types.rows
        .filter((row) => row.is_active !== false)
        .map((row) => ({ title: text(row.name), code: text(row.code), icon: text(row.icon), color: text(row.color) })),
      loading,
      fetching,
    };
  }, [people.rows, days.rows, shifts.rows, requests.rows, types.rows, holidays.rows, from, to, dates, today, loading, fetching]);
}

/** Отметки сотрудника за день — окну дня. */
export function useDayEvents(employeeId: string, date: string) {
  const query = useItems(ATTENDANCE_EVENTS, {
    limit: 100,
    page: 1,
    filters: { employees_id: { op: "any", values: [employeeId] }, date: { op: "between", values: [date, date] } },
    sorts: [{ field: "occurred_at", direction: "asc" }],
  });
  return { rows: query.page.rows, loading: query.isLoading };
}

/** Отметки дня сотрудника, сведённые для строки списка. */
export type DayMarks = {
  /** Вариант `source` первой отметки дня. */
  source: string;
  photos: { url: string; in: boolean; at: string }[];
  /** Самая дальняя отметка от филиала, метры; null — нет геометки. */
  distance: number | null;
};

/**
 * Отметки строк одной страницы списка — одним запросом на их сотрудников
 * и даты, а не по строке. Даты — страницы, а не периода: за месяц у двадцати
 * человек отметок больше одной порции.
 */
export function useDayMarks(employeeIds: string[], from: string, to: string): Map<string, DayMarks> {
  const query = useItems(employeeIds.length ? ATTENDANCE_EVENTS : undefined, {
    limit: MAX_LIMIT,
    page: 1,
    filters: { employees_id: { op: "any", values: employeeIds }, date: { op: "between", values: [from, to] } },
    sorts: [{ field: "occurred_at", direction: "asc" }],
  });
  return useMemo(() => {
    const marks = new Map<string, DayMarks>();
    for (const row of query.page.rows) {
      const key = `${text(row.employees_id)}|${text(row.date).slice(0, 10)}`;
      const day = marks.get(key) ?? { source: text(row.source), photos: [], distance: null };
      const photo = text(row.photo);
      if (photo) day.photos.push({ url: photo, in: text(row.direction) === "in", at: text(row.occurred_at) });
      const distance = num(row.distance_m);
      if (distance != null) day.distance = Math.max(day.distance ?? 0, distance);
      marks.set(key, day);
    }
    return marks;
  }, [query.page.rows]);
}
