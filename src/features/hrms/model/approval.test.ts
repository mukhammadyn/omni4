import { expect, test } from "vitest";
import { decisionWrites, progressOf, routeFor, type Route } from "./approval";

const route = (patch: Partial<Route>): Route => ({
  id: "r",
  name: "Маршрут",
  requestType: "absence",
  departmentId: "d1",
  absenceTypeId: "",
  active: true,
  steps: [1, 2],
  ...patch,
});

test("route: same kind and department, type-specific wins, no department never matches", () => {
  const general = route({ id: "general" });
  const vacation = route({ id: "vacation", absenceTypeId: "t-vac" });
  const orphan = route({ id: "orphan", departmentId: "" });
  const off = route({ id: "off", departmentId: "d2", active: false });
  const routes = [general, vacation, orphan, off];
  expect(routeFor({ type: "absence", departmentId: "d1", absenceTypeId: "t-vac" }, routes)?.id).toBe("vacation");
  expect(routeFor({ type: "absence", departmentId: "d1", absenceTypeId: "t-sick" }, routes)?.id).toBe("general");
  expect(routeFor({ type: "absence", departmentId: "d2", absenceTypeId: "" }, routes)).toBeNull();
  expect(routeFor({ type: "late_arrival", departmentId: "d1", absenceTypeId: "" }, routes)).toBeNull();
});

test("progress and what a decision writes", () => {
  const two = route({});
  const start = progressOf(two, []);
  expect(start).toEqual({ done: 0, total: 2, next: 1 });
  expect(decisionWrites(two, start, "approved")).toEqual({ step: 1, status: null });

  const half = progressOf(two, [{ step: 1, decision: "approved" }]);
  expect(half).toEqual({ done: 1, total: 2, next: 2 });
  expect(decisionWrites(two, half, "approved")).toEqual({ step: 2, status: "approved" });
  expect(decisionWrites(two, half, "rejected")).toEqual({ step: 2, status: "rejected" });

  // Без маршрута — сразу итог, шаг не пишется.
  expect(decisionWrites(null, null, "approved")).toEqual({ step: null, status: "approved" });
});
