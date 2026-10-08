import { expect, test } from "vitest";
import { onlyChoice, type Connection } from "./types";

const connection = (id: string, options: string[]): Connection => ({
  id,
  tableSlug: id,
  options: options.map((option) => ({ id: option, label: option })),
});

test("у каждой связи одна запись — выбирать нечего, вход сразу", () => {
  expect(onlyChoice([connection("employees", ["e1"])])).toEqual({ employees: "e1" });
});

test("где вариантов несколько или нет вовсе — экран выбора", () => {
  expect(onlyChoice([connection("employees", ["e1"]), connection("shops", ["s1", "s2"])])).toBeNull();
  expect(onlyChoice([connection("employees", [])])).toBeNull();
});
