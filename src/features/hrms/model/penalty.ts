/** Вид нарушения посещаемости — варианты `hr_penalty_rules.violation`. */
export type Violation = "late" | "early_leave" | "no_checkout" | "absence";
export type Step = { minutes: number; amount: number };
export type PolicyRules = Record<Violation, { on: boolean; steps: Step[] }>;

/** День посещаемости — то, что расчёту нужно из `hr_attendance_days`. */
export type FineDay = {
  date: string;
  status: string;
  lateMinutes: number;
  earlyMinutes: number;
  firstIn: string;
  lastOut: string;
};

export type Fine = { date: string; violation: Violation; minutes: number; amount: number };

/** Наибольший достигнутый порог: штраф по нему, а не сумма всех. */
const stepFor = (steps: Step[], minutes: number) =>
  steps.filter((s) => s.minutes <= minutes).reduce<Step | null>((top, s) => (!top || s.minutes > top.minutes ? s : top), null);

/**
 * Штрафы за один день по правилам политики. Сегодняшний день без ухода
 * не штрафуется: человек ещё может отметиться.
 */
export function dayFines(day: FineDay, rules: PolicyRules, today: string): Fine[] {
  const fines: Fine[] = [];
  const add = (violation: Violation, minutes: number) => {
    const rule = rules[violation];
    if (!rule.on) return;
    const step = violation === "late" || violation === "early_leave" ? stepFor(rule.steps, minutes) : rule.steps[0];
    if (step?.amount) fines.push({ date: day.date, violation, minutes, amount: step.amount });
  };

  if (day.status === "absent") {
    add("absence", 0);
    return fines;
  }
  if (day.lateMinutes > 0) add("late", day.lateMinutes);
  if (day.earlyMinutes > 0) add("early_leave", day.earlyMinutes);
  if (day.firstIn && !day.lastOut && day.date < today) add("no_checkout", 0);
  return fines;
}
