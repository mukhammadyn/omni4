import { expect, test } from "vitest";
import { gradeIssue, monthsBetween, type Band } from "./job-history";

const bands: Band[] = [
  { positionId: "dev", gradeId: "d1", gradeName: "D1", max: 8_000_000, from: "2024-01-01" },
  { positionId: "dev", gradeId: "d2", gradeName: "D2", max: 12_000_000, from: "2024-01-01" },
  { positionId: "dev", gradeId: "d2", gradeName: "D2", max: 14_000_000, from: "2025-01-01" },
];

test("должности нет в матрице — сверять не с чем", () => {
  expect(gradeIssue({ positionId: "cto", gradeId: "", salary: 50_000_000 }, bands)).toBeNull();
});

test("грейд не указан — называем допустимые", () => {
  expect(gradeIssue({ positionId: "dev", gradeId: "", salary: null }, bands)).toEqual({
    kind: "noGrade",
    allowed: ["D1", "D2"],
  });
});

test("грейда нет в матрице для должности", () => {
  expect(gradeIssue({ positionId: "dev", gradeId: "d5", salary: null }, bands)).toEqual({
    kind: "notAllowed",
  });
});

test("оклад выше потолка последней версии матрицы", () => {
  expect(gradeIssue({ positionId: "dev", gradeId: "d2", salary: 13_000_000 }, bands)).toBeNull();
  expect(gradeIssue({ positionId: "dev", gradeId: "d2", salary: 15_000_000 }, bands)).toEqual({
    kind: "overCeiling",
    ceiling: 14_000_000,
  });
});

test("неполный месяц не считается", () => {
  expect(monthsBetween(new Date(2023, 10, 24), new Date(2026, 9, 7))).toBe(34);
  expect(monthsBetween(new Date(2026, 9, 7), new Date(2026, 9, 1))).toBe(0);
});
