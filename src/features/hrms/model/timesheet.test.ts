import { expect, test } from "vitest";
import { buildRow, listOf, rangeOf, runsOf, statusOf, stepAnchor, type AttendanceDay, type Leave, type RowInput } from "./timesheet";

const day = (date: string, patch: Partial<AttendanceDay> = {}): AttendanceDay => ({
  id: date,
  date,
  status: "on_time",
  review: "none",
  firstIn: `${date}T04:00:00Z`,
  lastOut: `${date}T13:00:00Z`,
  workedMinutes: 540,
  lateMinutes: 0,
  requestId: "",
  comment: "",
  ...patch,
});

const input = (patch: Partial<RowInput> = {}): RowInput => ({
  dates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"],
  today: "2026-09-18",
  hireDate: "",
  dismissalDate: "",
  planByDate: new Map(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((d) => [d, 480])),
  dayByDate: new Map(),
  leaves: [],
  holidays: new Map(),
  ...patch,
});

test("kinds of a week: worked, late, absent, empty, at work, day off", () => {
  const { cells } = buildRow(
    input({
      dayByDate: new Map([
        ["2026-09-14", day("2026-09-14")],
        ["2026-09-15", day("2026-09-15", { status: "late", lateMinutes: 20, workedMinutes: 460 })],
        ["2026-09-16", day("2026-09-16", { status: "absent", firstIn: "", lastOut: "", workedMinutes: null })],
        ["2026-09-18", day("2026-09-18", { lastOut: "", workedMinutes: null })],
      ]),
    }),
  );
  expect(cells.map((c) => c.kind)).toEqual(["worked", "late", "absent", "empty", "at_work", "day_off"]);
  expect(cells[0]!.overtimeMinutes).toBe(60);
});

test("totals: overtime is a balance, late eats it; absences counted", () => {
  const { totals } = buildRow(
    input({
      dayByDate: new Map([
        ["2026-09-14", day("2026-09-14")],
        ["2026-09-15", day("2026-09-15", { status: "late", lateMinutes: 20, workedMinutes: 460 })],
        ["2026-09-16", day("2026-09-16", { status: "absent", firstIn: "", lastOut: "", workedMinutes: null })],
      ]),
    }),
  );
  expect(totals).toEqual({
    days: 2,
    workedMinutes: 1000,
    planMinutes: 480 * 5,
    lateMinutes: 20,
    overtimeMinutes: 40,
    absences: 1,
  });
});

test("leave takes the day out of the norm; pending leave and mark are flagged", () => {
  const leave: Leave = { id: "r1", title: "Отпуск", code: "О", icon: "", color: "", status: "approved", from: "2026-09-14", to: "2026-09-15" };
  const pending: Leave = { ...leave, id: "r2", status: "pending", from: "2026-09-17", to: "2026-09-17" };
  const { cells, totals } = buildRow(
    input({
      leaves: [leave, pending],
      dayByDate: new Map([["2026-09-16", day("2026-09-16", { review: "pending" })]]),
    }),
  );
  expect(cells[0]!.kind).toBe("leave");
  expect(cells[0]!.leave?.code).toBe("О");
  expect(cells[2]!.counted).toBe(false);
  expect(cells[2]!.pending).toEqual(["mark"]);
  expect(cells[3]!.pendingLeave?.id).toBe("r2");
  expect(totals.planMinutes).toBe(480 * 3);
  expect(totals.days).toBe(0);
});

test("outside employment and holidays", () => {
  const { cells } = buildRow(
    input({ hireDate: "2026-09-15", dismissalDate: "2026-09-17", holidays: new Map([["2026-09-16", "Праздник"]]) }),
  );
  expect(cells.map((c) => c.kind)).toEqual(["outside", "empty", "holiday", "empty", "outside", "outside"]);
});

test("period: month, week from Monday, steps", () => {
  expect(rangeOf("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(rangeOf("week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
  expect(stepAnchor("week", "2026-10-11", -1)).toBe("2026-10-04");
  expect(rangeOf("day", "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11" });
  expect(stepAnchor("day", "2026-10-31", 1)).toBe("2026-11-01");
});

test("calendar: leave days merge into one run, pending leave too; statuses", () => {
  const leave: Leave = { id: "r1", title: "Отпуск", code: "О", icon: "", color: "", status: "approved", from: "2026-09-14", to: "2026-09-15" };
  const pending: Leave = { ...leave, id: "r2", status: "pending", from: "2026-09-17", to: "2026-09-18" };
  const { cells } = buildRow(
    input({
      leaves: [leave, pending],
      dayByDate: new Map([
        ["2026-09-16", day("2026-09-16", { status: "late", lateMinutes: 5 })],
        ["2026-09-18", day("2026-09-18")],
      ]),
    }),
  );
  const runs = runsOf(cells);
  expect(runs.map((run) => (run.kind === "leave" ? `${run.leave.id}×${run.cells.length}` : run.cell.kind))).toEqual([
    "r1×2",
    "late",
    "r2×1",
    "worked",
    "day_off",
  ]);
  expect(cells.map(statusOf)).toEqual(["leave", "leave", "late", null, "ok", null]);
});

test("list: only days with a status up to today, fresh first, problems first within a day", () => {
  const row = (employee: string, days: AttendanceDay[]) => ({
    employee,
    ...buildRow(input({ dayByDate: new Map(days.map((d) => [d.date, d])) })),
  });
  const list = listOf(
    [
      row("a", [day("2026-09-14"), day("2026-09-15", { status: "late", lateMinutes: 5 })]),
      row("b", [
        day("2026-09-15", { status: "absent", firstIn: "", lastOut: "", workedMinutes: null }),
        day("2026-09-16", { status: "late", lateMinutes: 30 }),
      ]),
      row("c", [day("2026-09-16", { status: "late", lateMinutes: 50 }), day("2026-09-21")]),
    ],
    "2026-09-18",
  );
  expect(list.map(({ employee, cell }) => `${employee}:${cell.date.slice(8)}`)).toEqual([
    "c:16",
    "b:16",
    "b:15",
    "a:15",
    "a:14",
  ]);
});
