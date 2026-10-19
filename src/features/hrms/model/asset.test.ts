import { expect, test } from "vitest";
import { issuedSince, money, movesFrom, movesToLog, targetOf, totals, warrantyDays } from "./asset";

test("действия по статусу — кнопки прототипа", () => {
  expect(movesFrom("in_stock")).toEqual(["issued", "sent_to_repair", "written_off"]);
  expect(movesFrom("assigned")).toEqual(["returned", "sent_to_repair", "written_off"]);
  expect(movesFrom("repair")).toEqual(["returned_from_repair", "written_off"]);
  expect(movesFrom("written_off")).toEqual(["received"]);
  expect(movesFrom(undefined)).toEqual(movesFrom("in_stock"));
  expect(targetOf("sent_to_repair")).toBe("repair");
  expect(targetOf("changed")).toBeUndefined();
});

test("журнал: в ремонт с рук — сначала возврат от владельца", () => {
  expect(movesToLog("sent_to_repair", "e1")).toEqual([
    { action: "returned", employee: "e1" },
    { action: "sent_to_repair", employee: "" },
  ]);
  expect(movesToLog("returned", "e1")).toEqual([{ action: "returned", employee: "e1" }]);
  expect(movesToLog("written_off", "")).toEqual([{ action: "written_off", employee: "" }]);
});

test("гарантия, суммы по валютам, деньги, дата выдачи", () => {
  const today = new Date(2026, 9, 19);
  expect(warrantyDays("2026-10-29", today)).toBe(10);
  expect(warrantyDays("2026-10-01", today)).toBe(-18);
  expect(warrantyDays(null, today)).toBeNull();
  expect(totals([{ cost: 100, currency: "USD" }, { cost: 5e6 }, { cost: 50, currency: "USD" }, { cost: null }])).toEqual([
    { currency: "USD", sum: 150 },
    { currency: "UZS", sum: 5e6 },
  ]);
  expect(money(12500000)).toBe("12 500 000");
  expect(
    issuedSince(
      [
        { action: "issued", hr_employees_id: "e1", date: "2026-01-02" },
        { action: "issued", hr_employees_id: "e1", date: "2026-05-02" },
        { action: "issued", hr_employees_id: "e2", date: "2026-09-02" },
      ],
      "e1",
    ),
  ).toBe("2026-05-02");
});
