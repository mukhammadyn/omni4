/*
 * График работы (`schedule.html` прототипа). Прототип хранит смену
 * серией — сотрудники, период, дни недели, исключённые дни. У нас
 * в `hr_shifts` строка — это сотрудник × дата, а серию собирает общий
 * `series_id`. Поэтому всё «серийное» здесь — развёртка в дни и сборка
 * обратно: создать серию — записать её дни, отменить один день — удалить
 * его строку, изменить серию — переписать её дни.
 */
import { datesOf } from "./timesheet";

export const SHIFT_KINDS = ["day", "night", "remote"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

/** Варианты `weekday` у `hr_work_schedule_days`, с понедельника. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Строка `hr_shifts`. */
export type Shift = {
  id: string;
  employeeId: string;
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  plannedMinutes: number;
  kind: ShiftKind;
  seriesId: string;
  templateId: string;
  locationId: string;
  positionId: string;
  projectId: string;
  comment: string;
};

export type TemplateDay = { working: boolean; start: string; end: string; kind: ShiftKind };

/** Шаблон графика: `hr_work_schedules` и его дни `hr_work_schedule_days`. */
export type Template = {
  id: string;
  name: string;
  color: string;
  type: "weekly" | "cycle";
  breakMinutes: number;
  graceMinutes: number;
  description: string;
  active: boolean;
  /** Семь дней с понедельника — у недельного. */
  days: TemplateDay[];
  /** guid строк `hr_work_schedule_days` — их переписывает сохранение. */
  dayIds: string[];
  /** N рабочих через M выходных — у сменного цикла. */
  cycle: { work: number; off: number; start: string; end: string; kind: ShiftKind };
};

/* ---------- время ---------- */

export const toMinutes = (clock: string) => {
  const [hour = 0, minute = 0] = clock.split(":").map(Number);
  return hour * 60 + minute;
};

export const toClock = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
};

export const isClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Длина смены; конец раньше начала — смена через полночь. */
export const spanOf = (start: string, end: string) => {
  const span = toMinutes(end) - toMinutes(start);
  return span <= 0 ? span + 1440 : span;
};

/** Перерыв вычитается только у смены длиннее 5 часов, как в прототипе. */
export const plannedOf = (start: string, end: string, breakMinutes: number) => {
  const span = spanOf(start, end);
  return span > 300 ? span - breakMinutes : span;
};

/** День недели даты, 0 — понедельник. */
export const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/* ---------- шаблон ---------- */

const DEFAULT_BREAK = 60;

export const blankTemplate = (): Template => ({
  id: "",
  name: "",
  color: "#3B82F6",
  type: "weekly",
  breakMinutes: DEFAULT_BREAK,
  graceMinutes: 0,
  description: "",
  active: true,
  days: WEEKDAYS.map((_, index) => ({ working: index < 5, start: "09:00", end: "18:00", kind: "day" })),
  dayIds: [],
  cycle: { work: 2, off: 2, start: "08:00", end: "20:00", kind: "day" },
});

/** Часов в неделю на человека; у цикла — в среднем. */
export const weekMinutesOf = (template: Pick<Template, "type" | "days" | "cycle" | "breakMinutes">) => {
  if (template.type === "weekly")
    return template.days.reduce((sum, day) => sum + (day.working ? plannedOf(day.start, day.end, template.breakMinutes) : 0), 0);
  const { work, off, start, end } = template.cycle;
  return Math.round((plannedOf(start, end, template.breakMinutes) * 7 * work) / Math.max(1, work + off));
};

/** День, который шаблон даёт одному сотруднику. */
export type PlannedDay = { employeeId: string; date: string; start: string; end: string; kind: ShiftKind };

/**
 * Дни шаблона на период. Недельный пропускает праздники; цикл — нет:
 * сменная линия работает и в праздник. `offset` сдвигает цикл каждого
 * следующего сотрудника на его рабочие дни — смены перекрывают друг друга.
 */
export const expandTemplate = (
  template: Pick<Template, "type" | "days" | "cycle">,
  employeeIds: string[],
  { from, to, holidays, offset }: { from: string; to: string; holidays: ReadonlySet<string>; offset: boolean },
): PlannedDay[] => {
  const dates = datesOf({ from, to });
  if (template.type === "weekly")
    return employeeIds.flatMap((employeeId) =>
      dates.flatMap((date) => {
        const day = template.days[weekdayOf(date)];
        return day?.working && !holidays.has(date) ? [{ employeeId, date, start: day.start, end: day.end, kind: day.kind }] : [];
      }),
    );
  const { work, off, start, end, kind } = template.cycle;
  const length = Math.max(1, work + off);
  return employeeIds.flatMap((employeeId, index) =>
    dates.flatMap((date, day) =>
      (day + (offset ? index * work : 0)) % length < work ? [{ employeeId, date, start, end, kind }] : [],
    ),
  );
};

/* ---------- смена ---------- */

