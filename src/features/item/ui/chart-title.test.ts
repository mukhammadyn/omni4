import { expect, test } from "vitest";
import type { Field } from "@/features/table";
import { newChart } from "../model/chart";
import { chartTitle } from "./ChartView";

const field = (slug: string, label: string) => ({ slug, label, labels: {} }) as unknown as Field;
const columns = [field("dept", "Отделы"), field("salary", "Оклад"), field("sex", "Пол")];
const t = (key: string) => ({ "pivot.aggregation.count": "Количество", "pivot.aggregation.sum": "Сумма" })[key] ?? key;

test("сначала поле разбивки, потом расчёт", () => {
  expect(chartTitle({ ...newChart(), groupSlug: "dept" }, columns, "ru", t)).toBe("Отделы · Количество");
  expect(
    chartTitle(
      { ...newChart(), groupSlug: "dept", aggregation: "sum", valueSlug: "salary", splitSlug: "sex" },
      columns,
      "ru",
      t,
    ),
  ).toBe("Отделы · Сумма Оклад × Пол");
});

test("у числа разбивки нет — только расчёт", () => {
  expect(chartTitle({ ...newChart(), kind: "stat", groupSlug: "dept" }, columns, "ru", t)).toBe("Количество");
});
