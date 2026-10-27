import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { accrual, buildTemplate, parseImport, salaryRow, type TemplateEmployee, type TemplateLabels } from "./payroll-excel";
import type { SheetCell } from "./timesheet";

const cell = (date: string, kind: SheetCell["kind"], over: Partial<SheetCell> = {}): SheetCell => ({
  date,
  kind,
  counted: true,
  workedMinutes: kind === "worked" ? 540 : null,
  planMinutes: 480,
  lateMinutes: 0,
  overtimeMinutes: 0,
  remote: false,
  day: null,
  leave: null,
  holiday: "",
  pending: [],
  pendingLeave: null,
  ...over,
});

/* Октябрь: 4 смены по 8 ч — 1, 2, 3 и 31-е; 30.09 — смена той же недели вне месяца. */
const plan = new Map(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-31"].map((d) => [d, 480]));
const employee = (over: Partial<TemplateEmployee> = {}): TemplateEmployee => ({
  id: "0b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d",
  name: "Алиев",
  salary: 4000,
  unit: "month",
  cells: [
    cell("2026-09-30", "worked"),
    cell("2026-10-01", "worked", { lateMinutes: 12 }),
    cell("2026-10-02", "missing_mark"),
    cell("2026-10-03", "leave", { leave: { id: "l", typeId: "", title: "", code: "", icon: "", color: "", status: "approved", paid: true, from: "2026-10-03", to: "2026-10-03" } }),
    cell("2026-10-04", "worked", { planMinutes: 0, day: { status: "off_schedule" } as SheetCell["day"] }),
    cell("2026-10-05", "worked", { planMinutes: 0, workedMinutes: 120 }),
    cell("2026-10-31", "absent"),
  ],
  planByDate: plan,
  from: "2026-10-01",
  to: "2026-10-31",
  fines: 0,
  ...over,
});

describe("salaryRow", () => {
  it("засчитывает приход и оплачиваемое отсутствие, норма — смены месяца", () => {
    const row = salaryRow(employee());
    // 04.10 «вне графика» не засчитан, 05.10 без смены и без пометки — засчитан фактом.
    expect(row).toMatchObject({ normDays: 4, normHours: 32, creditedDays: 4, paidHours: 27, lateMinutes: 12, noCheckout: ["02.10"], offShift: [] });
  });

  it("ставке за день засчитана и работа без смены", () => {
    const row = salaryRow(employee({ unit: "day" }));
    expect(row).toMatchObject({ creditedDays: 5, offShift: ["04.10", "05.10"] });
    expect(accrual(100, "day", "daily", row).amount).toBe(500);
  });
});

describe("accrual", () => {
  it("месяц: ставка / смены × засчитанные; часовой — по часам", () => {
    const row = salaryRow(employee());
    // Засчитано 4 из 4 смен — оклад целиком; часы — факт, 27 из 32.
    expect(accrual(4000, "month", "daily", row)).toMatchObject({ norm: 4, worked: 4, price: 1000, amount: 4000 });
    expect(accrual(3200, "month", "hourly", row)).toMatchObject({ norm: 32, worked: 27, price: 100, amount: 2700 });
  });

  it("неделя: каждая неделя по своим сменам, и вне месяца тоже", () => {
    // Неделя 28.09–04.10: 4 смены, в октябре 3, засчитано 3; неделя 26.10–01.11: 1 смена, прогул.
    const pay = accrual(400, "week", "daily", salaryRow(employee({ unit: "week" })));
    expect(pay).toMatchObject({ worked: 3, amount: 300 });
  });
});

const labels = new Proxy({} as TemplateLabels, {
  get: (_, key) => (key === "unit" ? { month: "м", week: "н", day: "д", hour: "ч" } : key === "noCheckout" || key === "offShift" ? () => "" : String(key)),
});

describe("шаблон и загрузка", () => {
  it("загрузка читает суммы, заполненные в шаблоне, колонку штрафов — нет", async () => {
    const types = { accrual: "11111111-1111-4111-8111-111111111111", fine: "22222222-2222-4222-8222-222222222222", salary: "33333333-3333-4333-8333-333333333333" };
    const file = await buildTemplate({
      mode: "daily",
      labels,
      employees: [employee({ fines: 50 })],
      accruals: [{ id: types.accrual, name: "KPI" }],
      deductions: [{ id: types.fine, name: "Опоздания" }],
      autoDeductionId: types.fine,
    });

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file);
    const sheet = book.worksheets[0]!;
    expect(sheet.name).toBe("sheet");
    expect(sheet.getCell(6, 11).value).toMatchObject({ result: 4000 });
    expect(sheet.getCell(6, 13).value).toBe(50);
    sheet.getCell(6, 12).value = "1 500,5";

    const parsed = await parseImport(await book.xlsx.writeBuffer(), {
      types: new Map([
        [types.accrual, { id: types.accrual, kind: "accrual" as const }],
        [types.fine, { id: types.fine, kind: "deduction" as const }],
        [types.salary, { id: types.salary, kind: "accrual" as const }],
      ]),
      salaryTypeId: types.salary,
    });
    expect(parsed.records).toEqual([
      { employeeId: employee().id, typeId: types.accrual, kind: "accrual", amount: 1500.5 },
      { employeeId: employee().id, typeId: types.salary, kind: "accrual", amount: 4000 },
    ]);
    expect(parsed.skipped).toEqual({ invalidEmployee: 0, negative: 0, unknownType: 0 });
  });
});
