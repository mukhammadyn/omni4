import type { Field } from "@/features/table";
import { expect, test } from "vitest";
import { newChart } from "@/features/item";
import { currencyField, currencyGroups } from "./currency";

test("different and missing currencies never become one financial series", () => {
  const usd = { amount: 100, currency: "USD" }, uzs = { amount: 1000000, currency: "UZS" }, missing = { amount: 999 };
  const groups = currencyGroups([usd, uzs, missing], [{ amount: 50, currency: "EUR" }], "currency");
  expect(groups.filter((g) => g.valid).map((g) => [g.currency, g.rows.map((r) => r.amount), g.previous?.map((r) => r.amount)])).toEqual([["EUR", [], [50]], ["USD", [100], []], ["UZS", [1000000], []]]);
  expect(groups.find((g) => !g.valid)?.rows).toEqual([missing]);
});
test("a monetary amount without a currency mapping is blocked", () => {
  const widget = { ...newChart(), tableSlug: "deals", filters: {}, answers: {}, aggregation: "sum" as const, valueSlug: "amount" };
  expect(currencyField(widget, [])).toEqual({ slug: "", required: true });
  expect(currencyField({ ...widget, currencySlug: "unit" }, [])).toEqual({ slug: "unit", required: false });
  expect(currencyField({ ...widget, aggregation: "count" }, [])).toEqual({ slug: "", required: false });
});

test("monetary numeric roles retain currency partitions and a required unit", () => {
  const raw = { ...newChart(), tableSlug: "events", filters: {}, answers: {}, kind: "scatter" as const, xSlug: "amount", ySlug: "quantity" };
  expect(currencyField(raw, [{ slug: "amount", type: "NUMBER" }, { slug: "currency", type: "SINGLE_LINE" }] as Field[])).toEqual({ slug: "currency", required: false });
  expect(currencyField(raw, [{ slug: "amount", type: "NUMBER" }] as Field[])).toEqual({ slug: "", required: true });
});
