import { activeFilterCount, type Filters } from "@/features/item";
import { useUi } from "@/shared/lib/ui-store";

/**
 * Настройки календаря графика одного человека — по view, в ui-store.
 * Их читают экран (ScheduleCalendar) и его кнопки в строке вкладок
 * (ScheduleTools, PeopleFilterBar). Ключ свой, а не `viewId`: под ним период
 * (attendance-parts, usePeriod), и он пишется целиком.
 */

/** Группировки — `GRPS` прототипа; бизнес-юнита и региона у сотрудника нет. */
// Шаблон — только отбор: группировать по нему не нужно.
export const SCHEDULE_GROUPS = ["none", "dept", "location", "position"] as const;
export type ScheduleGroup = (typeof SCHEDULE_GROUPS)[number];
export type ScheduleAxis = "employee" | "position";

/**
 * `where` — отбор сотрудников полосой фильтров, как у таблицы (FilterBar
 * по полям `hr_employees`); `open` — видна ли полоса.
 */
type Saved = { group: ScheduleGroup; axis: ScheduleAxis; where: Filters; open: boolean };

function read(value: unknown): Saved {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    group: SCHEDULE_GROUPS.includes(raw.group as ScheduleGroup) ? (raw.group as ScheduleGroup) : "none",
    axis: raw.axis === "position" ? "position" : "employee",
    where: raw.where && typeof raw.where === "object" ? (raw.where as Filters) : {},
    open: raw.open === true,
  };
}

/** Справочник → id сотрудника по группировке. */
export type GroupKeys = { departmentId: string; locationId: string; positionId: string };
const GROUP_FIELD: Record<Exclude<ScheduleGroup, "none">, keyof GroupKeys> = {
  dept: "departmentId",
  location: "locationId",
  position: "positionId",
};

/**
 * Строки по группам: крупные первыми, «—» (поле пустое) — в конце.
 * Без группировки — одна группа без подписи.
 */
export function groupRows<T>(
  rows: T[],
  group: ScheduleGroup,
  keysOf: (row: T) => GroupKeys,
  nameOf: (group: Exclude<ScheduleGroup, "none">, id: string) => string,
): { id: string; label: string; rows: T[] }[] {
  if (group === "none") return [{ id: "", label: "", rows }];
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const id = keysOf(row)[GROUP_FIELD[group]];
    buckets.set(id, [...(buckets.get(id) ?? []), row]);
  }
  return [...buckets]
    .sort(([a, x], [b, y]) => Number(!a) - Number(!b) || y.length - x.length)
    .map(([id, list]) => ({ id, label: (id && nameOf(group, id)) || "—", rows: list }));
}

export function useScheduleSettings(viewId: string) {
  const key = `${viewId}:schedule`;
  const saved = read(useUi((s) => s.viewState[key]));
  const setViewState = useUi((s) => s.setViewState);
  const remember = (next: Partial<Saved>) => setViewState(key, { ...saved, ...next });

  return {
    ...saved,
    active: activeFilterCount(saved.where),
    setGroup: (group: ScheduleGroup) => remember({ group }),
    setAxis: (axis: ScheduleAxis) => remember({ axis }),
    setWhere: (where: Filters) => remember({ where }),
    toggleOpen: () => remember({ open: !saved.open }),
  };
}
