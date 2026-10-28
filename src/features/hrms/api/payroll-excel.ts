import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, toRequestBody, type Filters, type Item, type ItemsResponseDto } from "@/features/item";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { timesheetPay, type CalcMode, type TimesheetPayLine } from "../model/payroll";
import type { ImportRecord, ImportType, PayTypeColumn, TemplateEmployee } from "../model/payroll-excel";
import { periodRange, type PayUnit, type PeriodKind } from "../model/timesheet-days";
import { sheetSalary, type MonthNorm } from "../model/timesheet-salary";
import { plusDays } from "../model/timesheet";
import { EMPLOYEES } from "./employee";
import { JOB_HISTORY } from "./job-history";
import { firstText, text } from "./org";
import { PAYROLL_LINES } from "./payroll";
import { upsert } from "./schedule";
import { toEmployee, useAll } from "./timesheet";
import { TIMESHEET_DAYS, TIMESHEET_NORMS, toStoredDay } from "./timesheet-days";
import { TIMESHEETS } from "./timesheet-docs";

/** Строки «Зарплаты», которые пишет функция при «Утвердить» табеля: штрафы по политикам (ADR-0018). */
const TIMESHEET_SOURCE = "timesheet";

/** Вид удержаний табеля — «Опоздания» (`code = late_fine`); нет — первое удержание. Так же выбирает функция. */
const finesType = (types: Item[]) =>
  types.find((row) => text(row.code) === "late_fine") ?? types.find((row) => firstText(row.kind) === "deduction");

const UNITS: readonly string[] = ["month", "week", "day", "hour"];
const num = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);

const toPayLine = (row: Item): TimesheetPayLine => {
  const unit = firstText(row.pay_unit);
  return {
    employeeId: text(row.hr_employees_id),
    kind: firstText(row.kind) === "deduction" ? "deduction" : "accrual",
    from: text(row.period_from).slice(0, 10),
    to: text(row.period_to).slice(0, 10),
    rate: num(row.salary_rate),
    unit: (UNITS.includes(unit) ? unit : "month") as PayUnit,
    mode: firstText(row.calc_mode) === "hourly" ? "hourly" : "daily",
    norm: num(row.norm),
    worked: num(row.worked),
    amount: num(row.amount),
  };
};

/** «Оклад» — по коду или по названию, как `isSalaryTitle` HRMS. */
const isSalary = (row: Item) => text(row.code) === "salary" || /оклад|salary|зарплат|maosh/i.test(text(row.name).replace(/ё/g, "е"));

/* По названию, как `ORDER BY title` HRMS: латиница раньше кириллицы. */
const byName = (a: Item, b: Item) => (text(a.name) < text(b.name) ? -1 : text(a.name) > text(b.name) ? 1 : 0);

