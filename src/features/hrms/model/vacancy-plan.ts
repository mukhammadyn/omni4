/**
 * «Планирование» найма — `planView` прототипа (vacancies.html): по каждой
 * вакансии план и найм по месяцам, справа итоги «План · Работают · Нанято ·
 * Уходят · Нужно нанять».
 *
 * От прототипа отличается источниками: там «Работают» сверяются по
 * городу и включают нанятых, а «Уходят» выдуманы (`id % 3`). Здесь:
 *   Работают — только сотрудники: той же должности, отдела и филиала,
 *              ещё не уволенные. Нанятые из кандидатов ЭТОЙ вакансии сюда
 *              не идут — они в «Нанято», иначе посчитались бы дважды;
 *   Нанято   — кандидаты вакансии со статусом «Нанят». Отдельно, потому
 *              что карточку сотрудника нанятому заводят не всегда;
 *   Уходят   — работающие, у кого дата увольнения впереди;
 *   План     — работают + позиций вакансии;
 *   Нужно    — план − работают − нанято + уходят, не меньше нуля.
 */

/** Месяц числом: год·12 + месяц с нуля. Соседние месяцы — соседние числа. */
export type Month = number;

export type PlanVacancy = {
  id: string;
  positionId: string;
  departmentId: string;
  locationId: string;
  headcount: number;
  openedAt: string;
  deadline: string;
};

export type PlanCandidate = { id: string; vacancyId: string; status: string; hiredAt: string };

export type PlanEmployee = {
  positionId: string;
  departmentId: string;
  locationId: string;
  dismissalDate: string;
  candidateId: string;
};

export type PlanRow = {
  /** План и найм по месяцам. */
  plan: Map<Month, number>;
  hired: Map<Month, number>;
  /** Итоги — `planRow` прототипа, «факт» разложен на работают и нанято. */
  total: { plan: number; staff: number; hired: number; leave: number; need: number };
};

const HIRED = "hired";

/** «ГГГГ-ММ-ДД…» → месяц. Не дата — null. */
export function monthOf(date: string): Month | null {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

/**
 * Позиции раскладываются по месяцам от открытия до дедлайна поровну,
 * последняя — в месяц дедлайна (`monthPlan` прототипа). Нет дедлайна —
 * всё в месяц открытия; нет открытия — в месяц дедлайна.
 */
export function monthPlan(openedAt: string, deadline: string, headcount: number): Map<Month, number> {
  const plan = new Map<Month, number>();
  const from = monthOf(openedAt) ?? monthOf(deadline);
  if (from === null || headcount <= 0) return plan;

  const to = Math.max(from, monthOf(deadline) ?? from);
  const span = to - from + 1;
  for (let i = 0; i < headcount; i++) {
    const month = from + Math.max(0, Math.min(span - 1, Math.floor(((i + 1) * span) / headcount) - 1));
    plan.set(month, (plan.get(month) ?? 0) + 1);
  }
  return plan;
}

export function planRow(
  vacancy: PlanVacancy,
  candidates: PlanCandidate[],
  employees: PlanEmployee[],
  today: string,
): PlanRow {
  const hiredHere = candidates.filter((c) => c.vacancyId === vacancy.id && c.status === HIRED);
  const fromHere = new Set(hiredHere.map((c) => c.id));

  const staff = employees.filter(
    (e) =>
      e.positionId === vacancy.positionId &&
      e.departmentId === vacancy.departmentId &&
      e.locationId === vacancy.locationId &&
      !fromHere.has(e.candidateId) &&
      !(e.dismissalDate && e.dismissalDate.slice(0, 10) <= today),
  );
  const leave = staff.filter((e) => e.dismissalDate).length;

  const hired = new Map<Month, number>();
  for (const c of hiredHere) {
    const month = monthOf(c.hiredAt);
    if (month !== null) hired.set(month, (hired.get(month) ?? 0) + 1);
  }

  const plan = staff.length + vacancy.headcount;

  return {
    plan: monthPlan(vacancy.openedAt, vacancy.deadline, vacancy.headcount),
    hired,
    total: {
      plan,
      staff: staff.length,
      hired: hiredHere.length,
      leave,
      need: Math.max(0, plan - staff.length - hiredHere.length + leave),
    },
  };
}

/** Сумма строк — для групп и «Итого». */
export function sumRows(rows: PlanRow[]): PlanRow {
  const plan = new Map<Month, number>();
  const hired = new Map<Month, number>();
  const total = { plan: 0, staff: 0, hired: 0, leave: 0, need: 0 };

  for (const row of rows) {
    for (const [month, n] of row.plan) plan.set(month, (plan.get(month) ?? 0) + n);
    for (const [month, n] of row.hired) hired.set(month, (hired.get(month) ?? 0) + n);
    total.plan += row.total.plan;
    total.staff += row.total.staff;
    total.hired += row.total.hired;
    total.leave += row.total.leave;
    total.need += row.total.need;
  }
  return { plan, hired, total };
}

export type CellState = "empty" | "ok" | "overdue" | "current" | "planned";

/** Цвет ячейки «нанято / план» — `mcell` прототипа. */
export function cellState(plan: number, hired: number, month: Month, now: Month): CellState {
  if (!plan && !hired) return "empty";
  if (hired >= plan) return "ok";
  return month < now ? "overdue" : month === now ? "current" : "planned";
}
