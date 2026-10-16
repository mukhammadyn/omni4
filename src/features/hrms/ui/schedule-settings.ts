import { useUi } from "@/shared/lib/ui-store";

/**
 * Настройки календаря графика одного человека — по view, в ui-store.
 * Их читают экран (ScheduleCalendar) и его кнопки в строке вкладок
 * (ScheduleTools). Ключ свой, а не `viewId`: под ним период
 * (attendance-parts, usePeriod), и он пишется целиком.
 */

/** Группировки — `GRPS` прототипа; бизнес-юнита и региона у сотрудника нет. */
// Шаблон — только отбор: группировать по нему не нужно.
export const SCHEDULE_GROUPS = ["none", "dept", "location"] as const;
export type ScheduleGroup = (typeof SCHEDULE_GROUPS)[number];
/** Отборы — `SCHF` прототипа, кроме типа смены: он счётчиками над сеткой. */
export const SCHEDULE_FILTERS = ["dept", "location", "template"] as const;
export type ScheduleFilter = (typeof SCHEDULE_FILTERS)[number];
export type ScheduleAxis = "employee" | "position";

type Saved = { group: ScheduleGroup; axis: ScheduleAxis; only: Partial<Record<ScheduleFilter, string[]>> };

function read(value: unknown): Saved {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const only = raw.only && typeof raw.only === "object" ? (raw.only as Record<string, unknown>) : {};
  return {
    group: SCHEDULE_GROUPS.includes(raw.group as ScheduleGroup) ? (raw.group as ScheduleGroup) : "none",
    axis: raw.axis === "position" ? "position" : "employee",
    only: Object.fromEntries(
      SCHEDULE_FILTERS.map((key) => [key, Array.isArray(only[key]) ? (only[key] as unknown[]).filter((v) => typeof v === "string") : []]),
    ),
  };
}

export function useScheduleSettings(viewId: string) {
  const key = `${viewId}:schedule`;
  const saved = read(useUi((s) => s.viewState[key]));
  const setViewState = useUi((s) => s.setViewState);
  const remember = (next: Partial<Saved>) => setViewState(key, { ...saved, ...next });
  const values = (filter: ScheduleFilter) => saved.only[filter] ?? [];

  return {
    ...saved,
    values,
    active: SCHEDULE_FILTERS.reduce((sum, filter) => sum + values(filter).length, 0),
    setGroup: (group: ScheduleGroup) => remember({ group }),
    setAxis: (axis: ScheduleAxis) => remember({ axis }),
    toggle: (filter: ScheduleFilter, value: string) => {
      const list = values(filter);
      remember({ only: { ...saved.only, [filter]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } });
    },
    clear: () => remember({ only: {} }),
  };
}
