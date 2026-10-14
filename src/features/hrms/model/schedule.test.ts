import { expect, test } from "vitest";
import {
  blankTemplate,
  datesOfForm,
  draftsOfForm,
  endOf,
  expandTemplate,
  formOfSeries,
  plannedOf,
  rewriteSeries,
  weekMinutesOf,
  weekdayOf,
  type Shift,
  type ShiftForm,
} from "./schedule";

const none = new Set<string>();

test("time: overnight span, break only on long shifts, hours mode", () => {
  expect(plannedOf("20:00", "08:00", 60)).toBe(660);
  expect(plannedOf("09:00", "13:00", 60)).toBe(240);
  expect(endOf({ mode: "hours", start: "09:00", end: "", hours: 8 })).toBe("18:00");
  expect(endOf({ mode: "hours", start: "09:00", end: "", hours: 4 })).toBe("13:00");
  expect(weekdayOf("2026-10-12")).toBe(0);
  expect(weekdayOf("2026-10-18")).toBe(6);
});

test("weekly template: working days, skips holidays; hours per week", () => {
  const template = blankTemplate();
  const days = expandTemplate(template, ["a"], { from: "2026-10-12", to: "2026-10-18", holidays: new Set(["2026-10-14"]), offset: false });
  expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]);
  expect(weekMinutesOf(template)).toBe(5 * 480);
});

test("cycle template: 2 on 2 off, offset staggers employees, ignores holidays", () => {
  const template = { ...blankTemplate(), type: "cycle" as const };
  const days = expandTemplate(template, ["a", "b"], { from: "2026-10-01", to: "2026-10-06", holidays: new Set(["2026-10-01"]), offset: true });
  const of = (id: string) => days.filter((d) => d.employeeId === id).map((d) => d.date.slice(8));
  expect(of("a")).toEqual(["01", "02", "05", "06"]);
  expect(of("b")).toEqual(["03", "04"]);
  expect(weekMinutesOf(template)).toBe(Math.round((660 * 7 * 2) / 4));
});

const form = (patch: Partial<ShiftForm> = {}): ShiftForm => ({
  employeeIds: ["a", "b"],
  positionId: "",
  mode: "range",
  start: "09:00",
  end: "18:00",
  hours: 8,
  kind: "day",
  from: "2026-10-12",
  to: "2026-10-18",
  weekdays: [0, 2],
  locationId: "",
  projectId: "",
  comment: "",
  ...patch,
});

test("series: one day ignores weekdays; a range takes its weekdays per employee", () => {
  expect(datesOfForm(form({ to: "2026-10-12", weekdays: [] }), none)).toEqual(["2026-10-12"]);
  const drafts = draftsOfForm(form(), "s", none);
  expect(drafts.map((d) => `${d.employeeId}${d.date.slice(8)}`)).toEqual(["a12", "b12", "a14", "b14"]);
  expect(drafts[0]).toMatchObject({ seriesId: "s", plannedMinutes: 480, breakMinutes: 60 });
});

const shift = (date: string, id = date): Shift => ({
  id,
  employeeId: "a",
  date,
  start: "09:00",
  end: "18:00",
  breakMinutes: 60,
  plannedMinutes: 480,
  kind: "day",
  seriesId: "s",
  templateId: "",
  locationId: "",
  positionId: "",
  projectId: "",
  comment: "",
});

test("series round trip and rewrite keeps the past", () => {
  const rows = [shift("2026-10-12"), shift("2026-10-14"), shift("2026-10-19")];
  const back = formOfSeries(rows);
  expect(back).toMatchObject({ from: "2026-10-12", to: "2026-10-19", weekdays: [0, 2], employeeIds: ["a"] });
  const { remove, add } = rewriteSeries(rows, draftsOfForm({ ...back, start: "10:00" }, "s", none), "2026-10-14");
  expect(remove).toEqual(["2026-10-14", "2026-10-19"]);
  expect(add.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-19"]);
  // Смена из одного дня в прошлом правится целиком.
  expect(rewriteSeries([shift("2026-10-01")], [], "2026-10-14").remove).toEqual(["2026-10-01"]);
});
