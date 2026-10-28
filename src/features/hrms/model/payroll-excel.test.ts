import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { timesheetPay, type SalaryPiece } from "./payroll";
import { buildTemplate, parseImport, type TemplateEmployee, type TemplateInput, type TemplateLabels } from "./payroll-excel";
import type { SalaryInput } from "./timesheet-salary";

const labels = new Proxy({} as TemplateLabels, {
  get: (_, key) =>
    key === "unit"
      ? { month: "м", week: "н", day: "д", hour: "ч" }
      : key === "noCheckout"
        ? (dates: string) => `нет ухода: ${dates}`
        : key === "offShift"
          ? (dates: string) => `без смены: ${dates}`
          : String(key),
});

const month = (over: Partial<SalaryInput> = {}): SalaryInput => ({
  base_salary: 4000,
  pay_unit: "month",
  work_days: 22,
  actual_work_days: 20,
  plan_hours: 176,
  paid_hours: 160,
  segments: [{ unit_work_days: 22, work_days: 22, credited_days: 20 }],
  late_minutes: 50,
  has_work_schedule: true,
  daily_minutes: 480,
  month_work_days: 22,
  no_checkout: [],
  off_shift: [],
  ...over,
});

const ids = { one: "0b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d", none: "1b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d" };
const types = { accrual: "11111111-1111-4111-8111-111111111111", late: "22222222-2222-4222-8222-222222222222", salary: "33333333-3333-4333-8333-333333333333" };
const kinds = new Map([
  [types.accrual, { id: types.accrual, kind: "accrual" as const }],
  [types.late, { id: types.late, kind: "deduction" as const }],
  [types.salary, { id: types.salary, kind: "accrual" as const }],
]);
const employee = (id: string, over: Partial<TemplateEmployee> = {}): TemplateEmployee => ({ id, name: id, input: month(), fines: 0, fromAttendance: false, ...over });
const build = (over: Partial<TemplateInput> = {}) =>
  buildTemplate({
    period: { from: "2026-10-01", to: "2026-10-31" },
    isMonth: true,
    mode: "daily",
    labels,
    employees: [employee(ids.one, { fines: 50, input: month({ no_checkout: ["06.10"] }) }), employee(ids.none, { input: null })],
    accruals: [{ id: types.accrual, name: "KPI" }],
    deductions: [{ id: types.late, name: "Опоздания" }],
    autoDeductionId: types.late,
    legacy: false,
    lateness: { coefficient: 4, grace: 30 },
    ...over,
  });
const open = async (file: ArrayBuffer) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(file);
  return { book, sheet: book.worksheets[0]! };
};

describe("шаблон как в HRMS", () => {
  it("цена и оклад — формулы от ставки, нормы и отработанного; минуты опозданий; подсказка «нет ухода»", async () => {
    const { sheet } = await open(await build());
    // 6 ставка, 7 цена, 8 норма, 9 отработано, 10 опоздания (мин), 11 оклад, 12 KPI, 13 штрафы.
    expect(sheet.getCell(6, 6).value).toBe(4000);
    expect(sheet.getCell(6, 7).value).toMatchObject({ formula: "IF(H6>0,F6/H6,0)" });
    expect([8, 9, 10].map((c) => sheet.getCell(6, c).value)).toEqual([22, 20, 50]);
    expect(sheet.getCell(6, 11).value).toMatchObject({ formula: "ROUND(G6*I6,0)", result: Math.round(4000 * (20 / 22)) });
    expect(sheet.getCell(6, 13).value).toBe(50);
    expect(String(sheet.getCell(6, 9).note)).toContain("06.10");
  });

  it("норма клетки не та, что у цены (табель без дней «вне работы») — в формуле число, Excel не пересчитает иначе", async () => {
    const { sheet } = await open(await build({ employees: [employee(ids.one, { input: month({ work_days: 11, actual_work_days: 11 }) })] }));
    expect(sheet.getCell(6, 7).value).toMatchObject({ formula: "IF(22>0,F6/22,0)" });
  });

  it("часовой: цена — ставка × множитель / норма часов, как hourlyFactor HRMS", async () => {
    const { sheet } = await open(await build({ mode: "hourly", isMonth: false, period: { from: "2026-10-05", to: "2026-10-11" } }));
    expect(sheet.getCell(6, 7).value).toMatchObject({ formula: "IF(H6>0,F6/4/H6,0)" });
  });

  it("загрузка пишет оклад (и поправленный руками), премии; штрафы не читает", async () => {
    const { book, sheet } = await open(await build());
    sheet.getCell(6, 12).value = "1 500,5";
    sheet.getCell(6, 11).value = 9999;
    const parsed = await parseImport(await book.xlsx.writeBuffer(), { types: kinds, salaryTypeId: types.salary });
    expect(parsed.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parsed.records).toEqual([
      { employeeId: ids.one, typeId: types.accrual, kind: "accrual", amount: 1500.5 },
      { employeeId: ids.one, typeId: types.salary, kind: "accrual", amount: 9999 },
    ]);
  });

  it("политик нет — «Опоздания» по старой формуле HRMS, и загрузка их пишет", async () => {
    const { sheet } = await open(await build({ legacy: true }));
    const late = Math.round((4000 / (22 * 480)) * (50 - 30) * 4);
    expect(sheet.getCell(6, 13).value).toMatchObject({ formula: "IF(AND(H6>0,480>0),ROUND(F6/(H6*480)*MAX(J6-30,0)*4,0),0)", result: late });
    const parsed = await parseImport(await build({ legacy: true, employees: [employee(ids.one)] }), { types: kinds, salaryTypeId: types.salary });
    expect(parsed.records).toContainEqual({ employeeId: ids.one, typeId: types.late, kind: "deduction", amount: late });
  });
});

describe("timesheetPay", () => {
  const piece = (over: Partial<SalaryPiece> = {}): SalaryPiece => ({ from: "2026-10-01", to: "2026-10-31", rate: 4000, unit: "month", mode: "daily", norm: 22, worked: 20, amount: 3636, ...over });
  const line = (from: string, to: string, amount: number, kind: "accrual" | "deduction" = "accrual") => ({ ...piece({ from, to, amount }), employeeId: "e", kind });

  it("неделя на стыке — обе части, месячный табель в неделю не попадает", () => {
    const lines = [
      line("2026-10-01", "2026-10-04", 400), // октябрьская часть недели 28.09–04.10
      line("2026-09-28", "2026-09-30", 300), // сентябрьская
      line("2026-10-02", "2026-10-02", 50, "deduction"),
      line("2026-09-01", "2026-09-30", 4000), // месячный табель сентября
    ];
    const week = timesheetPay(lines, { from: "2026-09-28", to: "2026-10-04" }).get("e")!;
    expect(week.pieces.map((p) => p.amount)).toEqual([300, 400]);
    expect(week.fines).toBe(50);
    const october = timesheetPay(lines, { from: "2026-10-01", to: "2026-10-31" }).get("e")!;
    expect(october.pieces.map((p) => p.amount)).toEqual([400]);
  });
});
