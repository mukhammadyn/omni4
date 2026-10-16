import { describe, expect, it } from "vitest";
import { buildPayPivot, compactSum, type PayLine } from "./payroll";

const line = (over: Partial<PayLine>): PayLine => ({
  employeeId: "e1",
  employee: "Борисов",
  photo: "",
  dept: "DEV",
  typeId: "salary",
  typeName: "Оклад",
  typeOrder: 7,
  kind: "accrual",
  amount: 0,
  ...over,
});

describe("buildPayPivot", () => {
  it("складывает по сотруднику и виду, удержания отдельно", () => {
    const pivot = buildPayPivot(
      [
        line({ amount: 1000 }),
        line({ amount: 500 }),
        line({ typeId: "kpi", typeName: "KPI", typeOrder: 3, amount: 200 }),
        line({ typeId: "late", typeName: "Опоздания", kind: "deduction", amount: 100 }),
        line({ employeeId: "e2", employee: "Алиев", amount: 300 }),
      ],
      false,
    );
    expect(pivot.accruals.map((c) => c.id)).toEqual(["kpi", "salary"]);
    expect(pivot.deductions.map((c) => c.id)).toEqual(["late"]);
    expect(pivot.rows.map((r) => r.id)).toEqual(["e2", "e1"]);
    expect(pivot.rows[1]).toMatchObject({ accrued: 1700, deducted: 100, cells: { salary: 1500, kpi: 200, late: 100 } });
    expect(pivot.total).toMatchObject({ accrued: 2000, deducted: 100, cells: { salary: 1800 } });
  });

  it("прячет строки с нулями", () => {
    expect(buildPayPivot([line({ amount: 0 })], true).rows).toEqual([]);
  });
});

it("compactSum", () => {
  expect([compactSum(1_250_000), compactSum(720_000), compactSum(-1500), compactSum(12)]).toEqual(["1.3M", "720k", "-1.5k", "12"]);
});
