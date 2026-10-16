/**
 * Бюджет ФОТ — `budget.html` прототипа: строки (сотрудник или вакансия)
 * по отделам, план и факт по месяцам года, итоги отделов, «Итого»
 * и «С налогами и бонусами». Режим «Кварталы» — те же месяцы суммой.
 */

export type BudgetStatus = "working" | "vacancy" | "maternity" | "dismissed";

export type BudgetLine = {
  id: string;
  deptId: string;
  dept: string;
  name: string;
  photo: string;
  position: string;
  /** Строка-вакансия: сотрудника нет, подпись — `title`. */
  vacancy: boolean;
  status: BudgetStatus | "";
  tax: number;
  bonus: number;
  order: number;
  /** Месяц 0–11 → план и факт. Факта нет — `null`, а не ноль. */
  plan: number[];
  fact: (number | null)[];
  /** id строки `hr_budget_amounts` по месяцу — правка пишет в неё. */
  amountIds: (string | null)[];
};

export type BudgetMode = "m" | "q";

export type Period = { key: string; months: number[]; current: boolean; total?: true; editable?: true };

/** Сумма за период: план, факт и был ли факт хоть в одном месяце. */
export type Sum = { plan: number; fact: number; hasFact: boolean };

export type BudgetDept = { id: string; name: string; lines: BudgetLine[] };

export function periods(mode: BudgetMode, year: number, today: Date): Period[] {
  const thisYear = year === today.getFullYear();
  const month = today.getMonth();
  const all = [...Array(12).keys()];
  const list: Period[] =
    mode === "m"
      ? all.map((m) => ({ key: String(m), months: [m], current: thisYear && m === month, editable: true }))
      : [0, 1, 2, 3].map((q) => ({
          key: `q${q}`,
          months: [q * 3, q * 3 + 1, q * 3 + 2],
          current: thisYear && Math.floor(month / 3) === q,
        }));
  return [...list, { key: "Y", months: all, current: false, total: true }];
}

export function sumOf(lines: BudgetLine[], months: number[], withExtras = false): Sum {
  const sum: Sum = { plan: 0, fact: 0, hasFact: false };
  for (const line of lines) {
    const k = withExtras ? 1 + (line.tax + line.bonus) / 100 : 1;
    for (const m of months) {
      sum.plan += (line.plan[m] ?? 0) * k;
      const fact = line.fact[m];
      if (fact != null) {
        sum.fact += fact * k;
        sum.hasFact = true;
      }
    }
  }
  return sum;
}

/** Строки — по отделам; отделы и строки внутри — по `sort_order`, затем по имени. */
export function groupByDept(lines: BudgetLine[]): BudgetDept[] {
  const map = new Map<string, BudgetDept>();
  for (const line of lines) {
    const dept = map.get(line.deptId) ?? { id: line.deptId, name: line.dept, lines: [] };
    dept.lines.push(line);
    map.set(line.deptId, dept);
  }
  const byOrder = (a: BudgetLine, b: BudgetLine) => a.order - b.order || a.name.localeCompare(b.name, "ru");
  return [...map.values()]
    .map((dept) => ({ ...dept, lines: dept.lines.sort(byOrder) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** `nf` прототипа: 14 000 000, минус — типографский. */
export const fullSum = (value: number) =>
  `${value < 0 ? "−" : ""}${String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;

/** Ввод суммы: «14 000 000», «14,5м», «900k». Пусто — `null`. Сумма — целая. */
export function parseSum(raw: string): number | null {
  const value = parseNumber(raw);
  return value === null ? null : Math.round(value);
}

/** То же без округления — для процентов (`tax_percent` у нас FLOAT). */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s/g, "").replace(",", ".").replace(/[−–]/, "-");
  if (!text) return null;
  const match = /^(-?\d*\.?\d+)(k|к|m|м|млн)?$/.exec(text);
  if (!match) return null;
  const scale = !match[2] ? 1 : /^(k|к)$/.test(match[2]) ? 1e3 : 1e6;
  return Number(match[1]) * scale;
}
