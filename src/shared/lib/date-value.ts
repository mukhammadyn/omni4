/**
 * Разбор и показ дат — одно место на всё приложение.
 *
 * Лежит в shared, потому что читателей два и они по разные стороны
 * границы фич: ячейка (features/item) и подпись связанной строки
 * (shared/lib/relation-label, её зовут и item, и table). Две копии
 * этого разбора однажды показали бы одну и ту же дату по-разному.
 *
 * В ucode три временных типа с разным смыслом:
 *
 *   DATE                          календарная дата, колонка DATE
 *   DATE_TIME                     момент времени, колонка TIMESTAMPTZ
 *   DATE_TIME_WITHOUT_TIME_ZONE   настенные часы, колонка TIMESTAMP
 *
 * Только средний из них — момент. Два других часового пояса не имеют,
 * и прогонять их через `new Date(value)` нельзя: строка «2026-01-06»
 * разбирается как полночь UTC, а в Нью-Йорке это ещё 5 января. День
 * съезжает у половины планеты и только на части значений — такую ошибку
 * ищут неделями.
 */

export type DateKind = "date" | "datetime" | "datetime_naive";

/** Дата без пояса: разбираем как текст, а не как момент времени. */
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/**
 * Тот же смысл, но задом наперёд: «24.12.2025 08:49».
 *
 * Это не причуда данных, а формат ответа. DATE_TIME_WITHOUT_TIME_ZONE
 * бэкенд отдаёт именно так (items.go: `Format(config.TimeLayoutItems)`),
 * хотя в колонке лежит обычный timestamp. Разобрать его как момент
 * времени невозможно: `new Date("24.12.2025 08:49")` — Invalid Date,
 * и без этой ветки поле показывалось бы сырой строкой.
 */
const DOTTED = /^(\d{2})\.(\d{2})\.(\d{4})(?:[T ](\d{2}):(\d{2}))?/;

export type DateValue = {
  date: Date;
  /**
   * Печатать в UTC. У значения без пояса части даты положены в Date
   * как UTC — так же их и надо читать обратно, иначе сдвиг вернётся.
   */
  naive: boolean;
};

export function toDateValue(value: unknown, kind: DateKind): DateValue | null {
  if (typeof value !== "string" || !value.trim()) return null;

  if (kind === "datetime") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : { date, naive: false };
  }

  const iso = NAIVE.exec(value);
  const dotted = iso ? null : DOTTED.exec(value);

  // Не наш вид строки — пробуем разобрать как момент. Показать значение
  // приблизительно лучше, чем не показать вовсе.
  if (!iso && !dotted) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : { date, naive: false };
  }

  const [year, month, day, hour = "00", minute = "00"] = iso
    ? iso.slice(1)
    : [dotted![3], dotted![2], dotted![1], dotted![4], dotted![5]];

  return {
    date: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))),
    naive: true,
  };
}

/**
 * Пояс, в котором человек видит и вводит моменты (DATE_TIME), —
 * [[User Timezone]] из его учётной записи; пока она не приехала или
 * пуста — пояс браузера. Один на приложение, как язык интерфейса:
 * его ставит оболочка после входа (routes/_authed) и профиль.
 *
 * Значения без пояса (DATE, DATE_TIME_WITHOUT_TIME_ZONE) он не трогает.
 */
let zone: string | undefined;

export function setTimeZone(next: string | undefined) {
  zone = next && isTimeZone(next) ? next : undefined;
}

export function timeZone(): string {
  return zone ?? browserTimeZone();
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Имя, которое Intl знает. Чужое `timeZone` роняет форматтер с RangeError. */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Части даты, которые человек ВИДИТ: год, месяц с 1, день, час, минута. */
export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

/**
 * Момент → настенные часы в поясе пользователя. У значения без пояса
 * части уже лежат в UTC (см. DateValue.naive) — их и берём.
 */
export function wallClock({ date, naive }: DateValue): WallClock {
  if (naive) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }

  return zoneParts(date, timeZone());
}

/** «Сегодня» в поясе пользователя — «ГГГГ-ММ-ДД», как пишет поле DATE. */
export function todayInput(): string {
  const { year, month, day } = zoneParts(new Date(), timeZone());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * «Сейчас» для календаря и таймлайна: они считают в местных Date,
 * у которых части — настенные часы (features/item/model/calendar).
 * Поэтому и «сейчас» — местный Date с частями пояса пользователя.
 */
export function nowLocal(): Date {
  const { year, month, day, hour, minute } = zoneParts(new Date(), timeZone());
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Обратно: настенные часы в поясе пользователя → момент.
 *
 * Смещение пояса зависит от самого момента (летнее время), поэтому
 * считается дважды: от наивной догадки и от уточнённого ответа.
 * В час перевода стрелок, которого не было, ответ уезжает на час —
 * как у любого календаря.
 */
export function zonedToInstant({ year, month, day, hour, minute }: WallClock): Date {
  const name = timeZone();
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = (time: number) => {
    const parts = zoneParts(new Date(time), name);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - time;
  };

  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneParts(date: Date, name: string): WallClock {
  let format = partFormatters.get(name);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: name,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    partFormatters.set(name, format);
  }

  const parts = Object.fromEntries(
    format.formatToParts(date).map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

/**
 * Даты форматируются по языку интерфейса. Форматтер кэшируется: Intl
 * стоит дорого, а в таблице ячейки считаются сотнями.
 *
 * Пояс — часть ключа: значение без пояса печатается в UTC, иначе браузер
 * пересчитает его в местное время и сдвинет то, что сдвигать нельзя;
 * момент — в поясе пользователя.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

export function dateFormatter(locale: string, withTime: boolean, utc: boolean): Intl.DateTimeFormat {
  const name = utc ? "UTC" : timeZone();
  const key = `${locale}:${withTime}:${name}`;
  let cached = formatters.get(key);

  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
      timeZone: name,
    });
    formatters.set(key, cached);
  }

  return cached;
}

/** Готовая подпись даты. Не разобралось — null, показывать нечего. */
export function formatDate(value: unknown, kind: DateKind, locale: string): string | null {
  const parsed = toDateValue(value, kind);
  if (!parsed) return null;

  return dateFormatter(locale, kind !== "date", parsed.naive).format(parsed.date);
}
