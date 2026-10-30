/** Вид нарушения посещаемости — варианты `hr_penalty_rules.violation`. */
export type Violation = "late" | "early_leave" | "no_checkout" | "absence";
export type Step = { minutes: number; amount: number };
export type PolicyRules = Record<Violation, { on: boolean; steps: Step[] }>;
