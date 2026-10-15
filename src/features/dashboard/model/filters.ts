import { ME, isFilterSet, type Filter, type Filters } from "@/features/item";
import { nowLocal, zonedToInstant } from "@/shared/lib/date-value";

/**
 * Общий фильтр дашборда (ADR-0013, «Фильтры»). Объявлен на дашборде,
 * а каким полем на него отвечать — решает каждый виджет (`Answer`).
 *
 * «Запись таблицы» объявляется полем-связью какой-нибудь таблицы
 * (`crm_deals.core_users_id` → «Менеджер»): из этого поля чип берёт
 * подпись записей и выбор строк, как у фильтра таблицы. Сам фильтр —
 * про записи `table`, а не про это поле.
 */
export type DashFilter =
  | { kind: "period"; label: string }
  | { kind: "record"; label: string; table: string; sourceTable: string; sourceField: string };

/**
 * Каким полем виджет отвечает на фильтр. `via` — поле справочника:
 * «Отдел» для сделок — `core_users_id` → `core_users.hr_departments_id`.
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
export function periodRange(value: string[] | undefined, today = nowLocal()): { range: Range; previous: Range } | null {
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
export function rangeValues(range: Range, timestamp = false): string[] {
  if (timestamp) {
    const instant = (date: Date) => zonedToInstant({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: 0, minute: 0 });
    return [instant(range.from).toISOString(), new Date(+instant(addDays(range.to, 1)) - 1).toISOString()];
  }
  return [dayKey(range.from), `${dayKey(range.to)}T23:59:59.999`];
}

/**
 * Отбор виджета: свой плюс общие фильтры, через «И».
 *
 * `viaGuids` — уже выбранные guid строк справочника по ключу фильтра
 * (`useViaGuids`). `me` — своя строка по таблице фильтра; нет её — «Я»
 * не находит ничего, а не всё.
 *
 * Same-field conditions are intersected; unsupported combinations are
 * reported rather than silently widening the scope.
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
  timestampFields: ReadonlySet<string> = new Set(),
): Filters {
  let result: Filters = { ...own };
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
        result = mergeFilters(result, { [answer.field]: { op: "between", values: rangeValues(previous ? period.previous : period.range, timestampFields.has(answer.field)) } });
      }
      continue;
    }

    let guids = answer.via ? viaGuids[key] : value.map((guid) => (guid === ME ? me(filter.table) : guid));
    if (!guids) continue;
    // «Менеджер» и «Отдел» у сделок отвечают одним `core_users_id` — через «И».
    const earlier = shared.get(answer.field);
    if (earlier) guids = guids.filter((guid) => earlier.includes(guid));
    shared.set(answer.field, guids);
    // Пустой список — ничего не нашлось, а не «все».
    result = mergeFilters(result, { [answer.field]: { op: "is", values: guids.length ? guids : [NOBODY] } });
  }

  return result;
}

/** Строки с таким guid нет: отбор по нему находит ничего. */
export const NOBODY = "00000000-0000-0000-0000-000000000000";

/** AND without relying on an unsupported `$and`/`$in` server contract. */
export function mergeFilters(...sources: Filters[]): Filters {
  const result: Filters = {};
  for (const source of sources) {
    for (const [field, next] of Object.entries(source)) {
      if (!isFilterSet(next)) continue;
      const current = result[field];
      if (!current) { result[field] = next; continue; }
      const combined = intersectFilter(current, next);
      if (combined === null) return { guid: { op: "is", values: [NOBODY] } };
      result[field] = combined;
    }
  }
  return result;
}

function compare(a: string, b: string): number {
  return a.trim() && b.trim() && Number.isFinite(Number(a)) && Number.isFinite(Number(b))
    ? Number(a) - Number(b) : a.localeCompare(b);
}

type Bound = { value: string; strict: boolean };
function bounds(filter: Filter): { lower?: Bound; upper?: Bound } | null {
  if (filter.bounds) {
    const b = filter.bounds;
    return { ...(b.$gt || b.$gte ? { lower: { value: b.$gt ?? b.$gte!, strict: Boolean(b.$gt) } } : {}), ...(b.$lt || b.$lte ? { upper: { value: b.$lt ?? b.$lte!, strict: Boolean(b.$lt) } } : {}) };
  }
  if (filter.op === "between") return {
    ...(filter.values[0] ? { lower: { value: filter.values[0], strict: false } } : {}),
    ...(filter.values[1] ? { upper: { value: filter.values[1], strict: false } } : {}),
  };
  if (filter.op === "after") return { lower: { value: filter.values[0]!, strict: true } };
  if (filter.op === "before") return { upper: { value: filter.values[0]!, strict: true } };
  return null;
}

export function intersectFilter(a: Filter, b: Filter): Filter | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  if (a.op === "is" && b.op === "is") {
    const values = a.values.filter((v) => b.values.includes(v));
    return values.length ? { op: "is", values } : null;
  }
  if (a.op === "equals" && b.op === "equals") return null;
  const left = bounds(a), right = bounds(b);
  if (left && right) {
    const choose = (x: Bound | undefined, y: Bound | undefined, lower: boolean) => {
      if (!x) return y; if (!y) return x;
      const c = compare(x.value, y.value);
      if (!c) return { value: x.value, strict: x.strict || y.strict };
      return (lower ? c > 0 : c < 0) ? x : y;
    };
    const lower = choose(left.lower, right.lower, true), upper = choose(left.upper, right.upper, false);
    if (lower && upper && (compare(lower.value, upper.value) > 0 || (!compare(lower.value, upper.value) && (lower.strict || upper.strict)))) return null;
    return { op: "between", values: [lower?.value ?? "", upper?.value ?? ""], bounds: {
      ...(lower ? { [lower.strict ? "$gt" : "$gte"]: lower.value } : {}),
      ...(upper ? { [upper.strict ? "$lt" : "$lte"]: upper.value } : {}),
    } };
  }
  // Distinct regex/set conditions cannot be expressed faithfully by get-list.
  // Blocking is preferable to silently dropping a saved or viewer constraint.
  throw new Error("dashboard.filterConflict");
}

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
