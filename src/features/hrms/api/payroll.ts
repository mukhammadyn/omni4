import { useMemo } from "react";
import { useItems, type Item } from "@/features/item";
import type { PayLine } from "../model/payroll";
import { firstText, related, text } from "./org";
import { useAll } from "./timesheet";

/** Строки «Начислений»: сотрудник, вид, сумма, расчётный месяц (`period`). */
export const PAYROLL_LINES = "hr_payroll_lines";

const toLine = (row: Item): PayLine => {
  const person = related(row, "hr_employees_id");
  const type = related(row, "hr_pay_types_id");
  return {
    employeeId: text(row.hr_employees_id),
    employee: text(person.full_name) || "—",
    photo: firstText(person.photo),
    dept: text(related(row, "hr_departments_id").name),
    typeId: text(row.hr_pay_types_id),
    typeName: text(type.name) || "—",
    typeOrder: typeof type.sort_order === "number" ? type.sort_order : 0,
    kind: row.kind === "deduction" ? "deduction" : "accrual",
    amount: typeof row.amount === "number" ? row.amount : 0,
  };
};

/** Последний расчётный месяц с данными («ГГГГ-ММ») — с него сводная открывается. */
export function useLastPayMonth() {
  const query = useItems(PAYROLL_LINES, { limit: 1, page: 1, relations: false, sorts: [{ field: "period", direction: "desc" }] });
  return { month: text(query.page.rows[0]?.period).slice(0, 7), loading: query.isLoading };
}

/** Все строки за месяц. ponytail: валюта не учитывается — в проекте всё в UZS. */
export function usePayMonth(month: string, search: string) {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const { rows, loading } = useAll(month ? PAYROLL_LINES : undefined, {
    period: { op: "between", values: [`${month}-01`, `${month}-${last}`] },
  });
  const query = search.trim().toLowerCase();
  const lines = useMemo(
    () => rows.map(toLine).filter((line) => !query || line.employee.toLowerCase().includes(query)),
    [rows, query],
  );
  return { lines, loading };
}
