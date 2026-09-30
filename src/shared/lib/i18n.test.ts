import { expect, test } from "vitest";
import { perLanguage } from "./i18n";

test("ключ на языке данных — только при коде языка; без языков значение идёт в базовую колонку", () => {
  expect(perLanguage("label_", "ru", "Продажи")).toEqual({ label_ru: "Продажи" });
  // Проект без языков данных: `label_` без кода был бы мусором в attributes.
  expect(perLanguage("label_", "", "Продажи")).toEqual({});
});
