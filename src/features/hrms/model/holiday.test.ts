import { describe, expect, it } from "vitest";
import { dayKind, daysOffBy, yearStats, type Mark } from "./holiday";

describe("holiday calendar", () => {
  it("counts a year with a holiday and a working weekend", () => {
    const marks = new Map<string, { type: Mark }>([
      ["2026-03-09", { type: "holiday" }], // понедельник
      ["2026-03-28", { type: "working_weekend" }], // суббота
    ]);
    expect(dayKind("2026-03-07", marks)).toBe("weekend");
    expect(dayKind("2026-03-10", marks)).toBe("workday");
    // В 2026 году 261 будний день: минус праздник, плюс отработка.
    expect(yearStats(2026, marks)).toEqual({ work: 261, hours: 2088, off: 104, holidays: 1, transfers: 1 });
  });
});

describe("daysOffBy", () => {
  it("a branch calendar for the year replaces the company one", () => {
    const of = daysOffBy([
      { date: "2026-03-21", name: "Навруз", type: "holiday", locationId: "" },
      { date: "2026-03-28", name: "Отработка", type: "working_weekend", locationId: "" },
      { date: "2026-08-15", name: "День города", type: "holiday", locationId: "sam" },
      { date: "2027-03-21", name: "Навруз", type: "holiday", locationId: "" },
    ]);
    expect([...of("").keys()]).toEqual(["2026-03-21", "2027-03-21"]);
    // В 2026 у Самарканда свой календарь, в 2027 — нет.
    expect([...of("sam").keys()]).toEqual(["2026-08-15", "2027-03-21"]);
    expect([...of("tash").keys()]).toEqual(["2026-03-21", "2027-03-21"]);
  });
});
