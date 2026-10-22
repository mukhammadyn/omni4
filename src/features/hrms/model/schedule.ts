/*
 * График работы (`schedule.html` прототипа). Прототип хранит смену
 * серией — сотрудники, период, дни недели, исключённые дни. У нас
 * в `hr_shifts` строка — это сотрудник × дата, а серию собирает общий
 * `series_id`. Поэтому всё «серийное» здесь — развёртка в дни и сборка
 * обратно: создать серию — записать её дни, отменить один день — удалить
 * его строку, изменить серию — переписать её дни.
 */
import { datesOf } from "./timesheet";

/** Вид смены — guid строки справочника `hr_shift_kinds` (настройки HRMS); пусто — не задан. */
export type ShiftKind = string;

/** Строка `hr_shift_kinds`: «Утро», «День», «Ночь» — как заведёт компания. */
export type ShiftKindRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Время по умолчанию — подставляется в смену при выборе вида; пусто — не трогать. */
  start: string;
  end: string;
  /** Удалённая: вместо филиала у смены — «Удалённо». */
  remote: boolean;
};

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

export const blankTemplate = (kind: ShiftKind = ""): Template => ({
  id: "",
  name: "",
  color: "#3B82F6",
  type: "weekly",
  breakMinutes: DEFAULT_BREAK,
  graceMinutes: 0,
  description: "",
  active: true,
  days: WEEKDAYS.map((_, index) => ({ working: index < 5, start: "09:00", end: "18:00", kind })),
  dayIds: [],
  cycle: { work: 2, off: 2, start: "08:00", end: "20:00", kind },
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
/** Нерабочие дни сотрудника — по календарю его филиала (`api/holiday`). */
export type DaysOffOf = (employeeId: string) => { has: (date: string) => boolean };

export const expandTemplate = (
  template: Pick<Template, "type" | "days" | "cycle">,
  employeeIds: string[],
  { from, to, holidays, offset }: { from: string; to: string; holidays: DaysOffOf; offset: boolean },
): PlannedDay[] => {
  const dates = datesOf({ from, to });
  if (template.type === "weekly")
    return employeeIds.flatMap((employeeId) => {
      const off = holidays(employeeId);
      return dates.flatMap((date) => {
        const day = template.days[weekdayOf(date)];
        return day?.working && !off.has(date) ? [{ employeeId, date, start: day.start, end: day.end, kind: day.kind }] : [];
      });
    });
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

/**
 * «Часов в день» — гибкая смена: N часов в любое время дня, без начала
 * и конца. В строке пустые `start_time`/`end_time`, норма — `planned_minutes`.
 */
export const isFlexible = (shift: Pick<Shift, "start">) => !shift.start;

/** Начало и конец смены формы; у гибкой — пусто. */
export const startOf = (form: Pick<ShiftForm, "mode" | "start">) => (form.mode === "hours" ? "" : form.start);
export const endOf = (form: Pick<ShiftForm, "mode" | "end">) => (form.mode === "hours" ? "" : form.end);

/** Даты серии: один день — он сам; иначе дни недели периода без праздников. */
export const datesOfForm = (form: Pick<ShiftForm, "from" | "to" | "weekdays">, holidays: { has: (date: string) => boolean } = new Set()) =>
  form.from === form.to
    ? [form.from]
    : datesOf({ from: form.from, to: form.to }).filter((date) => form.weekdays.includes(weekdayOf(date)) && !holidays.has(date));

/** Строка смены без guid — её даёт запись. */
export type ShiftDraft = Omit<Shift, "id">;

export const draftsOfForm = (form: ShiftForm, seriesId: string, holidays: DaysOffOf): ShiftDraft[] => {
  const start = startOf(form);
  const end = endOf(form);
  const breakMinutes = start && spanOf(start, end) > 300 ? DEFAULT_BREAK : 0;
  const plannedMinutes = start ? plannedOf(start, end, breakMinutes) : form.hours * 60;
  // Праздники у каждого свои (филиал); один день ставится и на праздник.
  const one = form.from === form.to;
  return datesOfForm(form).flatMap((date) =>
    form.employeeIds.filter((employeeId) => one || !holidays(employeeId).has(date)).map((employeeId) => ({
      employeeId,
      date,
      start,
      end,
      breakMinutes,
      plannedMinutes,
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

/** Форма по серии — открыть её на правку: поля — щёлкнутой смены, состав и даты — всей серии. */
export const formOfSeries = (rows: Shift[], anchor: Shift): ShiftForm => {
  const dates = rows.map((row) => row.date).sort();
  const from = dates[0] ?? anchor.date;
  const to = dates[dates.length - 1] ?? from;
  return {
    employeeIds: [...new Set(rows.map((row) => row.employeeId))],
    positionId: anchor.positionId,
    mode: isFlexible(anchor) ? "hours" : "range",
    start: anchor.start || "09:00",
    end: anchor.end || "18:00",
    hours: isFlexible(anchor) ? anchor.plannedMinutes / 60 : 8,
    kind: anchor.kind,
    from,
    to,
    weekdays: from === to ? [] : [...new Set(dates.map(weekdayOf))].sort(),
    locationId: anchor.locationId,
    projectId: anchor.projectId,
    comment: anchor.comment,
  };
};

/*
 * Правка и удаление серии — по двум осям, как в HRMS (hrms ADR-0004):
 * какие дни (этот / с этого / все) и кому (всем / только этому).
 * «Всем с понедельника с 10:00» и «Иванову весь март с 10:00» — разные
 * намерения, одной осью их не выразить.
 */
export type SeriesScope = { days: "single" | "following" | "all"; people: "all" | "single" };

/** Серия из одной даты правится целиком. */
export const isOneDate = (rows: Shift[]) => new Set(rows.map((row) => row.date)).size <= 1;

/**
 * Строки серии в области правки: даты формы × ось дней × ось людей.
 * Прошлые дни правятся тоже: «все дни серии» — вся серия.
 */
export const scopedRows = (
  rows: Shift[],
  anchor: Shift,
  form: Pick<ShiftForm, "from" | "to" | "weekdays">,
  scope: SeriesScope,
  /** Строки — не вся серия (api/schedule, useSeries): одна ли у неё дата, знает тот, кто грузил. */
  one = isOneDate(rows),
) => {
  const inForm = (date: string) =>
    one || (date >= form.from && date <= form.to && (form.from === form.to || form.weekdays.includes(weekdayOf(date))));
  return rows.filter(
    (row) =>
      inForm(row.date) &&
      (scope.days === "all" || (scope.days === "following" ? row.date >= anchor.date : row.date === anchor.date)) &&
      (scope.people === "all" || row.employeeId === anchor.employeeId),
  );
};

/**
 * Правка серии. Строки обновляются на месте, и меняется в них только то,
 * что изменили в форме: у серии из шаблона пятница 10–15 и свой перерыв
 * остаются, пока их не тронули. Убранные из списка теряют свои дни
 * в области правки; добавленные получают дни формы. Пропуски — дни формы,
 * в которых у участника нет строки (сняли день или растянули период), —
 * правка сама не заполняет: это записанное решение. Заполняет только
 * по просьбе (`fillGaps`), как в HRMS (ADR-0004, ShiftModal «Заполнить
 * пропущенные дни графика»).
 */
export const editSeries = (
  rows: Shift[],
  anchor: Shift,
  form: ShiftForm,
  scope: SeriesScope,
  {
    today,
    holidays,
    oneDate = isOneDate(rows),
    fillGaps = false,
  }: { today: string; holidays: DaysOffOf; oneDate?: boolean; fillGaps?: boolean },
) => {
  const target = scopedRows(rows, anchor, form, scope, oneDate);
  const start = startOf(form);
  const end = endOf(form);
  const patch: Partial<Shift> = {};
  if (start !== anchor.start) patch.start = start;
  if (end !== anchor.end) patch.end = end;
  if (!start && form.hours * 60 !== anchor.plannedMinutes) patch.plannedMinutes = form.hours * 60;
  if (form.kind !== anchor.kind) patch.kind = form.kind;
  if (form.positionId !== anchor.positionId) patch.positionId = form.positionId;
  if (form.locationId !== anchor.locationId) patch.locationId = form.locationId;
  if (form.projectId !== anchor.projectId) patch.projectId = form.projectId;
  if (form.comment !== anchor.comment) patch.comment = form.comment;
  // Смену из одного дня можно перенести.
  if (oneDate && form.from !== anchor.date) patch.date = form.from;

  const keep = new Set(scope.people === "single" ? [anchor.employeeId] : form.employeeIds);
  const members = new Set(rows.map((row) => row.employeeId));
  const added = scope.people === "all" ? form.employeeIds.filter((id) => !members.has(id)) : [];
  // Строка без серии (заведена в обход графика) с новыми людьми становится серией.
  const seriesId = anchor.seriesId || crypto.randomUUID();
  if (added.length && !anchor.seriesId) patch.seriesId = seriesId;
  const inDays = (date: string) =>
    (scope.days === "all" || (scope.days === "following" ? date >= anchor.date : date === anchor.date));

  const changed = Object.keys(patch).length > 0;
  // Где у участника уже есть строка — после правки: перенесённая смена занимает новый день.
  const moved = new Set(patch.date ? target : []);
  const taken = new Set(rows.map((row) => `${row.employeeId}|${moved.has(row) ? patch.date : row.date}`));
  // Пропуски — только с сегодня, даже у смены из одного дня: растянуть её в серию задним числом нельзя.
  // У серии из шаблона их нет: дни недели формы — объединение всех дат, и выходные цикла
  // выглядели бы пропусками. Вернуть день или продлить её — «Применить шаблон».
  const gaps = anchor.templateId
    ? []
    : draftsOfForm({ ...form, employeeIds: [...keep].filter((id) => members.has(id)) }, seriesId, holidays)
        .filter((draft) => draft.date >= today && inDays(draft.date) && !taken.has(`${draft.employeeId}|${draft.date}`))
        .map((draft) => ({ ...draft, templateId: anchor.templateId }));
  return {
    gaps,
    remove: target.filter((row) => !keep.has(row.employeeId)).map((row) => row.id),
    /** Перенесённые строки — их новый день проверяется на занятость (`occupiedBy`). */
    moved: [...moved].map((row) => ({ employeeId: row.employeeId, date: patch.date! })),
    add: [
      ...(changed
        ? target
            .filter((row) => keep.has(row.employeeId))
            .map((row) => {
              const next = { ...row, ...patch };
              if (isFlexible(next)) return { ...next, breakMinutes: 0, plannedMinutes: form.hours * 60 };
              // Время не трогали — перерыв строки (у шаблона свой) как есть. Тронули — короткой
              // смене он не положен, длинной остаётся свой или обычный.
              const retimed = patch.start !== undefined || patch.end !== undefined;
              const long = spanOf(next.start, next.end) > 300;
              const breakMinutes = !retimed ? row.breakMinutes : long ? row.breakMinutes || DEFAULT_BREAK : 0;
              return { ...next, breakMinutes, plannedMinutes: plannedOf(next.start, next.end, breakMinutes) };
            })
        : []),
      ...draftsOfForm({ ...form, employeeIds: added }, seriesId, holidays)
        .filter((draft) => inDays(draft.date))
        .map((draft) => ({ ...draft, templateId: anchor.templateId })),
      ...(fillGaps ? gaps : []),
    ],
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

export type BusyPolicy = "skip" | "overwrite";

/**
 * Занятые дни, как в HRMS (`plan.ts`, conflicts): новая строка ложится
 * туда, где у человека уже стоит смена — чужой серии или без серии.
 * «Оставить» — новая строка не создаётся; «Перезаписать» — стоящая строка
 * получает поля формы и переходит в эту серию: иначе поля говорят одно,
 * `series_id` — другое. Строки с `id` (правка своих) не проверяются —
 * `busy` их и не содержит.
 */
export const resolveBusy = (add: (ShiftDraft & { id?: string })[], busy: Shift[], policy: BusyPolicy) => {
  const byKey = new Map(busy.map((row) => [`${row.employeeId}|${row.date}`, row]));
  const conflicts: Shift[] = [];
  const next = add.flatMap((draft) => {
    const found = draft.id ? undefined : byKey.get(`${draft.employeeId}|${draft.date}`);
    if (!found) return [draft];
    conflicts.push(found);
    return policy === "overwrite" ? [{ ...draft, id: found.id }] : [];
  });
  return { add: next, conflicts };
};

/** Перенос смены на день, где у человека уже стоит другая, — ошибка, а не выбор. */
export const occupiedBy = (moved: { employeeId: string; date: string }[], busy: Shift[]) =>
  busy.find((row) => moved.some((item) => item.employeeId === row.employeeId && item.date === row.date));

/**
 * Свои поля у новых строк, как в HRMS (`plan.ts`, fieldsFor): должность —
 * из карточки каждого, поле формы — запасное, пока карточка не загружена;
 * филиал наоборот — поле сильнее карточки («в субботу все на складе»).
 * Строки с `id` (правка стоящих) не трогаются.
 */
export const withOwnFields = <T extends ShiftDraft & { id?: string }>(
  add: T[],
  cards: ReadonlyMap<string, { positionId: string; locationId: string }>,
): T[] =>
  add.map((draft) => {
    const card = cards.get(draft.employeeId);
    if (draft.id || !card) return draft;
    return { ...draft, positionId: card.positionId, locationId: draft.locationId || card.locationId };
  });
