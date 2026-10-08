import { expect, test } from "vitest";
import { ME, mineField, resolveMe, toConditions, withMine } from "./query";

const mine = { employees: "emp-1" };

test("«Я» превращается в свою строку таблицы связи, и в _id_2 тоже", () => {
  const filters = {
    employees_id: { op: "any" as const, values: [ME] },
    employees_id_2: { op: "any" as const, values: [ME, "emp-9"] },
  };

  expect(toConditions(resolveMe(filters, mine))).toEqual({
    employees_id: ["emp-1"],
    employees_id_2: ["emp-1", "emp-9"],
  });
});

test("без своей строки «Я» не находит ничего, а не снимает фильтр", () => {
  const filters = { employees_id: { op: "any" as const, values: [ME] } };

  expect(toConditions(resolveMe(filters, {}))).toEqual({
    employees_id: ["00000000-0000-0000-0000-000000000000"],
  });
});

test("во view «Я» сохраняется словом: у каждого оно своё", () => {
  expect(toConditions({ employees_id: { op: "any", values: [ME] } })).toEqual({ employees_id: [ME] });
});

test("«Мои» включается по одному полю «кто» и не трогает остальные фильтры", () => {
  const slugs = ["employees_id", "employees_id_2"];
  const status = { op: "any" as const, values: ["won"] };

  const on = withMine({ status }, slugs, "employees_id");
  expect(mineField(on, slugs)).toBe("employees_id");

  const moved = withMine(on, slugs, "employees_id_2");
  expect(moved).toEqual({ status, employees_id_2: { op: "is", values: [ME] } });

  expect(withMine(moved, slugs, undefined)).toEqual({ status });
});

test("«Я и кто-то ещё» — ручной отбор, а не «Мои»", () => {
  expect(mineField({ employees_id: { op: "is", values: [ME, "emp-9"] } }, ["employees_id"])).toBeUndefined();
});
