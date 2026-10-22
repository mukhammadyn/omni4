import { useMemo } from "react";
import { useCreateItem, useDeleteItems, useUpdateItem, type Item } from "@/features/item";
import { daysOffBy, MARKS, UZ_HOLIDAYS, wholeYears, type HolidayRow, type Mark } from "../model/holiday";
import { firstText, text } from "./org";
import { useAll } from "./timesheet";

const HOLIDAYS = "hr_holidays";
/** 29 февраля, скопированное в невисокосный год, — не дата. */
const isDate = (date: string) => new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);

export type DayMark = { id: string; date: string; name: string; type: Mark };
/** Календарь = год + филиал (пустой — вся компания); см. model/holiday. */
export type HolidayCalendar = { key: string; year: number; locationId: string; marks: Map<string, DayMark> };

const toRow = (row: Item): HolidayRow => ({
  date: text(row.date).slice(0, 10),
  name: text(row.name),
  type: firstText(row.type) as Mark,
  locationId: text(row.hr_locations_id),
});

/**
 * Нерабочие дни периода по филиалу сотрудника (`daysOffBy`): табель
 * и график. Строки — за целые годы периода.
 */
export function useDaysOff(from: string, to: string) {
  const [start, end] = wholeYears(from, to);
  const query = useAll(from && to ? HOLIDAYS : undefined, { date: { op: "between", values: [start, end] } }, false);
  const of = useMemo(() => daysOffBy(query.rows.map(toRow).filter((r) => r.date && MARKS.includes(r.type))), [query.rows]);
  return { of, loading: query.loading, fetching: query.fetching };
}

export const calendarKey = (year: number, locationId: string) => `${year}:${locationId}`;

export function useHolidayCalendars() {
  const rows = useAll(HOLIDAYS, {}, false);
  const locations = useAll("hr_locations", {}, false);
  const create = useCreateItem(HOLIDAYS);
  const update = useUpdateItem(HOLIDAYS);
  const remove = useDeleteItems(HOLIDAYS);

  const calendars = useMemo(() => {
    const byKey = new Map<string, HolidayCalendar>();
    for (const row of rows.rows) {
      const { date, name, type, locationId } = toRow(row);
      if (!date || !MARKS.includes(type)) continue;
      const year = Number(date.slice(0, 4));
      const key = calendarKey(year, locationId);
      const cal = byKey.get(key) ?? { key, year, locationId, marks: new Map() };
      cal.marks.set(date, { id: text(row.guid), date, name, type });
      byKey.set(key, cal);
    }
    return byKey;
  }, [rows.rows]);

  const locationNames = useMemo(() => new Map(locations.rows.map((row) => [text(row.guid), text(row.name)])), [locations.rows]);

  const add = (locationId: string, date: string, type: Mark, name: string) =>
    create.mutateAsync({ guid: crypto.randomUUID(), date, type, name, hr_locations_id: locationId || null });

  return {
    calendars,
    locations: locationNames,
    loading: rows.loading || locations.loading,
    /**
     * Запись идёт или данные ещё не перечитаны: второе нажатие на тот же день
     * не видит первой строки и заводит вторую.
     */
    busy: create.isPending || update.isPending || remove.isPending || rows.fetching,
    /** Отметить день; уже отмеченный — сменить вид и название. */
    mark: (cal: { locationId: string; marks: Map<string, DayMark> }, date: string, type: Mark, name: string) => {
      const was = cal.marks.get(date);
      return was ? update.mutateAsync({ guid: was.id, values: { type, name } }) : add(cal.locationId, date, type, name);
    },
    clear: (ids: string[]) => remove.mutateAsync(ids),
    /**
     * Новый календарь: гос. праздники года или праздники другого календаря,
     * сдвинутые на этот год (переносы не копируются — у каждого года свои).
     * Пустого нет: календарь — это его строки, без них его не видно в списке.
     */
    fill: async (year: number, locationId: string, from: "uz" | HolidayCalendar) => {
      const days: [string, string][] =
        from === "uz"
          ? UZ_HOLIDAYS.map(([md, name]) => [`${year}-${md}`, name])
          : [...from.marks.values()].filter((m) => m.type === "holiday").map((m) => [`${year}${m.date.slice(4)}`, m.name]);
      // ponytail: по строке за запрос; партии в 8–15 дней хватает.
      for (const [date, name] of days) if (isDate(date)) await add(locationId, date, "holiday", name);
    },
  };
}
