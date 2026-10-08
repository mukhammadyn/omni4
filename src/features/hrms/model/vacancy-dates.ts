/**
 * Сроки вакансии — «Открыта N дн.» и бейдж у дедлайна, как `daysOpen`
 * и `dl()` в прототипе (vacancies.html). Даты — «ГГГГ-ММ-ДД», как их
 * пишет поле DATE; «сегодня» — в поясе пользователя (todayInput).
 */

/** Вариант STATUS `hr_vacancies.status`: закрытой сроки не грозят. */
const CLOSED = "closed";

/** За сколько дней до дедлайна предупреждать — `d<=7` прототипа. */
const SOON = 7;

const DAY = 86_400_000;

const toDay = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

/** Дней от `from` до `to`. Даты не разобрались — null. */
export function daysBetween(from: string, to: string): number | null {
  const a = toDay(from);
  const b = toDay(to);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / DAY);
}

/**
 * Сколько дней вакансия открыта. Закрытая считается до даты закрытия,
 * а не до сегодня: иначе её возраст рос бы и после того, как набор
 * кончился.
 */
export function daysOpen(openedAt: string, closedAt: string, today: string): number | null {
  const days = daysBetween(openedAt, closedAt || today);
  return days === null ? null : Math.max(0, days);
}

export type DeadlineState = { kind: "overdue" | "soon"; days: number };

/** Просрочена или вот-вот; иначе — null, бейджа нет. */
export function deadlineState(deadline: string, status: string, today: string): DeadlineState | null {
  if (!deadline || status === CLOSED) return null;

  const left = daysBetween(today, deadline);
  if (left === null) return null;
  if (left < 0) return { kind: "overdue", days: -left };
  return left <= SOON ? { kind: "soon", days: left } : null;
}

/** «ГГГГ-ММ-ДД» плюс дни — дедлайн и выход новой вакансии от сегодня. */
export function plusDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
