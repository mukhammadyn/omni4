/**
 * «Планирование» найма — `planView` прототипа (vacancies.html): по каждой
 * вакансии план и найм по месяцам, справа итоги «План · Работают · Нанято ·
 * Уходят · Нужно нанять».
 *
 * От прототипа отличается источниками: там «Работают» сверяются по
 * городу и включают нанятых, а «Уходят» выдуманы (`id % 3`). Здесь:
 *   Работают — только сотрудники той же должности (отдел и филиал не
 *              сверяются: в данных они расходятся с вакансией), ещё
 *              не уволенные. Нанятые из кандидатов ЭТОЙ вакансии сюда
 *              не идут — они в «Нанято», иначе посчитались бы дважды;
 *   Нанято   — кандидаты вакансии со статусом «Нанят». Отдельно, потому
 *              что карточку сотрудника нанятому заводят не всегда;
 *   Уходят   — работающие, у кого дата увольнения впереди;
 *   Нужно    — позиций вакансии − нанято + уходят, не меньше нуля;
 *   План     — работают + нужно нанять;
 *   Факт     — работают + нанято − уходят.
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
  /** Уходы работающих по месяцу даты увольнения. */
  leaves: Map<Month, number>;
  /** Итоги — `planRow` прототипа, «факт» разложен на работают и нанято. */
  total: { plan: number; fact: number; staff: number; hired: number; leave: number; need: number };
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
      !fromHere.has(e.candidateId) &&
      !(e.dismissalDate && e.dismissalDate.slice(0, 10) <= today),
  );
  const leave = staff.filter((e) => e.dismissalDate).length;
  const leaves = new Map<Month, number>();
  for (const e of staff) {
    const month = monthOf(e.dismissalDate);
    if (month !== null) leaves.set(month, (leaves.get(month) ?? 0) + 1);
  }

  const hired = new Map<Month, number>();
  for (const c of hiredHere) {
    const month = monthOf(c.hiredAt);
    if (month !== null) hired.set(month, (hired.get(month) ?? 0) + 1);
  }

  const need = Math.max(0, vacancy.headcount - hiredHere.length + leave);

  return {
    plan: monthPlan(vacancy.openedAt, vacancy.deadline, vacancy.headcount),
    hired,
    leaves,
    total: {
      plan: staff.length + need,
      fact: staff.length + hiredHere.length - leave,
      staff: staff.length,
      hired: hiredHere.length,
      leave,
      need,
    },
  };
}

/** Сумма строк — для групп и «Итого». */
export function sumRows(rows: PlanRow[]): PlanRow {
  const plan = new Map<Month, number>();
  const hired = new Map<Month, number>();
  const leaves = new Map<Month, number>();
  const total = { plan: 0, fact: 0, staff: 0, hired: 0, leave: 0, need: 0 };

  for (const row of rows) {
    for (const [month, n] of row.plan) plan.set(month, (plan.get(month) ?? 0) + n);
    for (const [month, n] of row.hired) hired.set(month, (hired.get(month) ?? 0) + n);
    for (const [month, n] of row.leaves) leaves.set(month, (leaves.get(month) ?? 0) + n);
    total.plan += row.total.plan;
    total.fact += row.total.fact;
    total.staff += row.total.staff;
    total.hired += row.total.hired;
    total.leave += row.total.leave;
    total.need += row.total.need;
  }
  return { plan, hired, leaves, total };
}

/** Сумма значений карты по месяц `to` включительно. */
const upTo = (map: Map<Month, number>, to: Month) =>
  [...map].reduce((sum, [month, n]) => (month <= to ? sum + n : sum), 0);

export type MonthFigures = {
  staff: number;
  hired: number;
  leave: number;
  need: number;
  plan: number;
  fact: number;
  /** В этом месяце что-то происходит: план, найм или уход. */
  busy: boolean;
};

/**
 * Итоги на конец месяца — те же формулы, что у строки, нарастающим итогом:
 *   Нужно = позиций к месяцу − нанято к месяцу + ушли к месяцу, не меньше нуля;
 *   План  = работают + нужно;
 *   Факт  = работают + нанято к месяцу − ушли к месяцу.
 * ponytail: у группы нужно считается по суммам строк, а не суммой нужно
 * строк — расходится, только если у какой-то строки найм обогнал план.
 */
export function monthFigures(row: PlanRow, month: Month): MonthFigures {
  const staff = row.total.staff;
  const hired = upTo(row.hired, month);
  const leave = upTo(row.leaves, month);
  const need = Math.max(0, upTo(row.plan, month) - hired + leave);
  return {
    staff,
    hired,
    leave,
    need,
    plan: staff + need,
    fact: staff + hired - leave,
    busy: Boolean(row.plan.get(month) || row.hired.get(month) || row.leaves.get(month)),
  };
}

export type CellState = "empty" | "ok" | "overdue" | "current" | "planned";

/** Цвет ячейки «факт / план» — `mcell` прототипа. */
export function cellState(figures: MonthFigures, month: Month, now: Month): CellState {
  if (!figures.busy) return "empty";
  if (figures.fact >= figures.plan) return "ok";
  return month < now ? "overdue" : month === now ? "current" : "planned";
}
