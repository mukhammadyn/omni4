import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, toRequestBody, type Filters, type Item, type ItemsResponseDto } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { timesheetPay, type TimesheetPayLine } from "../model/payroll";
import type { ImportRecord, ImportType, PayTypeColumn, TemplateEmployee } from "../model/payroll-excel";
import { periodRange, type DayRow, type PayUnit, type PeriodKind } from "../model/timesheet-days";
import { fromDays, type MonthNorm, type SalaryDay } from "../model/timesheet-salary";
import { plusDays } from "../model/timesheet";
import { EMPLOYEES } from "./employee";
import { JOB_HISTORY } from "./job-history";
import { firstText, text } from "./org";
import { PAYROLL_LINES } from "./payroll";
import { upsert } from "./schedule";
import { toEmployee, useAll } from "./timesheet";
import { TIMESHEET_NORMS, toStoredDay, useFillDays, useTimesheetDays } from "./timesheet-days";
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

/** Нормы месяца по сотруднику: месяц («YYYY-MM-01») → смен и минут в дне. */
const normsByEmployee = (rows: Item[]) => {
  const out = new Map<string, Map<string, MonthNorm>>();
  for (const row of rows) {
    const id = text(row.hr_employees_id);
    const own = out.get(id) ?? out.set(id, new Map()).get(id)!;
    own.set(text(row.month).slice(0, 10), { shifts: num(row.shifts_in_month), minutesPerDay: num(row.minutes_per_day) });
  }
  return out;
};

/**
 * Общее обоим шаблонам за период: виды, настройки опозданий, старая формула
 * и штрафы, что записало «Утвердить». `sheet` — только штрафы этого табеля.
 */
function useTemplateBase({ from, to }: Range, sheet?: string) {
  const lines = useAll(PAYROLL_LINES, { date: { op: "between", values: [from, to] } }, false);
  const settings = useAll("core_settings", {}, false);
  const assignments = useAll("hr_penalty_assignments", {}, false);
  const types = usePayTypes();

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
  // Как HRMS: коэффициент не задан (или 0) — 4, прощаемые минуты не заданы — 30.
  const setting = settings.rows[0] ?? {};
  const lateness = {
    coefficient: num(setting.lateness_coefficient) > 0 ? num(setting.lateness_coefficient) : 4,
    grace: setting.lateness_grace_minutes == null || setting.lateness_grace_minutes === "" ? 30 : num(setting.lateness_grace_minutes),
  };
  const fines = useMemo(
    () =>
      timesheetPay(
        lines.rows
          .filter((row) => firstText(row.source) === TIMESHEET_SOURCE && firstText(row.kind) === "deduction")
          .filter((row) => !sheet || text(row.hr_timesheets_id) === sheet)
          .map(toPayLine),
        { from, to },
      ),
    [lines.rows, sheet, from, to],
  );
  const loading = [lines, settings, assignments].some((query) => query.loading) || types.loading;
  return { loading, legacy, lateness, types, fines };
}

/**
 * Строки ведомости за месяц или неделю — как шаблон HRMS: у кого назначение
 * (`hr_job_history`) задевает период; цифры — арифметикой HRMS
 * (`model/timesheet-salary`) по дням **утверждённых** табелей. Даты, которых
 * нет ни в одном утверждённом табеле, берутся из посещаемости тем же
 * расчётом, что «Заполнить» (`useFillDays().draft`), — чтобы ведомость не
 * была пустой; такие сотрудники считаются в `fromAttendance` и экран о них
 * предупреждает (ADR-0018, дополнение от 2026-10-28). Штрафы по политикам —
 * строки «Зарплаты», что записало «Утвердить».
 */
