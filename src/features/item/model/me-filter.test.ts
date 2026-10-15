import { expect, test } from "vitest";
import { ME, mineField, resolveMe, toConditions, withMine } from "./query";

const mine = { core_users: "emp-1" };

test("«Я» превращается в свою строку таблицы связи, и в _id_2 тоже", () => {
  const filters = {
    core_users_id: { op: "any" as const, values: [ME] },
    core_users_id_2: { op: "any" as const, values: [ME, "emp-9"] },
  };

  expect(toConditions(resolveMe(filters, mine))).toEqual({
    core_users_id: ["emp-1"],
    core_users_id_2: ["emp-1", "emp-9"],
  });
});

test("без своей строки «Я» не находит ничего, а не снимает фильтр", () => {
  const filters = { core_users_id: { op: "any" as const, values: [ME] } };

  expect(toConditions(resolveMe(filters, {}))).toEqual({
    core_users_id: ["00000000-0000-0000-0000-000000000000"],
  });
});

test("во view «Я» сохраняется словом: у каждого оно своё", () => {
  expect(toConditions({ core_users_id: { op: "any", values: [ME] } })).toEqual({ core_users_id: [ME] });
});

test("«Мои» включается по одному полю «кто» и не трогает остальные фильтры", () => {
  const slugs = ["core_users_id", "core_users_id_2"];
  const status = { op: "any" as const, values: ["won"] };

  const on = withMine({ status }, slugs, "core_users_id");
  expect(mineField(on, slugs)).toBe("core_users_id");

  const moved = withMine(on, slugs, "core_users_id_2");
  expect(moved).toEqual({ status, core_users_id_2: { op: "is", values: [ME] } });

  expect(withMine(moved, slugs, undefined)).toEqual({ status });
});

test("«Я и кто-то ещё» — ручной отбор, а не «Мои»", () => {
  expect(mineField({ core_users_id: { op: "is", values: [ME, "emp-9"] } }, ["core_users_id"])).toBeUndefined();
});
