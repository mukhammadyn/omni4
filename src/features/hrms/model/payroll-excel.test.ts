import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { timesheetPay, type SalaryPiece } from "./payroll";
import { buildTemplate, parseImport, type TemplateEmployee, type TemplateLabels } from "./payroll-excel";

const piece = (over: Partial<SalaryPiece> = {}): SalaryPiece => ({
  from: "2026-10-01",
  to: "2026-10-31",
  rate: 4000,
  unit: "month",
  mode: "daily",
  norm: 22,
  worked: 20,
  amount: 3636,
  ...over,
});
const employee = (id: string, over: Partial<TemplateEmployee> = {}): TemplateEmployee => ({ id, name: id, pieces: [piece()], fines: 0, ...over });

const labels = new Proxy({} as TemplateLabels, {
  get: (_, key) => (key === "unit" ? { month: "м", week: "н", day: "д", hour: "ч" } : String(key)),
});

const ids = {
  one: "0b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d",
  none: "1b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d",
  two: "2b9a1c8e-1d2f-4a3b-8c4d-5e6f7a8b9c0d",
};
const types = { accrual: "11111111-1111-4111-8111-111111111111", fine: "22222222-2222-4222-8222-222222222222" };

describe("шаблон и загрузка", () => {
  it("оклад и штрафы — из табеля и только для чтения, загрузка берёт премии", async () => {
    const file = await buildTemplate({
      period: { from: "2026-10-01", to: "2026-10-31" },
      labels,
      employees: [
        employee(ids.one, { fines: 50 }),
        employee(ids.none, { pieces: [] }),
        // Новая ставка с 20-го: два куска одной единицы.
        employee(ids.two, { pieces: [piece({ to: "2026-10-19", worked: 13, amount: 2364 }), piece({ from: "2026-10-20", rate: 5000, worked: 8, amount: 1818 })] }),
      ],
      accruals: [{ id: types.accrual, name: "KPI" }],
      deductions: [{ id: types.fine, name: "Опоздания" }],
      autoDeductionId: types.fine,
    });

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file);
    const sheet = book.worksheets[0]!;
    // Колонки: 6 ставка, 7 норма, 8 отработано, 9 оклад, 10 KPI, 11 штрафы.
    expect([6, 7, 8, 9, 11].map((c) => sheet.getCell(6, c).value)).toEqual([4000, 22, 20, 3636, 50]);
    expect(sheet.getCell(7, 9).value).toBeNull();
    expect(sheet.getCell(7, 9).note).toBe("noTimesheet");
    // Разные ставки — клетка пуста, норма и отработано — в примечании по кускам.
    expect([5, 6, 7, 8, 9].map((c) => sheet.getCell(8, c).value)).toEqual(["м", null, null, null, 4182]);
    expect(String(sheet.getCell(8, 9).note)).toContain("20.10–31.10");

    sheet.getCell(6, 10).value = "1 500,5";
    sheet.getCell(6, 9).value = 9999;
    const parsed = await parseImport(
      await book.xlsx.writeBuffer(),
      new Map([
        [types.accrual, { id: types.accrual, kind: "accrual" as const }],
        [types.fine, { id: types.fine, kind: "deduction" as const }],
      ]),
    );
    expect(parsed.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parsed.records).toEqual([{ employeeId: ids.one, typeId: types.accrual, kind: "accrual", amount: 1500.5 }]);
    expect(parsed.skipped).toEqual({ invalidEmployee: 0, negative: 0, unknownType: 0 });
  });
});

describe("timesheetPay", () => {
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
