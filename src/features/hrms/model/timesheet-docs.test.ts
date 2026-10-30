import { describe, expect, it } from "vitest";
import { hoursOf, planFill, summarize, workDaysOf } from "./timesheet-docs";

const totals = (worked: number, overtime: number, absences: number) => ({
  days: 0, workedMinutes: worked, planMinutes: 0, planDays: 0, lateMinutes: 0, overtimeMinutes: overtime, absences,
});

describe("summarize", () => {
  it("sums by department", () => {
    const out = summarize([
      { departmentId: "d1", totals: totals(480, 30, 1) },
      { departmentId: "d1", totals: totals(240, 0, 0) },
      { departmentId: "", totals: totals(60, 0, 2) },
    ]);
    expect(out.get("d1")).toEqual({ people: 2, workedMinutes: 720, overtimeMinutes: 30, absences: 1 });
    expect(out.get("")?.absences).toBe(2);
  });
});

describe("workDaysOf", () => {
  it("skips weekends and holidays", () => {
    // 2026-10-01 — четверг; 1–4 октября: Чт, Пт, Сб, Вс.
    expect(workDaysOf(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"], new Map([["2026-10-02", "x"]]))).toBe(1);
  });
});

describe("hoursOf", () => {
  it("rounds to one decimal", () => expect(hoursOf(125)).toBe(2.1));
});

describe("planFill", () => {
  it("creates, updates drafts, keeps approved", () => {
    expect(
      planFill(
        [
          { guid: "a", departmentId: "d1", status: "draft" },
          { guid: "b", departmentId: "d2", status: "approved" },
        ],
        ["d1", "d2", "d3"],
      ),
    ).toEqual({ create: ["d3"], update: [{ guid: "a", departmentId: "d1" }], locked: ["d2"] });
  });
});