export function usePayrollTemplate({ from, to }: Range, kind: PeriodKind, where: Filters) {
  const base = useTemplateBase({ from, to });
  const source = useFillDays(from, kind);
  const people = useAll(EMPLOYEES, where, false);
  const jobs = useAll(JOB_HISTORY, { date_from: { op: "before", values: [plusDays(to, 1)] } }, false);
  const sheets = useAll(TIMESHEETS, {}, false);
  const approved = useMemo(() => sheets.rows.filter((row) => firstText(row.status) === "approved").map((row) => text(row.guid)), [sheets.rows]);
  // Нормы — только табелей, задевающих период: иначе каждое скачивание тянуло бы нормы всех табелей за всё время.
  const touching = useMemo(
    () =>
      sheets.rows
        .filter((row) => {
          if (firstText(row.status) !== "approved") return false;
          const range = periodRange(text(row.period).slice(0, 10), firstText(row.period_kind) === "week" ? "week" : "month");
          return range.from <= to && range.to >= from;
        })
        .map((row) => text(row.guid)),
    [sheets.rows, from, to],
  );
  const norms = useAll(touching.length ? TIMESHEET_NORMS : undefined, { hr_timesheets_id: { op: "any", values: touching } }, false);
  const loading = base.loading || source.loading || [people, jobs, sheets, norms].some((query) => query.loading);

  const employees = useMemo<TemplateEmployee[]>(() => {
    if (loading) return [];
    // Кто в ведомости, решает назначение, а не даты карточки — как в HRMS.
    const assigned = new Set(jobs.rows.filter((row) => !text(row.date_to) || text(row.date_to).slice(0, 10) >= from).map((row) => text(row.hr_employees_id)));
    const isApproved = new Set(approved);

    // Дни утверждённых табелей по сотруднику и дате; строка «в периоде» важнее «вне месяца».
    const sheetDays = new Map<string, Map<string, DayRow>>();
    for (const row of source.stored) {
      if (!isApproved.has(text(row.hr_timesheets_id))) continue;
      const day = toStoredDay(row);
      const own = sheetDays.get(day.hr_employees_id) ?? sheetDays.set(day.hr_employees_id, new Map()).get(day.hr_employees_id)!;
      const seen = own.get(day.date);
      if (!seen || (seen.outside_period && !day.outside_period)) own.set(day.date, day);
    }
    const sheetNorms = normsByEmployee(norms.rows);
    const draft = source.draft();
    return people.rows
      .map(toEmployee)
      .filter((employee) => assigned.has(employee.id))
      .map((employee) => {
        const approvedDays = sheetDays.get(employee.id) ?? new Map<string, DayRow>();
        const live = draft.get(employee.id);
        // Каждая дата: утверждённый табель, иначе посещаемость. День периода из посещаемости — повод предупредить.
        const days = new Map<string, SalaryDay>();
        let fromAttendance = false;
        for (const day of live?.days ?? []) {
          const inPeriod = day.date >= from && day.date <= to;
          const mine = approvedDays.get(day.date);
          if (mine && (!inPeriod || !mine.outside_period)) days.set(day.date, mine);
          else {
            days.set(day.date, day);
            if (inPeriod && !day.outside_period) fromAttendance = true;
          }
        }
        for (const [date, day] of approvedDays) if (!days.has(date) && !(date >= from && date <= to && day.outside_period)) days.set(date, day);
        const normsOf = new Map([...(live?.norms ?? []), ...(sheetNorms.get(employee.id) ?? [])]);
        return {
          id: employee.id,
          name: employee.legalName || employee.name,
          input: fromDays([...days.values()], normsOf, { from, to }),
          fines: base.fines.get(employee.id)?.fines ?? 0,
          fromAttendance,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loading, people.rows, jobs.rows, base.fines, approved, source.stored, source.draft, norms.rows, from, to]);

  return { loading, employees, legacy: base.legacy, lateness: base.lateness, types: base.types };
}

export type SheetChoice = { guid: string; title: string; status: string; kind: PeriodKind; from: string; to: string; departmentId: string };

/** Табели для окна «Скачать шаблон» — все, с любым статусом; новые периоды сверху. Поле статуса — для подписи варианта. */
export function useSheetChoices() {
  const { rows, loading } = useAll(TIMESHEETS, {}, false);
  const { schema } = useTableSchema(TIMESHEETS);
  const sheets = useMemo(
    () =>
      rows
        .map((row): SheetChoice => {
          const kind: PeriodKind = firstText(row.period_kind) === "week" ? "week" : "month";
          return { guid: text(row.guid), title: text(row.title), status: firstText(row.status), kind, departmentId: text(row.hr_departments_id), ...periodRange(text(row.period).slice(0, 10), kind) };
        })
        .sort((a, b) => b.from.localeCompare(a.from) || a.title.localeCompare(b.title)),
    [rows],
  );
  return { loading, sheets, status: schema.fields.find((field) => field.slug === "status") };
}

/**
 * Шаблон по одному табелю: его люди, его дни — с правками бухгалтера — и
 * нормы, за его период; статус любой. Посещаемость не подмешивается. Штрафы —
 * строки «Зарплаты», что записало «Утвердить» этого табеля (у черновика их нет).
 */
export function useSheetTemplate(sheet: SheetChoice, where: Filters) {
  const base = useTemplateBase(sheet, sheet.guid);
  const days = useTimesheetDays(sheet.guid);
  const norms = useAll(TIMESHEET_NORMS, { hr_timesheets_id: { op: "is", values: [sheet.guid] } }, false);
  const ids = useMemo(() => [...new Set(days.rows.filter((day) => !day.outside_period).map((day) => day.hr_employees_id))], [days.rows]);
  const people = useAll(ids.length ? EMPLOYEES : undefined, { ...where, guid: { op: "any", values: ids } }, false);
  const loading = base.loading || days.loading || norms.loading || people.loading;

  const employees = useMemo<TemplateEmployee[]>(() => {
    if (loading) return [];
    const byPerson = new Map<string, DayRow[]>();
    for (const day of days.rows) (byPerson.get(day.hr_employees_id) ?? byPerson.set(day.hr_employees_id, []).get(day.hr_employees_id)!).push(day);
    const sheetNorms = normsByEmployee(norms.rows);
    return people.rows
      .map(toEmployee)
      .map((employee) => ({
        id: employee.id,
        name: employee.legalName || employee.name,
        input: fromDays(byPerson.get(employee.id) ?? [], sheetNorms.get(employee.id) ?? new Map(), sheet),
        fines: base.fines.get(employee.id)?.fines ?? 0,
        fromAttendance: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loading, days.rows, norms.rows, people.rows, base.fines, sheet]);

  return { loading, employees, legacy: base.legacy, lateness: base.lateness, types: base.types };
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
