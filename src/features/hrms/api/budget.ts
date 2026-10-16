import { useMemo } from "react";
import { useCreateItem, useUpdateItem, type Item } from "@/features/item";
import type { BudgetLine, BudgetStatus } from "../model/budget";
import { firstText, related, text } from "./org";
import { useAll } from "./timesheet";

/** Строка бюджета: сотрудник или вакансия в отделе на год. */
export const BUDGET_LINES = "hr_budget_lines";
/** Сумма строки за месяц: план и факт; `amount_key` = «строка:ГГГГ-ММ». */
export const BUDGET_AMOUNTS = "hr_budget_amounts";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const STATUSES: BudgetStatus[] = ["working", "vacancy", "maternity", "dismissed"];

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

/**
 * Бюджет за год: строки и их суммы по месяцам.
 *
 * ponytail: строки грузятся все и отбираются по `year` на клиенте — их
 * десятки; отбор числа на сервере понадобится, когда бюджет разрастётся.
 */
export function useBudget(year: number, search: string) {
  const lines = useAll(BUDGET_LINES, {});
  const amounts = useAll(BUDGET_AMOUNTS, { month: { op: "between", values: [`${year}-01-01`, `${year}-12-31`] } }, false);
  const query = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const byLine = new Map<string, Item[]>();
    for (const amount of amounts.rows) {
      const id = text(amount.hr_budget_lines_id);
      byLine.set(id, [...(byLine.get(id) ?? []), amount]);
    }
    return lines.rows
      .filter((row) => num(row.year) === year)
      .map((row): BudgetLine => {
        const person = related(row, "hr_employees_id");
        const vacancy = !text(row.hr_employees_id);
        const status = text(row.status);
        const line: BudgetLine = {
          id: text(row.guid),
          deptId: text(row.hr_departments_id),
          dept: text(related(row, "hr_departments_id").name) || "—",
          name: vacancy ? "" : text(person.full_name) || "—",
          photo: firstText(person.photo),
          position: text(related(row, "hr_positions_id").name) || text(row.title),
          vacancy,
          status: STATUSES.includes(status as BudgetStatus) ? (status as BudgetStatus) : "",
          tax: num(row.tax_percent) ?? 0,
          bonus: num(row.bonus_percent) ?? 0,
          order: num(row.sort_order) ?? 0,
          plan: Array(12).fill(0),
          fact: Array(12).fill(null),
          amountIds: Array(12).fill(null),
        };
        for (const amount of byLine.get(line.id) ?? []) {
          const month = Number(text(amount.month).slice(5, 7)) - 1;
          if (month < 0 || month > 11) continue;
          line.plan[month] = num(amount.plan_amount) ?? 0;
          line.fact[month] = num(amount.fact_amount);
          line.amountIds[month] = text(amount.guid);
        }
        return line;
      })
      .filter((line) => !query || `${line.name} ${line.position}`.toLowerCase().includes(query));
  }, [lines.rows, amounts.rows, year, query]);

  return { lines: rows, loading: lines.loading || amounts.loading };
}

/** Правка бюджета: сумма месяца и проценты строки. */
export function useBudgetEdit(year: number) {
  const createAmount = useCreateItem(BUDGET_AMOUNTS);
  const updateAmount = useUpdateItem(BUDGET_AMOUNTS);
  const updateLine = useUpdateItem(BUDGET_LINES);
  return {
    /** План или факт за месяц. Строки суммы ещё нет — заводится. */
    setAmount: (line: BudgetLine, month: number, kind: "plan" | "fact", value: number | null) => {
      const slug = kind === "plan" ? "plan_amount" : "fact_amount";
      const amount = kind === "plan" ? (value ?? 0) : value;
      const id = line.amountIds[month];
      if (id) return updateAmount.mutate({ guid: id, values: { [slug]: amount } });
      createAmount.mutate({
        hr_budget_lines_id: line.id,
        month: `${monthKey(year, month)}-01`,
        amount_key: `${line.id}:${monthKey(year, month)}`,
        plan_amount: kind === "plan" ? amount : 0,
        fact_amount: kind === "fact" ? amount : null,
      });
    },
    setPercent: (line: BudgetLine, kind: "tax" | "bonus", value: number) =>
      updateLine.mutate({
        guid: line.id,
        values: { [kind === "tax" ? "tax_percent" : "bonus_percent"]: Math.max(0, Math.min(100, value)) },
      }),
  };
}
