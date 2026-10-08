import { expect, test } from "vitest";
import { daysOpen, deadlineState, plusDays } from "./vacancy-dates";

test("открыта — до сегодня, закрытая — до даты закрытия", () => {
  expect(daysOpen("2026-06-16", "", "2026-10-08")).toBe(114);
  expect(daysOpen("2026-06-15", "2026-06-25", "2026-10-08")).toBe(10);
  expect(daysOpen("2026-10-10", "", "2026-10-08")).toBe(0);
  expect(daysOpen("", "", "2026-10-08")).toBeNull();
});

test("дедлайн: просрочен, близко, далеко, у закрытой — молчит", () => {
  expect(deadlineState("2026-10-01", "open", "2026-10-08")).toEqual({ kind: "overdue", days: 7 });
  expect(deadlineState("2026-10-15", "open", "2026-10-08")).toEqual({ kind: "soon", days: 7 });
  expect(deadlineState("2026-10-08", "open", "2026-10-08")).toEqual({ kind: "soon", days: 0 });
  expect(deadlineState("2026-10-16", "open", "2026-10-08")).toBeNull();
  expect(deadlineState("2026-10-01", "closed", "2026-10-08")).toBeNull();
  expect(deadlineState("", "open", "2026-10-08")).toBeNull();
});

test("плюс дни — через границу месяца и года", () => {
  expect(plusDays("2026-10-08", 30)).toBe("2026-11-07");
  expect(plusDays("2026-12-20", 45)).toBe("2027-02-03");
});