/** Форма смены (`shiftModal` прототипа). */
export type ShiftForm = {
  employeeIds: string[];
  positionId: string;
  mode: "range" | "hours";
  start: string;
  end: string;
  hours: number;
  kind: ShiftKind;
  from: string;
  to: string;
  /** Дни недели серии, 0 — понедельник; у одного дня пусто. */
  weekdays: number[];
  locationId: string;
  projectId: string;
  comment: string;
};

/** Конец смены: в режиме «часов в день» — от начала, с часом перерыва у длинной. */
export const endOf = (form: Pick<ShiftForm, "mode" | "start" | "end" | "hours">) =>
  form.mode === "hours" ? toClock(toMinutes(form.start) + form.hours * 60 + (form.hours > 5 ? DEFAULT_BREAK : 0)) : form.end;

/** Даты серии: один день — он сам; иначе дни недели периода без праздников. */
export const datesOfForm = (form: Pick<ShiftForm, "from" | "to" | "weekdays">, holidays: ReadonlySet<string>) =>
  form.from === form.to
    ? [form.from]
    : datesOf({ from: form.from, to: form.to }).filter((date) => form.weekdays.includes(weekdayOf(date)) && !holidays.has(date));

/** Строка смены без guid — её даёт запись. */
export type ShiftDraft = Omit<Shift, "id">;

export const draftsOfForm = (form: ShiftForm, seriesId: string, holidays: ReadonlySet<string>): ShiftDraft[] => {
  const end = endOf(form);
  const breakMinutes = spanOf(form.start, end) > 300 ? DEFAULT_BREAK : 0;
  return datesOfForm(form, holidays).flatMap((date) =>
    form.employeeIds.map((employeeId) => ({
      employeeId,
      date,
      start: form.start,
      end,
      breakMinutes,
      plannedMinutes: plannedOf(form.start, end, breakMinutes),
      kind: form.kind,
      seriesId,
      templateId: "",
      locationId: form.locationId,
      positionId: form.positionId,
      projectId: form.projectId,
      comment: form.comment,
    })),
  );
};

export const draftsOfTemplate = (
  template: Pick<Template, "id" | "breakMinutes">,
  days: PlannedDay[],
  { seriesId, locationId, positionOf }: { seriesId: string; locationId: string; positionOf: (employeeId: string) => string },
): ShiftDraft[] =>
  days.map((day) => ({
    ...day,
    breakMinutes: template.breakMinutes,
    plannedMinutes: plannedOf(day.start, day.end, template.breakMinutes),
    seriesId,
    templateId: template.id,
    locationId,
    positionId: positionOf(day.employeeId),
    projectId: "",
    comment: "",
  }));

/** Форма по строкам одной серии — открыть её на правку. */
export const formOfSeries = (rows: Shift[]): ShiftForm => {
  const dates = rows.map((row) => row.date).sort();
  const first = rows[0];
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? from;
  return {
    employeeIds: [...new Set(rows.map((row) => row.employeeId))],
    positionId: first?.positionId ?? "",
    mode: "range",
    start: first?.start ?? "09:00",
    end: first?.end ?? "18:00",
    hours: 8,
    kind: first?.kind ?? "day",
    from,
    to,
    weekdays: from === to ? [] : [...new Set(dates.map(weekdayOf))].sort(),
    locationId: first?.locationId ?? "",
    projectId: first?.projectId ?? "",
    comment: first?.comment ?? "",
  };
};

/**
 * Правка серии: что удалить и что записать. Прошлое не трогается —
 * по сменам табель считает норму, и правка задним числом переписала бы
 * итоги. Исключение — смена из одного дня: её правят целиком.
 */
export const rewriteSeries = (rows: Shift[], drafts: ShiftDraft[], today: string) => {
  const cutoff = rows.length === 1 ? "" : today;
  return {
    remove: rows.filter((row) => row.date >= cutoff).map((row) => row.id),
    add: drafts.filter((draft) => draft.date >= cutoff),
  };
};

/** Смены сотрудников в периоде — их снимает «Заменить существующие». */
export const overlapping = (rows: Shift[], employeeIds: string[], from: string, to: string) => {
  const ids = new Set(employeeIds);
  return rows.filter((row) => ids.has(row.employeeId) && row.date >= from && row.date <= to).map((row) => row.id);
};

/** Смены сотрудника по датам; в один день их бывает несколько. */
export const byEmployeeDate = (rows: Shift[]) => {
  const index = new Map<string, Shift[]>();
  for (const row of rows) {
    const key = `${row.employeeId}|${row.date}`;
    index.set(key, [...(index.get(key) ?? []), row]);
  }
  return (employeeId: string, date: string) => index.get(`${employeeId}|${date}`) ?? [];
};

/** Шаблон сотрудника на дату: по его сменам, иначе тот, что у него в карточке. */
export const templateOn = (shifts: Shift[], fallback: string) => shifts.find((row) => row.templateId)?.templateId || fallback;
