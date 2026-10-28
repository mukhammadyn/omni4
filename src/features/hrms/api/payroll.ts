import { useMemo } from "react";
import { useTablePermissions } from "@/features/auth";
import { useCreateItem, useDeleteItems, useItems, useUpdateItem, type Filters, type Item } from "@/features/item";
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

/**
 * Все строки за период: месяц — по расчётному месяцу (`period`), неделя —
 * по дате строки, как ведомость HRMS. ponytail: валюта не учитывается —
 * в проекте всё в UZS.
 */
export function usePayPeriod({ from, to }: { from: string; to: string }, week: boolean, search: string, where: Filters = {}) {
  const { rows, loading } = useAll(PAYROLL_LINES, {
    ...where,
    [week ? "date" : "period"]: { op: "between", values: [from, to] },
  });
  const query = search.trim().toLowerCase();
  const lines = useMemo(
    () => rows.map(toLine).filter((line) => !query || line.employee.toLowerCase().includes(query)),
    [rows, query],
  );
  return { lines, loading };
}

/** Строка «Компенсации» сотрудника — `C` прототипа (employee.html, `#comp`). */
export type PayRecord = {
  id: string;
  date: string;
  typeId: string;
  typeName: string;
  kind: "accrual" | "deduction";
  amount: number;
  description: string;
  createdAt: string;
};

export type PayType = { id: string; name: string; kind: "accrual" | "deduction"; color: string };

const toRecord = (row: Item): PayRecord => ({
  id: text(row.guid),
  // Дата начисления; у строк без неё — расчётный месяц.
  date: (text(row.date) || text(row.period)).slice(0, 10),
  typeId: text(row.hr_pay_types_id),
  typeName: text(related(row, "hr_pay_types_id").name) || "—",
  kind: row.kind === "deduction" ? "deduction" : "accrual",
  amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
  description: text(row.description),
  createdAt: text(row.created_at),
});

export type PayDraft = Omit<PayRecord, "id" | "typeName" | "createdAt">;

/** Начисления и удержания одного сотрудника, все строки; правка — тут же. */
export function useEmployeePay(employeeId: string, departmentId: string) {
  const { rows, loading } = useAll(PAYROLL_LINES, { hr_employees_id: { op: "is", values: [employeeId] } });
  const types = useItems("hr_pay_types", { limit: 200, page: 1, relations: false });
  const create = useCreateItem(PAYROLL_LINES);
  const update = useUpdateItem(PAYROLL_LINES);
  const remove = useDeleteItems(PAYROLL_LINES);
  const can = useTablePermissions()(PAYROLL_LINES);

  const records = useMemo(() => rows.map(toRecord), [rows]);
  const payTypes = useMemo<PayType[]>(
    () =>
      types.page.rows
        .filter((row) => row.is_active !== false)
        .map((row) => ({ id: text(row.guid), name: text(row.name), kind: row.kind === "deduction" ? "deduction" : "accrual", color: text(row.color) })),
    [types.page.rows],
  );

  /* Расчётный месяц — первое число месяца даты: по нему строит сводная (usePayMonth). */
  const values = (draft: PayDraft) => ({
    date: draft.date,
    period: `${draft.date.slice(0, 7)}-01`,
    hr_pay_types_id: draft.typeId,
    kind: draft.kind,
    amount: draft.amount,
    description: draft.description,
  });

  return {
    records,
    payTypes,
    loading,
    can,
    save: (draft: PayDraft, id?: string) =>
      id
        ? update.mutateAsync({ guid: id, values: values(draft) })
        : create.mutateAsync({
            guid: crypto.randomUUID(),
            hr_employees_id: employeeId,
            hr_departments_id: departmentId || null,
            currency: "UZS",
            source: "manual",
            ...values(draft),
          }),
    remove: (id: string) => remove.mutateAsync([id]),
  };
}
