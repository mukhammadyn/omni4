import { describe, expect, it } from "vitest";
import { dayFines, type FineDay, type PolicyRules } from "./penalty";

const rules: PolicyRules = {
  late: { on: true, steps: [{ minutes: 15, amount: 15000 }, { minutes: 30, amount: 30000 }, { minutes: 60, amount: 60000 }] },
  early_leave: { on: false, steps: [{ minutes: 15, amount: 15000 }] },
  no_checkout: { on: true, steps: [{ minutes: 0, amount: 20000 }] },
  absence: { on: true, steps: [{ minutes: 0, amount: 100000 }] },
};
const day = (extra: Partial<FineDay>): FineDay => ({
  date: "2026-10-06",
  status: "on_time",
  lateMinutes: 0,
  earlyMinutes: 0,
  firstIn: "x",
  lastOut: "y",
  ...extra,
});

describe("dayFines", () => {
  it("опоздание — по наибольшему достигнутому порогу; ниже первого — без штрафа", () => {
    expect(dayFines(day({ lateMinutes: 10 }), rules, "2026-10-22")).toEqual([]);
    expect(dayFines(day({ lateMinutes: 45 }), rules, "2026-10-22").map((f) => f.amount)).toEqual([30000]);
    expect(dayFines(day({ lateMinutes: 100 }), rules, "2026-10-22").map((f) => f.amount)).toEqual([60000]);
  });

  it("выключенный вид не штрафует, прогул — одна сумма, уход без отметки — только за прошлые дни", () => {
    expect(dayFines(day({ earlyMinutes: 90 }), rules, "2026-10-22")).toEqual([]);
    expect(dayFines(day({ status: "absent", firstIn: "" }), rules, "2026-10-22").map((f) => f.violation)).toEqual(["absence"]);
    expect(dayFines(day({ lastOut: "" }), rules, "2026-10-22").map((f) => f.violation)).toEqual(["no_checkout"]);
    expect(dayFines(day({ lastOut: "", date: "2026-10-22" }), rules, "2026-10-22")).toEqual([]);
  });
});
