import { expect, test } from "vitest";
import {
  blankTemplate,
  datesOfForm,
  draftsOfForm,
  endOf,
  expandTemplate,
  editSeries,
  formOfSeries,
  occupiedBy,
  resolveBusy,
  withOwnFields,
  plannedOf,
  scopedRows,
  weekMinutesOf,
  weekdayOf,
  type Shift,
  type ShiftForm,
} from "./schedule";

const none = () => new Set<string>();

test("time: overnight span, break only on long shifts, hours mode", () => {
  expect(plannedOf("20:00", "08:00", 60)).toBe(660);
  expect(plannedOf("09:00", "13:00", 60)).toBe(240);
  expect(weekdayOf("2026-10-12")).toBe(0);
  expect(weekdayOf("2026-10-18")).toBe(6);
});

test("weekly template: working days, skips holidays; hours per week", () => {
  const template = blankTemplate();
  const days = expandTemplate(template, ["a"], { from: "2026-10-12", to: "2026-10-18", holidays: () => new Set(["2026-10-14"]), offset: false });
  expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]);
  expect(weekMinutesOf(template)).toBe(5 * 480);
});

test("cycle template: 2 on 2 off, offset staggers employees, ignores holidays", () => {
  const template = { ...blankTemplate(), type: "cycle" as const };
  const days = expandTemplate(template, ["a", "b"], { from: "2026-10-01", to: "2026-10-06", holidays: () => new Set(["2026-10-01"]), offset: true });
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
  expect(datesOfForm(form({ to: "2026-10-12", weekdays: [] }))).toEqual(["2026-10-12"]);
  const drafts = draftsOfForm(form(), "s", none);
  expect(drafts.map((d) => `${d.employeeId}${d.date.slice(8)}`)).toEqual(["a12", "b12", "a14", "b14"]);
  expect(drafts[0]).toMatchObject({ seriesId: "s", plannedMinutes: 480, breakMinutes: 60 });
});

