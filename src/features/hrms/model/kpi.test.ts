import { describe, expect, it } from "vitest";
import { aggregate, childPeriods, coefficientOf, columnsOf, completion, lastPeriods, periodOf, ratingOf, scoreOf, shiftPeriod, splitTarget, typeOfRange, weeksOfMonth } from "./kpi";

describe("kpi", () => {
  it("completion by direction", () => {
    expect(completion(100, 120, "up")).toBe(120);
    expect(completion(10, 20, "down")).toBe(50);
    expect(completion(10, 0, "down")).toBe(120);
    expect(completion(0, 5, "up")).toBe(0);
    expect(completion(100, null, "up")).toBe(0);
  });
  it("score caps at 120%", () => {
    expect(scoreOf(30, 150)).toBe(36);
    expect(scoreOf(30, 50)).toBe(15);
  });
  it("coefficient and rating", () => {
    expect(coefficientOf(110)).toBe(1.2);
    expect(coefficientOf(84)).toBe(0.5);
    expect(coefficientOf(69)).toBe(0);
    expect(ratingOf(85)).toBe("meets");
  });
  it("periods", () => {
    expect(periodOf("quarterly", "2026-11-03")).toEqual({ type: "quarterly", start: "2026-10-01", end: "2026-12-31" });
    expect(periodOf("monthly", "2028-02-10").end).toBe("2028-02-29");
    // 2026-10-21 — среда; неделя пн 19 – пт 23.
    expect(periodOf("weekly", "2026-10-21")).toEqual({ type: "weekly", start: "2026-10-19", end: "2026-10-23" });
    expect(periodOf("weekly", "2026-10-25").start).toBe("2026-10-19");
    expect(shiftPeriod(periodOf("quarterly", "2026-02-01"), -1).start).toBe("2025-10-01");
    expect(lastPeriods("quarterly", "2026-02-10", 3).map((p) => p.start)).toEqual(["2025-07-01", "2025-10-01", "2026-01-01"]);
  });
  it("weeks of month: ≥3 weekdays inside", () => {
    // Октябрь 2026: 1-е — четверг (2 рабочих дня) → первая неделя с 5-го; 26–30 — внутри.
    expect(weeksOfMonth(2026, 9).map((w) => w.start)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    // Сентябрь 2026: 1-е — вторник (4 дня) → неделя с 31.08 — сентябрьская.
    expect(weeksOfMonth(2026, 8)[0]!.start).toBe("2026-08-31");
  });
  it("columns and range type", () => {
    expect(columnsOf("monthly", periodOf("quarterly", "2026-11-01")).map((p) => p.start)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(columnsOf("quarterly", periodOf("yearly", "2026-05-01"))).toHaveLength(4);
    expect(typeOfRange("2026-10-19", "2026-10-23")).toBe("weekly");
    expect(typeOfRange("2026-02-01", "2026-02-28")).toBe("monthly");
    expect(typeOfRange("2026-10-01", "2026-12-31")).toBe("quarterly");
    expect(typeOfRange("2026-01-01", "2026-12-31")).toBe("yearly");
  });
});

describe("parent kpi", () => {
  it("aggregate", () => {
    expect(aggregate([1, 2, null], "sum")).toBe(3);
    expect(aggregate([4, 2], "min")).toBe(2);
    expect(aggregate([4, 2], "max")).toBe(4);
    expect(aggregate([1, 2], "avg")).toBe(1.5);
    expect(aggregate([null], "sum")).toBeNull();
  });
  it("children and split", () => {
    expect(childPeriods(periodOf("yearly", "2026-05-01")).map((p) => p.type)).toEqual(["quarterly", "quarterly", "quarterly", "quarterly"]);
    expect(childPeriods(periodOf("quarterly", "2026-11-01")).map((p) => p.start)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(childPeriods(periodOf("weekly", "2026-10-21")).map((p) => p.start)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(childPeriods(periodOf("daily", "2026-10-21"))).toEqual([]);
    expect(typeOfRange("2026-10-21", "2026-10-21")).toBe("daily");
    expect(splitTarget(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });
});
