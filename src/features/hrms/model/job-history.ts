import { toDateValue } from "@/shared/lib/date-value";

/**
 * Строка матрицы грейдов (`hr_salary_bands`): какой грейд допустим
 * для должности и потолок оклада на нём.
 */
export type Band = {
  positionId: string;
  gradeId: string;
  gradeName: string;
  /** Потолок вилки. null — не задан, сверять не с чем. */
  max: number | null;
  /** «Действует с» — версия матрицы, «ГГГГ-ММ-ДД». */
  from: string;
};

/**
 * Чем запись истории расходится с матрицей — плашка «Не по матрице
 * грейдов» прототипа. Матрица сохранение не блокирует (erp.dbml,
 * hr_salary_bands), она только подсвечивает.
 */
export type GradeIssue =
  | { kind: "noGrade"; allowed: string[] }
  | { kind: "notAllowed" }
  | { kind: "overCeiling"; ceiling: number };

/**
 * Сверка записи с матрицей.
 *
 * Для должности в матрице нет ни строки — сверять не с чем, и это
 * не ошибка: у руководителей (CEO, CTO) грейдов нет вовсе, как
 * в прототипе.
 */
export function gradeIssue(
  entry: { positionId: string; gradeId: string; salary: number | null },
  bands: Band[],
): GradeIssue | null {
  const own = bands.filter((band) => band.positionId === entry.positionId);
  if (!own.length) return null;

  if (!entry.gradeId) {
    return { kind: "noGrade", allowed: [...new Set(own.map((band) => band.gradeName))] };
  }

  // ponytail: последняя версия матрицы, а не действовавшая на дату записи; валюта не сверяется.
  const band = own
    .filter((item) => item.gradeId === entry.gradeId)
    .sort((a, b) => b.from.localeCompare(a.from))[0];
  if (!band) return { kind: "notAllowed" };

  if (entry.salary !== null && band.max !== null && entry.salary > band.max) {
    return { kind: "overCeiling", ceiling: band.max };
  }
  return null;
}

/**
 * Полных месяцев между датами: неполный последний не считается.
 * Им меряются и срок работы, и длительность записи истории.
 */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Дата поля DATE как местная полночь: в строке она без пояса, и
 * toDateValue кладёт её части в UTC. Для счёта месяцев и подписей
 * нужен календарный день, а не момент времени.
 */
export function toDay(value: unknown): Date | null {
  const parsed = toDateValue(value, "date");
  if (!parsed) return null;
  const { date } = parsed;
  return parsed.naive
    ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : date;
}