test("series: holidays are per employee (branch calendar)", () => {
  const drafts = draftsOfForm(form(), "s", (id) => new Set(id === "a" ? ["2026-10-14"] : []));
  expect(drafts.map((d) => `${d.employeeId}${d.date.slice(8)}`)).toEqual(["a12", "b12", "b14"]);
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

const all = { days: "all", people: "all" } as const;
const ctx = { today: "2026-10-14", holidays: none };

test("hours a day: flexible shift without start and end, norm from hours", () => {
  const rows = [shift("2026-10-14"), shift("2026-10-15")];
  const form = { ...formOfSeries(rows, rows[0]!), mode: "hours" as const, hours: 6 };
  const { add } = editSeries(rows, rows[0]!, form, all, ctx);
  expect(add.map((r) => [r.start, r.end, r.breakMinutes, r.plannedMinutes])).toEqual([
    ["", "", 0, 360],
    ["", "", 0, 360],
  ]);
  // Открыли гибкую на правку — форма «часов в день» с её часами.
  const flexible = { ...rows[0]!, start: "", end: "", plannedMinutes: 360 };
  expect(formOfSeries([flexible], flexible)).toMatchObject({ mode: "hours", hours: 6 });
  expect(endOf(form)).toBe("");
});

test("series form: fields of the clicked shift, dates and people of the series", () => {
  const rows = [shift("2026-10-12"), { ...shift("2026-10-14"), employeeId: "b", positionId: "p" }, shift("2026-10-19")];
  expect(formOfSeries(rows, rows[1]!)).toMatchObject({ from: "2026-10-12", to: "2026-10-19", weekdays: [0, 2], employeeIds: ["a", "b"], positionId: "p" });
});

test("edit patches only changed fields, past included, keeps the template pattern", () => {
  const friday = { ...shift("2026-10-16"), start: "10:00", end: "15:00", breakMinutes: 30, plannedMinutes: 300 };
  const rows = [shift("2026-10-12"), shift("2026-10-14"), shift("2026-10-15"), friday];
  const form = formOfSeries(rows, rows[1]!);
  // Только комментарий: время пятницы и её перерыв на месте; прошлое (12-е) правится тоже.
  const { remove, add } = editSeries(rows, rows[1]!, { ...form, comment: "x" }, all, ctx);
  expect(remove).toEqual([]);
  expect(add.map((r) => [r.date, r.start, r.end, r.breakMinutes, r.comment])).toEqual([
    ["2026-10-12", "09:00", "18:00", 60, "x"],
    ["2026-10-14", "09:00", "18:00", 60, "x"],
    ["2026-10-15", "09:00", "18:00", 60, "x"],
    ["2026-10-16", "10:00", "15:00", 30, "x"],
  ]);
  expect(add.every((r) => "id" in r)).toBe(true);
  // Конец 12:00 — смены короткие, перерыв не положен; у пятницы своё начало (10–12).
  const short = editSeries(rows, rows[1]!, { ...form, end: "12:00" }, all, ctx).add;
  expect(short.map((r) => [r.end, r.breakMinutes, r.plannedMinutes])).toEqual([
    ["12:00", 0, 180],
    ["12:00", 0, 180],
    ["12:00", 0, 180],
    ["12:00", 0, 120],
  ]);
  // Ничего не изменили — нечего писать.
  expect(editSeries(rows, rows[1]!, form, all, ctx).add).toEqual([]);
});

test("edit along two axes: days from this one, only this person", () => {
  const b = (date: string) => ({ ...shift(date, `b${date}`), employeeId: "b" });
  const rows = [shift("2026-10-14"), shift("2026-10-16"), b("2026-10-14"), b("2026-10-16")];
  const form = { ...formOfSeries(rows, rows[1]!), start: "10:00" };
  const following = editSeries(rows, rows[1]!, form, { days: "following", people: "single" }, ctx);
  expect(following.add.map((r) => "id" in r && r.id)).toEqual(["2026-10-16"]);
  // Убрали «b» из списка — его дни в области правки снимаются.
  const without = editSeries(rows, rows[1]!, { ...form, employeeIds: ["a"] }, all, ctx);
  expect(without.remove).toEqual(["b2026-10-14", "b2026-10-16"]);
});

test("edit adds rows to a new member only, holes stay", () => {
  // У «a» снят 15-й — правка его не возвращает; новый «c» получает дни формы.
  const rows = [shift("2026-10-14"), shift("2026-10-16")];
  const form = { ...formOfSeries(rows, rows[0]!), weekdays: [2, 3, 4], employeeIds: ["a", "c"] };
  const { add } = editSeries(rows, rows[0]!, form, all, ctx);
  expect(add.map((r) => `${r.employeeId}${r.date.slice(8)}`)).toEqual(["c14", "c15", "c16"]);
});

test("gaps: stretched one-day shift and a removed day are filled only on request", () => {
  // Смену 14-го растянули до 16-го: 15-е и 16-е — пропуски, сами не создаются.
  const single = [shift("2026-10-14")];
  const stretched = { ...formOfSeries(single, single[0]!), to: "2026-10-16", weekdays: [0, 1, 2, 3, 4] };
  const quiet = editSeries(single, single[0]!, stretched, all, { ...ctx, oneDate: true });
  expect(quiet.gaps.map((g) => g.date)).toEqual(["2026-10-15", "2026-10-16"]);
  expect(quiet.add).toEqual([]);
  const filled = editSeries(single, single[0]!, stretched, all, { ...ctx, oneDate: true, fillGaps: true });
  expect(filled.add.map((r) => [r.date, r.seriesId])).toEqual([
    ["2026-10-15", "s"],
    ["2026-10-16", "s"],
  ]);
  // У «b» снят 15-й — пропуск; прошлые дни (13-е у «b») пропуском не считаются.
  const b = (date: string) => ({ ...shift(date, `b${date}`), employeeId: "b" });
  const rows = [shift("2026-10-13"), shift("2026-10-14"), shift("2026-10-15"), b("2026-10-14")];
  const gaps = editSeries(rows, rows[1]!, formOfSeries(rows, rows[1]!), all, ctx).gaps;
  expect(gaps.map((g) => `${g.employeeId}${g.date.slice(8)}`)).toEqual(["b15"]);
});

test("template series has no gaps: off days of the cycle are not holes", () => {
  const rows = [shift("2026-10-14"), shift("2026-10-15"), shift("2026-10-18")].map((r) => ({ ...r, templateId: "t" }));
  expect(editSeries(rows, rows[0]!, formOfSeries(rows, rows[0]!), all, ctx).gaps).toEqual([]);
});

test("busy days: skip drops the new row, overwrite takes the standing one", () => {
  const other = { ...shift("2026-10-15", "x"), seriesId: "other" };
  const draft = (date: string) => {
    const { id, ...rest } = shift(date);
    void id;
    return rest;
  };
  const add = [{ ...shift("2026-10-14"), id: "own" }, draft("2026-10-15"), draft("2026-10-16")];
  const skip = resolveBusy(add, [other], "skip");
  expect(skip.conflicts.map((r) => r.id)).toEqual(["x"]);
  expect(skip.add.map((r) => r.date)).toEqual(["2026-10-14", "2026-10-16"]);
  const overwrite = resolveBusy(add, [other], "overwrite");
  expect(overwrite.add.map((r) => [r.date, "id" in r ? r.id : "", r.seriesId])).toEqual([
    ["2026-10-14", "own", "s"],
    ["2026-10-15", "x", "s"],
    ["2026-10-16", "", "s"],
  ]);
  // Перенос смены на занятый день — ошибка.
  expect(occupiedBy([{ employeeId: "a", date: "2026-10-15" }], [other])?.id).toBe("x");
  expect(occupiedBy([{ employeeId: "b", date: "2026-10-15" }], [other])).toBeUndefined();
});

test("scope covers the past: all days, and a single past day", () => {
  const rows = [shift("2026-10-12"), shift("2026-10-14"), shift("2026-10-19")];
  const form = formOfSeries(rows, rows[0]!);
  expect(scopedRows(rows, rows[1]!, form, all).map((r) => r.id)).toEqual(["2026-10-12", "2026-10-14", "2026-10-19"]);
  expect(scopedRows(rows, rows[0]!, form, { days: "single", people: "single" }).map((r) => r.id)).toEqual(["2026-10-12"]);
  // Групповая смена на один прошлый день правится целиком.
  const group = [shift("2026-10-01"), { ...shift("2026-10-01", "b"), employeeId: "b" }];
  expect(scopedRows(group, group[0]!, formOfSeries(group, group[0]!), all)).toHaveLength(2);
});

test("own fields: position from the card, location from the form first, standing rows untouched", () => {
  const cards = new Map([["a", { positionId: "dev", locationId: "hq" }]]);
  const { id: _skip, ...draft } = { ...shift("2026-10-15"), positionId: "form", locationId: "" };
  void _skip;
  const [fresh, standing, unknown] = withOwnFields(
    [draft, { ...shift("2026-10-16"), positionId: "form" }, { ...draft, employeeId: "z", locationId: "wh" }],
    cards,
  );
  expect([fresh!.positionId, fresh!.locationId]).toEqual(["dev", "hq"]);
  expect(standing!.positionId).toBe("form");
  expect([unknown!.positionId, unknown!.locationId]).toEqual(["form", "wh"]);
  expect(withOwnFields([{ ...draft, locationId: "wh" }], cards)[0]!.locationId).toBe("wh");
});
