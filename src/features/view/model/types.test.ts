import { expect, test } from "vitest";
import { VIEW_TYPES, traitsOf } from "./types";

/*
 * Признаки типа выводят все наборы (ADR-0016). Тест ловит тип, дописанный
 * не во все нужные признаки: каждая строка — правило, на котором
 * держится какой-то экран.
 */
test.each(VIEW_TYPES)("%s: признаки согласованы", (type) => {
  const traits = traitsOf(type);
  // Вкладка связи и фиксированный экран — только у того, что нарисовано.
  if (traits.inTabs || traits.fixed) expect(traits.implemented).toBe(true);
  // Фиксированный экран сделан под одну таблицу — во вкладке чужой связи ему не место.
  if (traits.fixed) expect(traits.inTabs).toBeUndefined();
  // Сам грузит данные только экран модуля: обычный view берёт общий запрос строк.
  if (traits.selfLoading) expect(traits.fixed).toBe(true);
  // Без колонок группировать нечего.
  if (traits.columnless) expect(traits.noGrouping).toBe(true);
});

test("незнакомый тип — без признаков", () => {
  expect(traitsOf("WEBPAGE")).toEqual({});
});
