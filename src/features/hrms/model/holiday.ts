/**
 * Производственный календарь — `hcRoot` прототипа (settings.html#hr-holidays).
 * Своей таблицы у календаря нет: это строки `hr_holidays` одного года и одного
 * филиала (без филиала — «Вся компания»). Строка — отклонение дня от обычной
 * недели; всё остальное — пн–пт рабочие, сб–вс выходные.
 */
export type Mark = "holiday" | "working_weekend" | "extra_day_off";
export type DayKind = Mark | "workday" | "weekend";
export const MARKS: readonly Mark[] = ["holiday", "working_weekend", "extra_day_off"];

/** Часов в рабочем дне — как в прототипе; сокращённых предпраздничных нет. */
export const DAY_HOURS = 8;

export const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** День недели 0 = пн … 6 = вс; дата без часового пояса. */
export const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export const dayKind = (date: string, marks: ReadonlyMap<string, { type: Mark }>): DayKind =>
  marks.get(date)?.type ?? (weekday(date) > 4 ? "weekend" : "workday");

export const isWorking = (kind: DayKind) => kind === "workday" || kind === "working_weekend";

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function yearStats(year: number, marks: ReadonlyMap<string, { type: Mark }>) {
  let work = 0;
  let off = 0;
  for (let m = 0; m < 12; m++)
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      if (isWorking(dayKind(iso(year, m, d), marks))) work++;
      else off++;
    }
  const count = (type: Mark) => [...marks.values()].filter((x) => x.type === type).length;
  return { work, hours: work * DAY_HOURS, off, holidays: count("holiday"), transfers: count("working_weekend") };
}

/**
 * Государственные праздники Узбекистана с фиксированной датой. Хайиты
 * (Рамазан, Курбан) по лунному календарю и переносы объявляет постановление
 * на каждый год — их отмечают руками.
 */
export const UZ_HOLIDAYS: readonly [string, string][] = [
  ["01-01", "Новый год"],
  ["01-14", "День защитников Родины"],
  ["03-08", "Международный женский день"],
  ["03-21", "Навруз"],
  ["05-09", "День памяти и почестей"],
  ["09-01", "День независимости"],
  ["10-01", "День учителя и наставника"],
  ["12-08", "День Конституции"],
];

export type HolidayRow = { date: string; name: string; type: Mark; locationId: string };

/**
 * Нерабочие дни (праздник, доп. выходной) по филиалу: календарь филиала
 * на год (хоть одна его строка в этом году) заменяет общий целиком.
 * Строки нужны за целые годы — по куску года не понять, есть ли календарь.
 */
export function daysOffBy(rows: readonly HolidayRow[]): (locationId: string) => ReadonlyMap<string, string> {
  const own = new Set(rows.filter((r) => r.locationId).map((r) => `${r.date.slice(0, 4)}:${r.locationId}`));
  const cache = new Map<string, Map<string, string>>();
  return (locationId) => {
    let days = cache.get(locationId);
    if (!days) {
      days = new Map();
      for (const r of rows) {
        const calendar = own.has(`${r.date.slice(0, 4)}:${locationId}`) ? locationId : "";
        if (r.locationId === calendar && r.type !== "working_weekend") days.set(r.date, r.name);
      }
      cache.set(locationId, days);
    }
    return days;
  };
}

/** Период, расширенный до целых лет, — для `daysOffBy`. */
export const wholeYears = (from: string, to: string): [string, string] => [`${from.slice(0, 4)}-01-01`, `${to.slice(0, 4)}-12-31`];
