/**
 * KPI: карта показателей сотрудника за квартал (`hr_kpi_scorecards`)
 * и её строки (`hr_kpi_results`) по шаблонам `hr_kpi_metrics`.
 * Формулы — `kpiRows`/`kpiTotal` прототипа и заметки схемы (`erp.dbml`).
 */
export const SCORECARD = { draft: "draft", self: "self_review", manager: "manager_review", approved: "approved" } as const;

/** Следующий шаг карты: черновик → самооценка → оценка руководителя → утверждена. */
export const NEXT_STATUS: Record<string, typeof SCORECARD.self | typeof SCORECARD.manager | typeof SCORECARD.approved> = {
  [SCORECARD.draft]: SCORECARD.self,
  [SCORECARD.self]: SCORECARD.manager,
  [SCORECARD.manager]: SCORECARD.approved,
};

export type Rating = "exceeds" | "meets" | "partial" | "below";

/** Выполнение, %: факт к цели, у «меньше — лучше» — наоборот. */
export function completion(target: number, actual: number | null, direction: string): number {
  if (!target || actual == null) return 0;
  if (direction === "down") return actual > 0 ? Math.round((target / actual) * 100) : 120;
  return Math.round((actual / target) * 100);
}

/** Баллы строки: weight × min(120, выполнение) / 100. */
export const scoreOf = (weight: number, pct: number) => (weight * Math.min(120, pct)) / 100;

/** Коэффициент бонуса по итогу: ≥110 → 1.2; ≥100 → 1.0; ≥85 → 0.8; ≥70 → 0.5; иначе 0. */
export const coefficientOf = (total: number) => (total >= 110 ? 1.2 : total >= 100 ? 1 : total >= 85 ? 0.8 : total >= 70 ? 0.5 : 0);

export const ratingOf = (total: number): Rating => (total >= 100 ? "exceeds" : total >= 85 ? "meets" : total >= 70 ? "partial" : "below");

/** Вид KPI — `kpi_period` шаблона: неделя, месяц, квартал, год. */
export const KPI_TYPES = ["yearly", "quarterly", "monthly", "weekly"] as const;
/**
 * «daily» — только дочерний вид: неделя делится на рабочие дни, как
 * в udevs_hrms_admin («Дн.»). Своей вкладки и шаблонов у дня нет.
 */
export type KpiType = (typeof KPI_TYPES)[number] | "daily";

