/*
 * Баланс отсутствий сотрудника — блок «Баланс» вкладки «Отсутствия»
 * прототипа (employee.html, `usedOf`): лимит типа на свой период минус
 * одобренные заявки этого периода; ждущие решения — отдельно.
 *
 * Считается по заявкам, а не по `hr_absence_balance`: строки баланса там
 * только из импорта, при одобрении их никто не пишет (docs/STATUS.md).
 */

export type AbsenceType = {
  id: string;
  title: string;
  icon: string;
  color: string;
  /** Дней на период; null — без лимита. */
  limit: number | null;
  /** `limit_period`: week, month, year, none. */
  period: string;
};

export type RequestDays = { typeId: string; status: string; from: string; days: number };

export type Balance = {
  type: AbsenceType;
  used: number;
  pending: number;
  /** null — без лимита. */
  left: number | null;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Период лимита, в который попадает дата: её неделя с понедельника, месяц или год. */
export const limitPeriod = (period: string, today: string): { from: string; to: string } | null => {
  const date = new Date(`${today}T00:00:00Z`);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (period) {
    case "week": {
      const from = new Date(date);
      from.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const to = new Date(from);
      to.setUTCDate(from.getUTCDate() + 6);
      return { from: iso(from), to: iso(to) };
    }
    case "month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return null;
  }
};

/** Заявка относится к периоду по дате начала, как `usedOf` прототипа. */
export const balanceOf = (types: AbsenceType[], requests: RequestDays[], today: string): Balance[] =>
  types.map((type) => {
    const range = limitPeriod(type.period, today);
    const mine = requests.filter(
      (request) => request.typeId === type.id && (!range || (request.from >= range.from && request.from <= range.to)),
    );
    const sum = (status: string) =>
      mine.filter((request) => request.status === status).reduce((total, request) => total + request.days, 0);
    const used = sum("approved");
    return {
      type,
      used,
      pending: sum("pending"),
      left: type.limit != null && range ? Math.max(0, type.limit - used) : null,
    };
  });