/** Виды начислений: «Оклад» отдельно, остальные — колонками; вид штрафов — только для чтения. */
export function usePayTypes() {
  const { rows, loading } = useAll("hr_pay_types", {}, false);
  return useMemo(() => {
    const active = rows.filter((row) => row.is_active !== false).sort(byName);
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

type Range = { from: string; to: string };

/**
 * Сотрудники ведомости за месяц или неделю — как `fetchEmployeesWithSalary`
 * HRMS: у кого назначение (`hr_job_history`) задевает период. Оклад и старая
 * формула опозданий — по дням утверждённых табелей периода в выбранном
 * режиме (дневной / часовой), как шаблон HRMS: один табель — любой режим
 * (ADR-0018, дополнение от 2026-10-28). Берутся куски, целиком лежащие в
 * периоде. Штрафы по политикам — строки «Зарплаты», что записало «Утвердить».
 */
export function usePayrollTemplate({ from, to }: Range, where: Filters, mode: CalcMode) {
  const people = useAll(EMPLOYEES, where, false);
  const jobs = useAll(JOB_HISTORY, { date_from: { op: "before", values: [plusDays(to, 1)] } }, false);
  const lines = useAll(PAYROLL_LINES, { date: { op: "between", values: [from, to] } }, false);
  const sheets = useAll(TIMESHEETS, {}, false);
  const approved = useMemo(
    () =>
      sheets.rows.flatMap((row) => {
        if (firstText(row.status) !== "approved") return [];
        const kind: PeriodKind = firstText(row.period_kind) === "week" ? "week" : "month";
        const range = periodRange(text(row.period).slice(0, 10), kind);
        return range.from <= to && range.to >= from ? [{ guid: text(row.guid), kind }] : [];
      }),
    [sheets.rows, from, to],
  );
  const ids = approved.map((sheet) => sheet.guid);
  const ofSheets = { hr_timesheets_id: { op: "any" as const, values: ids } };
  const days = useAll(ids.length ? TIMESHEET_DAYS : undefined, ofSheets, false);
  const norms = useAll(ids.length ? TIMESHEET_NORMS : undefined, ofSheets, false);
  const settings = useAll("core_settings", {}, false);
  const assignments = useAll("hr_penalty_assignments", {}, false);
  const types = usePayTypes();
  const loading = [people, jobs, lines, sheets, days, norms, settings, assignments].some((query) => query.loading) || types.loading;

  // Старая формула опозданий — только если в периоде нет ни одного действующего назначения политики штрафов.
  const legacy = useMemo(
    () =>
      !assignments.rows.some((row) => {
        if (row.is_active === false) return false;
        const start = text(row.valid_from || row.effective_from).slice(0, 10);
        const end = text(row.valid_to).slice(0, 10);
        return (!start || start <= to) && (!end || end >= from);
      }),
    [assignments.rows, from, to],
  );

  const employees = useMemo<TemplateEmployee[]>(() => {
    if (loading) return [];
    // Кто в ведомости, решает назначение, а не даты карточки — как в HRMS.
    const assigned = new Set(jobs.rows.filter((row) => !text(row.date_to) || text(row.date_to).slice(0, 10) >= from).map((row) => text(row.hr_employees_id)));
    const setting = settings.rows[0] ?? {};
    const rules = { coefficient: num(setting.lateness_coefficient), grace: num(setting.lateness_grace_minutes) };

    // Оклад: каждый утверждённый табель × сотрудник — арифметикой функции, в выбранном режиме.
    const salaryLines: TimesheetPayLine[] = [];
    const lateness = new Map<string, number>();
    for (const sheet of approved) {
      const byPerson = new Map<string, ReturnType<typeof toStoredDay>[]>();
      for (const row of days.rows) {
        if (text(row.hr_timesheets_id) !== sheet.guid) continue;
        const day = toStoredDay(row);
        (byPerson.get(day.hr_employees_id) ?? byPerson.set(day.hr_employees_id, []).get(day.hr_employees_id)!).push(day);
      }
      for (const [employeeId, own] of byPerson) {
        const normOf = new Map<string, MonthNorm>(
          norms.rows
            .filter((row) => text(row.hr_timesheets_id) === sheet.guid && text(row.hr_employees_id) === employeeId)
            .map((row) => [text(row.month).slice(0, 10), { shifts: num(row.shifts_in_month), minutesPerDay: num(row.minutes_per_day) }]),
        );
        const result = sheetSalary({ days: own, norms: normOf, kind: sheet.kind, mode, legacy, settings: rules });
        for (const piece of result.pieces) salaryLines.push({ ...piece, employeeId, kind: "accrual" });
        for (const late of result.lateness) {
          if (late.from >= from && late.to <= to) lateness.set(employeeId, (lateness.get(employeeId) ?? 0) + late.amount);
        }
      }
    }
    const salary = timesheetPay(salaryLines, { from, to });
    // Штрафы по политикам — что записало «Утвердить» (оклад оттуда больше не берётся).
    const fines = timesheetPay(
      lines.rows.filter((row) => firstText(row.source) === TIMESHEET_SOURCE && firstText(row.kind) === "deduction").map(toPayLine),
      { from, to },
    );
    return people.rows
      .map(toEmployee)
      .filter((employee) => assigned.has(employee.id))
      .map((employee) => ({
        id: employee.id,
        name: employee.legalName || employee.name,
        pieces: salary.get(employee.id)?.pieces ?? [],
        fines: fines.get(employee.id)?.fines ?? 0,
        lateness: lateness.get(employee.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loading, people.rows, jobs.rows, lines.rows, approved, days.rows, norms.rows, settings.rows, legacy, mode, from, to]);

  return { loading, employees, legacy, types };
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
 * последний день периода (у недели — воскресенье), как `insertCompensationsBatch`
 * HRMS; `period` — месяц этой даты. Как и там, прежние строки не трогаются:
 * повторная загрузка добавит их ещё раз.
 */
export function useImportPayroll() {
  const queryClient = useQueryClient();
  return async ({ to }: Range, records: ImportRecord[], description: string) => {
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
      period: `${to.slice(0, 7)}-01`,
      source: "import",
      fine_key: null,
      description,
    }));
    for (let i = 0; i < objects.length; i += CHUNK) await upsert(PAYROLL_LINES, objects.slice(i, i + CHUNK));
    if (objects.length) await queryClient.invalidateQueries({ queryKey: keys.items.table(PAYROLL_LINES) });
    return { inserted: objects.length, unknownEmployee: records.length - known.length };
  };
}
