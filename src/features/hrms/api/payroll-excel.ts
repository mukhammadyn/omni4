import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, toRequestBody, type Filters, type Item, type ItemsResponseDto } from "@/features/item";
import { api } from "@/shared/api/client";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import type { ImportRecord, ImportType, PayTypeColumn, PayUnit, TemplateEmployee } from "../model/payroll-excel";
import { buildRow, datesOf, plusDays, rangeOf } from "../model/timesheet";
import { EMPLOYEES } from "./employee";
import { JOB_HISTORY } from "./job-history";
import { firstText, text } from "./org";
import { PAYROLL_LINES } from "./payroll";
import { FINES_SOURCE, finesType } from "./penalty";
import { upsert } from "./schedule";
import { useAll, useTimesheet } from "./timesheet";

const UNITS: readonly string[] = ["month", "week", "day", "hour"];
const num = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);

/** «Оклад» — по коду или по названию, как `isSalaryTitle` HRMS. */
const isSalary = (row: Item) => text(row.code) === "salary" || /оклад|salary|зарплат|maosh/i.test(text(row.name).replace(/ё/g, "е"));

const byOrder = (a: Item, b: Item) => num(a.sort_order) - num(b.sort_order) || text(a.name).localeCompare(text(b.name), "ru");

/** Виды начислений: «Оклад» отдельно, остальные — колонками; вид штрафов — только для чтения. */
export function usePayTypes() {
  const { rows, loading } = useAll("hr_pay_types", {}, false);
  return useMemo(() => {
    const active = rows.filter((row) => row.is_active !== false).sort(byOrder);
    const salary = rows.find(isSalary);
    const column = (row: Item): PayTypeColumn => ({ id: text(row.guid), name: text(row.name) });
    return {
      loading,
      salaryId: salary ? text(salary.guid) : "",
      finesId: text(finesType(rows)?.guid),
      accruals: active.filter((row) => firstText(row.kind) !== "deduction" && row !== salary).map(column),
      deductions: active.filter((row) => firstText(row.kind) === "deduction").map(column),
      kinds: new Map<string, ImportType>(rows.map((row) => [text(row.guid), { id: text(row.guid), kind: firstText(row.kind) === "deduction" ? "deduction" : "accrual" }])),
    };
  }, [rows, loading]);
}

/**
 * Сотрудники ведомости за месяц — как `fetchEmployeesWithSalary` HRMS:
 * у кого назначение (`hr_job_history`) задевает месяц; ставка и единица —
 * из последнего такого. Дни — табель месяца и задетых им недель.
 */
export function usePayrollTemplate(month: string, where: Filters) {
  const { from, to } = rangeOf("month", `${month}-01`);
  const wide = { from: rangeOf("week", from).from, to: rangeOf("week", to).to };
  const dates = useMemo(() => datesOf(wide), [wide.from, wide.to]);
  const sheet = useTimesheet({ ...wide, dates, today: todayInput(), search: "", where });
  const jobs = useAll(JOB_HISTORY, { date_from: { op: "before", values: [plusDays(to, 1)] } }, false);
  const lines = useAll(PAYROLL_LINES, { period: { op: "between", values: [from, to] } }, false);
  const types = usePayTypes();
  const loading = sheet.loading || jobs.loading || lines.loading || types.loading;

  const employees = useMemo<TemplateEmployee[]>(() => {
    if (loading) return [];
    const job = new Map<string, Item>();
    for (const row of jobs.rows) {
      const end = text(row.date_to).slice(0, 10);
      if (end && end < from) continue;
      const id = text(row.hr_employees_id);
      const seen = job.get(id);
      if (!seen || text(row.date_from) > text(seen.date_from)) job.set(id, row);
    }
    const fines = new Map<string, number>();
    for (const row of lines.rows) {
      if (firstText(row.source) !== FINES_SOURCE || !text(row.fine_key)) continue;
      const id = text(row.hr_employees_id);
      fines.set(id, (fines.get(id) ?? 0) + num(row.amount));
    }
    return sheet.employees.flatMap((employee) => {
      const work = job.get(employee.id);
      // Табель взят с неделями по краям — принятые и уволенные в них месяцу чужие.
      if (!work || (employee.hireDate && employee.hireDate > to) || (employee.dismissalDate && employee.dismissalDate < from)) return [];
      const input = sheet.inputOf(employee);
      const unit = firstText(work.pay_unit);
      return [
        {
          id: employee.id,
          name: employee.name,
          salary: num(work.salary),
          unit: (UNITS.includes(unit) ? unit : "month") as PayUnit,
          cells: buildRow(input).cells,
          planByDate: input.planByDate,
          from,
          to,
          fines: fines.get(employee.id) ?? 0,
        },
      ];
    });
  }, [loading, sheet, jobs.rows, lines.rows, from, to]);

  return { loading, employees, types };
}

/** Все строки по отбору, порциями до конца. */
async function listAll(slug: string, filters: Filters): Promise<Item[]> {
  const body = toRequestBody({ limit: MAX_LIMIT, page: 1, filters, relations: false });
  const rows: Item[] = [];
  for (let offset = 0; ; offset += MAX_LIMIT) {
    const page = await api.post<ItemsResponseDto>(`/v2/object/get-list/${slug}`, { data: { ...body, offset } });
    const part = page.data?.response ?? [];
    rows.push(...part);
    if (part.length < MAX_LIMIT) return rows;
  }
}

const CHUNK = 500;

/**
 * Запись загруженного: строка начисления на сотрудника × вид, датой —
 * последний день месяца, как `insertCompensationsBatch` HRMS. Как и там,
 * прежние строки не трогаются: повторная загрузка добавит их ещё раз.
 */
export function useImportPayroll() {
  const queryClient = useQueryClient();
  return async (month: string, records: ImportRecord[], description: string) => {
    const { from, to } = rangeOf("month", `${month}-01`);
    const ids = [...new Set(records.map((record) => record.employeeId))];
    const people = ids.length ? await listAll(EMPLOYEES, { guid: { op: "any", values: ids } }) : [];
    const departments = new Map(people.map((row) => [text(row.guid), text(row.hr_departments_id) || null]));
    const known = records.filter((record) => departments.has(record.employeeId));
    const objects = known.map((record) => ({
      guid: crypto.randomUUID(),
      hr_employees_id: record.employeeId,
      hr_departments_id: departments.get(record.employeeId) ?? null,
      hr_pay_types_id: record.typeId,
      kind: record.kind,
      amount: record.amount,
      currency: "UZS",
      date: to,
      period: from,
      source: "import",
      fine_key: null,
      description,
    }));
    for (let i = 0; i < objects.length; i += CHUNK) await upsert(PAYROLL_LINES, objects.slice(i, i + CHUNK));
    if (objects.length) await queryClient.invalidateQueries({ queryKey: keys.items.table(PAYROLL_LINES) });
    return { inserted: objects.length, unknownEmployee: records.length - known.length };
  };
}
