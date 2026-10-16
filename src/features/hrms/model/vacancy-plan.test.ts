import { expect, test } from "vitest";
import { cellState, monthFigures, monthOf, monthPlan, planRow, sumRows, type PlanVacancy } from "./vacancy-plan";

const m = (date: string) => monthOf(date)!;

test("позиции раскладываются от открытия до дедлайна, последняя — в месяц дедлайна", () => {
  expect([...monthPlan("2026-06-10", "2026-08-20", 3)]).toEqual([
    [m("2026-06"), 1],
    [m("2026-07"), 1],
    [m("2026-08"), 1],
  ]);
  expect([...monthPlan("2026-06-10", "2026-08-20", 1)]).toEqual([[m("2026-08"), 1]]);
  expect([...monthPlan("2026-06-10", "", 2)]).toEqual([[m("2026-06"), 2]]);
  expect(monthPlan("", "", 2).size).toBe(0);
});

const vacancy: PlanVacancy = {
  id: "v",
  positionId: "dev",
  departmentId: "it",
  locationId: "tash",
  headcount: 2,
  openedAt: "2026-09-01",
  deadline: "2026-10-31",
};
const same = { positionId: "dev", departmentId: "it", locationId: "tash" };

test("работают — по должности, без уволенных и без нанятых из этой же вакансии; уходят — увольнение впереди", () => {
  const row = planRow(
    vacancy,
    [
      { id: "c1", vacancyId: "v", status: "hired", hiredAt: "2026-09-15" },
      { id: "c2", vacancyId: "v", status: "active", hiredAt: "" },
      { id: "c3", vacancyId: "other", status: "hired", hiredAt: "2026-09-01" },
    ],
    [
      { ...same, dismissalDate: "", candidateId: "" },
      { ...same, dismissalDate: "2026-12-01", candidateId: "" },
      { ...same, dismissalDate: "2026-01-01", candidateId: "" },
      { ...same, dismissalDate: "", candidateId: "c1" },
      { ...same, locationId: "sam", dismissalDate: "", candidateId: "" },
    ],
    "2026-10-08",
  );

  // Работают 3 (филиал не сверяется, один уходит), нанято 1,
  // нужно 2 − 1 + 1, план 3 + 2, факт 3 + 1 − 1.
  expect(row.total).toEqual({ plan: 5, fact: 3, staff: 3, hired: 1, leave: 1, need: 2 });
  expect([...row.hired]).toEqual([[m("2026-09"), 1]]);
  expect(sumRows([row, row]).total).toEqual({ plan: 10, fact: 6, staff: 6, hired: 2, leave: 2, need: 4 });
});

test("состояние ячейки", () => {
  const now = m("2026-10");
  const f = (plan: number, fact: number) =>
    ({ staff: 0, hired: 0, leave: 0, need: 0, plan, fact, busy: Boolean(plan || fact) }) as const;
  expect(cellState(f(0, 0), now, now)).toBe("empty");
  expect(cellState(f(1, 1), now - 1, now)).toBe("ok");
  expect(cellState(f(1, 0), now - 1, now)).toBe("overdue");
  expect(cellState(f(1, 0), now, now)).toBe("current");
  expect(cellState(f(1, 0), now + 1, now)).toBe("planned");
});

test("итоги месяца — нарастающим итогом", () => {
  const row = planRow(
    { ...vacancy, headcount: 2, openedAt: "2026-10-01", deadline: "2026-11-30" },
    [{ id: "c1", vacancyId: "v", status: "hired", hiredAt: "2026-10-20" }],
    [
      { ...same, dismissalDate: "", candidateId: "" },
      { ...same, dismissalDate: "2026-11-05", candidateId: "" },
    ],
    "2026-10-08",
  );
  // Октябрь: план найма 1, нанят 1, ушедших нет.
  expect(monthFigures(row, m("2026-10"))).toMatchObject({ need: 0, plan: 2, fact: 3 });
  // Ноябрь: план найма 2, нанят 1, ушёл 1 → нужно 2, план 4, факт 2.
  expect(monthFigures(row, m("2026-11"))).toMatchObject({ need: 2, plan: 4, fact: 2 });
});
