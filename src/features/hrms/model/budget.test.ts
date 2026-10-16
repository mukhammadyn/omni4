import { describe, expect, it } from "vitest";
import { fullSum, groupByDept, parseNumber, parseSum, periods, sumOf, type BudgetLine } from "./budget";

const line = (over: Partial<BudgetLine>): BudgetLine => ({
  id: "l1",
  deptId: "d1",
  dept: "Разработка",
  name: "Алиев",
  photo: "",
  position: "",
  vacancy: false,
  status: "working",
  tax: 12,
  bonus: 0,
  order: 0,
  plan: Array(12).fill(0),
  fact: Array(12).fill(null),
  amountIds: Array(12).fill(null),
  ...over,
});

describe("budget", () => {
  it("периоды: месяцы и кварталы с годом в конце", () => {
    const today = new Date(2026, 9, 16);
    const months = periods("m", 2026, today);
    expect(months).toHaveLength(13);
    expect(months.find((p) => p.current)?.key).toBe("9");
    const quarters = periods("q", 2026, today);
    expect(quarters.map((p) => p.key)).toEqual(["q0", "q1", "q2", "q3", "Y"]);
    expect(quarters.find((p) => p.current)?.key).toBe("q3");
    expect(periods("m", 2025, today).some((p) => p.current)).toBe(false);
  });

  it("сумма: факт отличает пустоту от нуля, налоги и бонус — множителем", () => {
    const plan = Array(12).fill(1000);
    const fact = [1000, 0, ...Array(10).fill(null)];
    const lines = [line({ plan, fact, tax: 10, bonus: 10 })];
    expect(sumOf(lines, [0, 1, 2])).toEqual({ plan: 3000, fact: 1000, hasFact: true });
    expect(sumOf(lines, [2])).toEqual({ plan: 1000, fact: 0, hasFact: false });
    expect(sumOf(lines, [0], true)).toEqual({ plan: 1200, fact: 1200, hasFact: true });
  });

  it("группировка по отделам", () => {
    const groups = groupByDept([
      line({ id: "a", deptId: "d2", dept: "Продажи" }),
      line({ id: "b", order: 2 }),
      line({ id: "c", order: 1 }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Продажи", "Разработка"]);
    expect(groups[1]!.lines.map((l) => l.id)).toEqual(["c", "b"]);
  });

  it("формат и разбор суммы", () => {
    expect(fullSum(14000000)).toBe("14 000 000");
    expect(fullSum(-1500)).toBe("−1 500");
    expect(parseSum("14 000 000")).toBe(14000000);
    expect(parseSum("14,5м")).toBe(14500000);
    expect(parseSum("900k")).toBe(900000);
    expect(parseSum("")).toBeNull();
    expect(parseSum("abc")).toBeNull();
    expect(parseNumber("12,5")).toBe(12.5);
  });
});