/** Период карты: даты «ГГГГ-ММ-ДД» включительно. */
export type Period = { type: KpiType; start: string; end: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);
const addDays = (day: string, n: number) => {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const monthEnd = (year: number, month0: number) => iso(new Date(Date.UTC(year, month0 + 1, 0)));

/**
 * Период вида `type`, в который попадает `day`. Неделя — пн–пт, как
 * в udevs_hrms_admin (`buildMondayFridayWeeksForMonth`).
 */
export function periodOf(type: KpiType, day: string): Period {
  const year = Number(day.slice(0, 4));
  const month0 = Number(day.slice(5, 7)) - 1;
  if (type === "daily") return { type, start: day.slice(0, 10), end: day.slice(0, 10) };
  if (type === "yearly") return { type, start: `${year}-01-01`, end: `${year}-12-31` };
  if (type === "quarterly") {
    const q = Math.floor(month0 / 3) * 3;
    return { type, start: `${year}-${pad(q + 1)}-01`, end: monthEnd(year, q + 2) };
  }
  if (type === "monthly") return { type, start: `${year}-${pad(month0 + 1)}-01`, end: monthEnd(year, month0) };
  const monday = addDays(day, -((utc(day).getUTCDay() + 6) % 7));
  return { type, start: monday, end: addDays(monday, 4) };
}

/** Соседний период: `step` = −1 назад, +1 вперёд. */
export function shiftPeriod(period: Period, step: number): Period {
  if (period.type === "daily") return periodOf("daily", addDays(period.start, step));
  if (period.type === "weekly") return periodOf("weekly", addDays(period.start, 7 * step));
  const months = { yearly: 12, quarterly: 3, monthly: 1 }[period.type] * step;
  const d = utc(period.start);
  d.setUTCMonth(d.getUTCMonth() + months);
  return periodOf(period.type, iso(d));
}

/**
 * Недели месяца пн–пт; неделя на стыке — у того месяца, где у неё
 * не меньше трёх рабочих дней (правило udevs_hrms_admin).
 */
export function weeksOfMonth(year: number, month0: number): Period[] {
  const out: Period[] = [];
  let week = periodOf("weekly", `${year}-${pad(month0 + 1)}-01`);
  const last = monthEnd(year, month0);
  while (week.start <= last) {
    let inMonth = 0;
    for (let i = 0; i < 5; i++) if (addDays(week.start, i).slice(0, 7) === `${year}-${pad(month0 + 1)}`) inMonth++;
    if (inMonth >= 3) out.push(week);
    week = shiftPeriod(week, 1);
  }
  return out;
}

/** Курсор сводной: что листается стрелками у вида `type`. Год → кварталы → месяцы → недели. */
export const CURSOR_OF: Record<KpiType, KpiType> = { yearly: "yearly", quarterly: "yearly", monthly: "quarterly", weekly: "monthly", daily: "weekly" };

/** Колонки сводной вида `type` внутри курсора `cursor` (период вида CURSOR_OF[type]). */
export function columnsOf(type: KpiType, cursor: Period): Period[] {
  const year = Number(cursor.start.slice(0, 4));
  const month0 = Number(cursor.start.slice(5, 7)) - 1;
  if (type === "daily") return [0, 1, 2, 3, 4].map((i) => periodOf("daily", addDays(periodOf("weekly", cursor.start).start, i)));
  if (type === "yearly") return [periodOf("yearly", cursor.start)];
  if (type === "quarterly") return [0, 3, 6, 9].map((m) => periodOf("quarterly", `${year}-${pad(m + 1)}-01`));
  if (type === "monthly") return [0, 1, 2].map((m) => periodOf("monthly", `${year}-${pad(month0 + m + 1)}-01`));
  return weeksOfMonth(year, month0);
}

/** Последние `n` периодов вида `type` по `day` включительно, от старого к новому. */
export function lastPeriods(type: KpiType, day: string, n: number): Period[] {
  const out = [periodOf(type, day)];
  while (out.length < n) out.unshift(shiftPeriod(out[0]!, -1));
  return out;
}

/**
 * Вид карты по её датам: у карты своего вида нет, есть только период.
 * Неделя — до 7 дней, месяц — до 31, квартал — до 92, дальше год.
 */
export function typeOfRange(start: string, end: string): KpiType {
  const days = (utc(end).getTime() - utc(start).getTime()) / 864e5 + 1;
  return days <= 1 ? "daily" : days <= 7 ? "weekly" : days <= 31 ? "monthly" : days <= 92 ? "quarterly" : "yearly";
}

/** Как родитель считает факт из дочерних (`kpi_aggregation`). */
export const AGGREGATIONS = ["sum", "min", "max", "avg"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

/** Факт родителя из фактов детей; пустые не считаются, все пустые — нет факта. */
export function aggregate(values: (number | null)[], mode: Aggregation): number | null {
  const known = values.filter((v): v is number => v != null);
  if (!known.length) return null;
  if (mode === "min") return Math.min(...known);
  if (mode === "max") return Math.max(...known);
  const sum = known.reduce((a, b) => a + b, 0);
  return mode === "avg" ? Math.round((sum / known.length) * 100) / 100 : sum;
}

/** Дочерние периоды: год → кварталы, квартал → месяцы, месяц → недели, неделя → дни пн–пт. У дня детей нет. */
export function childPeriods(period: Period): Period[] {
  if (period.type === "daily") return [];
  const child = ({ yearly: "quarterly", quarterly: "monthly", monthly: "weekly", weekly: "daily" } as const)[period.type];
  return columnsOf(child, period);
}

/** План родителя поровну по детям; остаток от округления — последнему. */
export function splitTarget(target: number, n: number): number[] {
  if (!n) return [];
  const part = Math.floor((target / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((target - part * (n - 1)) * 100) / 100 : part));
}
