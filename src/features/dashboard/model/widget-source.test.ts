import { expect, test } from "vitest";
import { newChart, ME } from "@/features/item";
import type { Field, Relation } from "@/features/table";
import { mergeFilters, NOBODY } from "./filters";
import { planWidgetReads, resetWidgetSource, resolveWidgetIdentities } from "./widget-source";

test("Me and a matching global identity intersect after trusted identity resolution", () => {
  const fields = [{ slug: "owner", relationId: "person" }] as Field[];
  const relations = [{ id: "person", toSlug: "employees" }] as Relation[];
  const own = { owner: { op: "is" as const, values: [ME] } };
  expect(mergeFilters(resolveWidgetIdentities(own, fields, relations, { employees: "a" }), { owner: { op: "is", values: ["a"] } })).toEqual({ owner: { op: "is", values: ["a"] } });
  expect(mergeFilters(resolveWidgetIdentities(own, fields, relations, {}), { owner: { op: "is", values: ["a"] } })).toEqual({ guid: { op: "is", values: [NOBODY] } });
  expect(mergeFilters(resolveWidgetIdentities(own, fields, relations, { employees: "b" }), { owner: { op: "is", values: ["a"] } })).toEqual({ guid: { op: "is", values: [NOBODY] } });
});
test("changing source clears every table-dependent setting without mutating the old widget", () => {
  const widget = { ...newChart(), tableSlug: "a", type: "records" as const, filters: { owner: { op: "is" as const, values: ["a"] } }, answers: { period: { field: "old_date" } }, columns: ["old"], columnWidths: { old: 200 }, sorts: [{ field: "old", direction: "desc" as const }], currencySlug: "old_currency", valueSlug: "old_amount" };
  const next = resetWidgetSource(widget, "b");
  expect(next).toMatchObject({ type: "records", tableSlug: "b", filters: {}, answers: {}, groupSlug: "", splitSlug: "", valueSlug: "" });
  for (const key of ["columns", "columnWidths", "sorts", "currencySlug"]) expect(next).not.toHaveProperty(key);
  expect(widget.columns).toEqual(["old"]);
});

test("read planning schedules no reference requests for denied fields/tables", () => {
  const widget = { ...newChart(), tableSlug: "deals", kind: "stat" as const, aggregation: "sum" as const, valueSlug: "amount", filters: {}, answers: { locations: { field: "owner", via: "location" } } };
  const fields = [{ slug: "amount" }, { slug: "owner", relationId: "person" }] as Field[];
  const relations = [{ id: "person", toSlug: "employees" }] as Relation[];
  const filters = [{ kind: "record" as const, label: "Branch", table: "locations", sourceTable: "employees", sourceField: "location" }];
  const values = { locations: ["l1"] }, related = { employees: [{ slug: "location", type: "LOOKUP" }] as Field[] };
  const allowed = planWidgetReads(widget, {}, filters, values, fields, relations, related, () => true, {});
  expect(allowed.forbidden).toBe(false); expect(allowed.lookups).toHaveLength(1);
  for (const plan of [
    planWidgetReads(widget, {}, filters, values, fields.filter((field) => field.slug !== "amount"), relations, related, () => true, {}),
    planWidgetReads(widget, {}, filters, values, fields, relations, { employees: [] }, () => true, {}),
    planWidgetReads(widget, {}, filters, values, fields, relations, related, (table) => table !== "locations", {}),
  ]) { expect(plan.forbidden).toBe(true); expect(plan.lookups).toEqual([]); }
});

test("mandatory dataset and selection fields cannot be masked by inactive card filters", () => {
  const widget = { ...newChart(), kind: "stat" as const, tableSlug: "events", filters: { private_status: { op: "any" as const, values: [] } }, answers: {} };
  const mandatory = { private_status: { op: "any" as const, values: ["Done"] } };
  const plan = planWidgetReads(widget, {}, [], {}, [], [], {}, () => true, {}, undefined, [mandatory]);
  expect(plan.forbidden).toBe(true);
  expect(plan.lookups).toEqual([]);
  const selected = { private_status: { op: "is" as const, values: ["Done"] } };
  expect(planWidgetReads(widget, {}, [], {}, [], [], {}, () => true, {}, undefined, [selected]).forbidden).toBe(true);
});
