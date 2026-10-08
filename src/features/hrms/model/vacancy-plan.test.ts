import { expect, test } from "vitest";
import { cellState, monthOf, monthPlan, planRow, sumRows, type PlanVacancy } from "./vacancy-plan";

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

test("работают — без уволенных и без нанятых из этой же вакансии; уходят — увольнение впереди", () => {
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

  // Работают 2 (один уходит), нанято 1, план 2 + 2, нужно 4 − 2 − 1 + 1.
  expect(row.total).toEqual({ plan: 4, staff: 2, hired: 1, leave: 1, need: 2 });
  expect([...row.hired]).toEqual([[m("2026-09"), 1]]);
  expect(sumRows([row, row]).total).toEqual({ plan: 8, staff: 4, hired: 2, leave: 2, need: 4 });
});

test("состояние ячейки", () => {
  const now = m("2026-10");
  expect(cellState(0, 0, now, now)).toBe("empty");
  expect(cellState(1, 1, now - 1, now)).toBe("ok");
  expect(cellState(1, 0, now - 1, now)).toBe("overdue");
  expect(cellState(1, 0, now, now)).toBe("current");
  expect(cellState(1, 0, now + 1, now)).toBe("planned");
});
