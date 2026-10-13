import { ME, type Filters } from "@/features/item";

/**
 * Общий фильтр дашборда (ADR-0013, «Фильтры»). Объявлен на дашборде,
 * а каким полем на него отвечать — решает каждый виджет (`Answer`).
 *
 * «Запись таблицы» объявляется полем-связью какой-нибудь таблицы
 * (`crm_deals.employees_id` → «Менеджер»): из этого поля чип берёт
 * подпись записей и выбор строк, как у фильтра таблицы. Сам фильтр —
 * про записи `table`, а не про это поле.
 */
export type DashFilter =
  | { kind: "period"; label: string }
  | { kind: "record"; label: string; table: string; sourceTable: string; sourceField: string };

/**
 * Каким полем виджет отвечает на фильтр. `via` — поле справочника:
 * «Филиал» для сделок — `employees_id` → `employees.locations_id`.
 */
export type Answer = { field: string; via?: string };

/**
 * Значения фильтров в адресе по ключу фильтра. Ключ — не id, а смысл
 * («period», слаг таблицы): одинаковый фильтр соседней вкладки берёт
 * то же значение.
 */
export type FilterValues = Record<string, string[]>;

export function filterKey(filter: DashFilter): string {
  return filter.kind === "period" ? "period" : filter.table;
}

export const PRESETS = ["today", "week", "month", "quarter", "year"] as const;
export type Preset = (typeof PRESETS)[number];

/** Свой диапазон: ["custom", "2026-10-01", "2026-10-05"]. */
export const CUSTOM = "custom";

export type Range = { from: Date; to: Date };

/**
 * Значение «Периода» → отрезок и отрезок для сравнения (дни включительно).
 *
 * Готовый период — от начала единицы до сегодня; сравнение — с тем же
 * числом дней от начала прошлой единицы (1–5 октября против 1–5 сентября).
 * Свой диапазон сравнивается с отрезком той же длины прямо перед ним.
 *
 * ponytail: границы — в поясе браузера, как у фильтра таблицы; пояс
 * проекта — когда его начнут читать из настроек.
 */
export function periodRange(value: string[] | undefined, today = new Date()): { range: Range; previous: Range } | null {
  const [head, from, to] = value ?? [];

  if (head === CUSTOM) {
    const start = parseDay(from);
    const end = parseDay(to);
    if (!start || !end || end < start) return null;
    const days = dayDiff(start, end) + 1;
    return { range: { from: start, to: end }, previous: { from: addDays(start, -days), to: addDays(start, -1) } };
  }

  if (!PRESETS.includes(head as Preset)) return null;

  const end = day(today);
  const start = unitStart(head as Preset, end);
  const prevStart = unitStart(head as Preset, addDays(start, -1));
  // 31 октября против сентября — до 30 сентября, а не 1 октября.
  const prevEnd = new Date(Math.min(+addDays(prevStart, dayDiff(start, end)), +addDays(start, -1)));
  return { range: { from: start, to: end }, previous: { from: prevStart, to: prevEnd } };
}

/** Отрезок → условие `between` в том виде, в каком его шлёт фильтр таблицы. */
export function rangeValues(range: Range): string[] {
  return [dayKey(range.from), `${dayKey(range.to)}T23:59:59.999`];
}

/**
 * Отбор виджета: свой плюс общие фильтры, через «И».
 *
 * `viaGuids` — уже выбранные guid строк справочника по ключу фильтра
 * (`useViaGuids`). `me` — своя строка по таблице фильтра; нет её — «Я»
 * не находит ничего, а не всё.
 *
 * ponytail: общий фильтр по полю, на котором есть и свой отбор,
 * заменяет свой — пересечь два списка guid можно, когда понадобится.
 */
export function widgetFilters(
  own: Filters,
  answers: Record<string, Answer>,
  filters: DashFilter[],
  values: FilterValues,
  viaGuids: Record<string, string[]>,
  me: (table: string) => string,
  /** Отбор прошлого периода — для сравнения у KPI. */
  previous = false,
): Filters {
  const result: Filters = { ...own };
  /** Списки guid, уже поставленные общими фильтрами, по полю. */
  const shared = new Map<string, string[]>();

  for (const filter of filters) {
    const key = filterKey(filter);
    const answer = answers[key];
    const value = values[key];
    if (!answer?.field || !value?.length) continue;

    if (filter.kind === "period") {
      const period = periodRange(value);
      if (period) {
        result[answer.field] = { op: "between", values: rangeValues(previous ? period.previous : period.range) };
      }
      continue;
    }

    let guids = answer.via ? viaGuids[key] : value.map((guid) => (guid === ME ? me(filter.table) : guid));
    if (!guids) continue;
    // «Менеджер» и «Филиал» у сделок отвечают одним `employees_id` — через «И».
    const earlier = shared.get(answer.field);
    if (earlier) guids = guids.filter((guid) => earlier.includes(guid));
    shared.set(answer.field, guids);
    // Пустой список — ничего не нашлось, а не «все».
    result[answer.field] = { op: "is", values: guids.length ? guids : [NOBODY] };
  }

  return result;
}

/** Строки с таким guid нет: отбор по нему находит ничего. */
export const NOBODY = "00000000-0000-0000-0000-000000000000";

/** Фильтр задан, а виджет на него не отвечает — карточка говорит об этом. */
export function unanswered(filters: DashFilter[], answers: Record<string, Answer>, values: FilterValues): DashFilter[] {
  return filters.filter((filter) => {
    const key = filterKey(filter);
    return Boolean(values[key]?.length) && !answers[key]?.field;
  });
}

function unitStart(unit: Preset, date: Date): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  switch (unit) {
    case "today":
      return day(date);
    case "week":
      // Неделя с понедельника.
      return addDays(day(date), -((date.getDay() + 6) % 7));
    case "month":
      return new Date(y, m, 1);
    case "quarter":
      return new Date(y, m - (m % 3), 1);
    case "year":
      return new Date(y, 0, 1);
  }
}

function day(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Через UTC: в день перевода часов сутки не 24 часа. */
function dayDiff(from: Date, to: Date): number {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

function parseDay(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
