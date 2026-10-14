import type { Field } from "@/features/table";
import { resolveWidgetIdentities } from "./widget-source";
import { expect, test } from "vitest";
import { toRequestBody } from "@/features/item";
import { setTimeZone } from "@/shared/lib/date-value";
import { intersectFilter, mergeFilters, NOBODY, rangeValues, widgetFilters } from "./filters";

test("a global reference filter narrows the saved widget constraint", () => {
  expect(widgetFilters({ owner: { op: "is", values: ["a", "b"] } }, { employees: { field: "owner" } }, [{ kind: "record", label: "Owner", table: "employees", sourceTable: "deals", sourceField: "owner" }], { employees: ["b", "c"] }, {}, () => NOBODY)).toEqual({ owner: { op: "is", values: ["b"] } });
});
test("contradictory saved/viewer constraints return no items rather than all", () => {
  const filters = mergeFilters({ owner: { op: "is", values: ["a"] } }, { owner: { op: "is", values: ["b"] } });
  expect(toRequestBody({ limit: 20, page: 1, filters })).toEqual({ guid: [NOBODY], limit: 20, offset: 0 });
});
test("numeric bounds preserve exclusive endpoints in the supported API body", () => {
  const filters = mergeFilters({ amount: { op: "between", values: ["2", "20"] } }, { amount: { op: "after", values: ["10"] } });
  expect(toRequestBody({ limit: 20, page: 1, filters })).toEqual({ amount: { $gt: "10", $lte: "20" }, limit: 20, offset: 0 });
  expect(intersectFilter({ op: "between", values: ["2", "10"] }, { op: "after", values: ["10"] })).toBeNull();
});
test("global period intersects the widget's saved date range", () => {
  const filters = widgetFilters({ date: { op: "between", values: ["2026-10-03", "2026-10-04T23:59:59.999"] } }, { period: { field: "date" } }, [{ kind: "period", label: "Date" }], { period: ["custom", "2026-10-01", "2026-10-10"] }, {}, () => NOBODY);
  expect(toRequestBody({ limit: 20, page: 1, filters }).date).toEqual({ $gte: "2026-10-03", $lte: "2026-10-04T23:59:59.999" });
});
test("unrepresentable regex/set conjunctions are blocked, never overwritten", () => {
  expect(() => mergeFilters({ title: { op: "contains", values: ["one"] } }, { title: { op: "contains", values: ["two"] } })).toThrow("dashboard.filterConflict");
  expect(() => intersectFilter({ op: "any", values: ["a"] }, { op: "any", values: ["b"] })).toThrow();
});

test("timestamp periods follow the user's timezone across a DST transition", () => {
  setTimeZone("America/New_York");
  try {
    expect(rangeValues({ from: new Date(2026, 2, 8), to: new Date(2026, 2, 8) }, true)).toEqual(["2026-03-08T05:00:00.000Z", "2026-03-09T03:59:59.999Z"]);
    expect(rangeValues({ from: new Date(2026, 2, 8), to: new Date(2026, 2, 8) })).toEqual(["2026-03-08", "2026-03-08T23:59:59.999"]);
  } finally { setTimeZone(undefined); }
});

test("scalar Status normalizes any-of before intersection; array roles remain conservative", () => {
  const fields = [{ slug: "stage", type: "STATUS" }] as Field[];
  const normalized = (values: string[]) => resolveWidgetIdentities({ stage: { op: "any", values } }, fields, [], {});
  expect(mergeFilters(normalized(["Done", "New"]), { stage: { op: "is", values: ["Done"] } })).toEqual({ stage: { op: "is", values: ["Done"] } });
  expect(mergeFilters(normalized(["Done"]), normalized(["New"]))).toEqual({ guid: { op: "is", values: [NOBODY] } });
});
