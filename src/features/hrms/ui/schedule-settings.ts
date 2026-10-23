import { activeFilterCount, MAX_LIMIT, useItems, type Filters, type Item } from "@/features/item";
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
type Saved = { group: ScheduleGroup; axis: ScheduleAxis; where: Filters; open: boolean; region: string };

function read(value: unknown): Saved {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    group: SCHEDULE_GROUPS.includes(raw.group as ScheduleGroup) ? (raw.group as ScheduleGroup) : "none",
    axis: raw.axis === "position" ? "position" : "employee",
    where: raw.where && typeof raw.where === "object" ? (raw.where as Filters) : {},
    open: raw.open === true,
    region: typeof raw.region === "string" ? raw.region : "",
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

/** Регион и все вложенные в него — по ссылке «Входит в» (`core_regions_id`). */
export function regionSubtree(regions: Item[], root: string): Set<string> {
  const ids = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of regions) {
      const id = String(row.guid ?? "");
      if (!ids.has(id) && ids.has(String(row.core_regions_id ?? ""))) {
        ids.add(id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Ни одна локация не подошла — отбор, которому не отвечает ни один сотрудник. */
const NOBODY = "00000000-0000-0000-0000-000000000000";

export function useScheduleSettings(viewId: string) {
  const key = `${viewId}:schedule`;
  const saved = read(useUi((s) => s.viewState[key]));
  const setViewState = useUi((s) => s.setViewState);
  const remember = (next: Partial<Saved>) => setViewState(key, { ...saved, ...next });

  /*
   * Региона у сотрудника нет — он у локации (CONTEXT, регион через локацию).
   * Выбранный регион становится отбором по локациям, лежащим в нём или глубже.
   */
  const list = { limit: MAX_LIMIT, page: 1, relations: false } as const;
  const regions = useItems(saved.region ? "core_regions" : undefined, list);
  const locations = useItems(saved.region ? "hr_locations" : undefined, list);
  const inRegion = regionSubtree(regions.page.rows, saved.region);
  const locationIds = locations.page.rows
    .filter((row) => inRegion.has(String(row.core_regions_id ?? "")))
    .map((row) => String(row.guid));
  /* Пока справочники грузятся — без региона: иначе на миг «Ничего не нашлось». */
  const ready = !regions.isLoading && !locations.isLoading;
  const where: Filters = saved.region && ready
    ? { ...saved.where, hr_locations_id: { op: "is", values: locationIds.length ? locationIds : [NOBODY] } }
    : saved.where;

  return {
    ...saved,
    /** Для запросов: полоса фильтров плюс регион. */
    where,
    /** Для полосы фильтров: только то, что в ней набрано. */
    own: saved.where,
    active: activeFilterCount(saved.where) + (saved.region ? 1 : 0),
    setGroup: (group: ScheduleGroup) => remember({ group }),
    setAxis: (axis: ScheduleAxis) => remember({ axis }),
    setWhere: (where: Filters) => remember({ where }),
    setRegion: (region: string) => remember({ region }),
    toggleOpen: () => remember({ open: !saved.open }),
  };
}
