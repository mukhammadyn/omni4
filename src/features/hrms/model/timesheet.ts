/*
 * Табель: строка сотрудника за период — ячейка на день и итоги. Правила
 * взяты из табеля HRMS (`udevs_hrms_admin`, modules/Time/Sheet/sheet.ts),
 * а не из прототипа: там они проверены людьми.
 *
 * Разница в источнике. Там день собирался на фронте из отметок, здесь
 * он уже посчитан сервером — строка `hr_attendance_days` (статус,
 * приход, уход, отработано, опоздание). Свой расчёт остался только там,
 * где его нет в строке: норма (по сменам `hr_shifts` — у дней
 * `planned_minutes` пустой), переработка и итоги.
 */

/** Переработка короче этого за день — не переработка. */
export const OVERTIME_THRESHOLD_MINUTES = 15;

/** Нужное табелю из строки `hr_attendance_days`. */
export type AttendanceDay = {
  id: string;
  date: string;
  /** Вариант `status`: on_time, late, absent, excused, remote, holiday, day_off, not_employed. */
  status: string;
  /** Вариант `review`: none, pending, approved, rejected. */
  review: string;
  firstIn: string;
  lastOut: string;
  workedMinutes: number | null;
  lateMinutes: number;
  requestId: string;
  comment: string;
};

/** Заявка на отсутствие (`hr_requests`, тип absence) с типом из `hr_absence_types`. */
export type Leave = {
  id: string;
  title: string;
  code: string;
  icon: string;
  color: string;
  status: "approved" | "pending";
  from: string;
  to: string;
};

export type CellKind =
  /** До приёма или после увольнения. */
  | "outside"
  /** Будущее: факта ещё нет. */
  | "future"
  /** Смена была, строки дня нет — табель прогул не угадывает. */
  | "empty"
  /** Выходной: смены нет. */
  | "day_off"
  | "holiday"
  | "worked"
  | "late"
  /** Сегодня, приход есть, ухода ещё нет. */
  | "at_work"
  /** Прошедший день без одной из отметок. */
  | "missing_mark"
  | "absent"
  | "leave";

export type PendingKind = "leave" | "mark";

export type SheetCell = {
  date: string;
  kind: CellKind;
  /** Засчитан ли день: отметка на согласовании — нет. */
  counted: boolean;
  /** null — неизвестно (нет одной из отметок). */
  workedMinutes: number | null;
  /** Длина смен дня; 0 — смены нет или день снят отсутствием. */
  planMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  remote: boolean;
  /** Строка дня, если есть: окну дня нужны её отметки и guid. */
  day: AttendanceDay | null;
  leave: Leave | null;
  holiday: string;
  /** Что ждёт решения: ячейка показывает засчитанное, точка — это. */
  pending: PendingKind[];
  pendingLeave: Leave | null;
};

export type SheetTotals = {
  days: number;
  workedMinutes: number;
  planMinutes: number;
  lateMinutes: number;
  /** Баланс за период: сверх смен минус недоработки, не меньше нуля. */
  overtimeMinutes: number;
  absences: number;
};

export type RowInput = {
  dates: string[];
  today: string;
  /** `hire_date` / `dismissal_date` как «ГГГГ-ММ-ДД» или "". */
  hireDate: string;
  dismissalDate: string;
  /** Сумма `planned_minutes` смен сотрудника по дате. */
  planByDate: Map<string, number>;
  dayByDate: Map<string, AttendanceDay>;
  /** Одобренные и ждущие; отклонённые уже отброшены. */
  leaves: Leave[];
  /** Праздники компании: дата → название. */
  holidays: Map<string, string>;
};

/** Переработка дня: сверх смены, короче порога — ноль. */
export const overtimeOf = (worked: number | null, plan: number): number => {
  if (worked == null || plan <= 0) return 0;
  const over = worked - plan;
  return over >= OVERTIME_THRESHOLD_MINUTES ? over : 0;
};

const leaveOn = (leaves: Leave[], date: string, status: Leave["status"]) =>
  leaves.find((leave) => leave.status === status && leave.from <= date && leave.to >= date) ?? null;

/** Минуты между двумя моментами ISO; не вышло — null. */
const minutesBetween = (from: string, to: string): number | null => {
  const diff = (Date.parse(to) - Date.parse(from)) / 60_000;
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
};

export const buildCell = (input: RowInput, date: string): SheetCell => {
  const day = input.dayByDate.get(date) ?? null;
  const approvedLeave = leaveOn(input.leaves, date, "approved");
  const pendingLeave = leaveOn(input.leaves, date, "pending");
  const holiday = input.holidays.get(date) ?? "";

  const cell: SheetCell = {
    date,
    kind: "empty",
    counted: true,
    workedMinutes: null,
    planMinutes: input.planByDate.get(date) ?? 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    remote: false,
    day,
    leave: null,
    holiday,
    pending: pendingLeave ? ["leave"] : [],
    pendingLeave,
  };

  if (
    (input.hireDate && date < input.hireDate) ||
    (input.dismissalDate && date > input.dismissalDate) ||
    day?.status === "not_employed"
  ) {
    return { ...cell, kind: "outside", planMinutes: 0, pending: [], pendingLeave: null };
  }

  // Отсутствие снимает день целиком — и из нормы тоже.
  if (day?.status === "excused" || (!day && approvedLeave)) {
    const leave = input.leaves.find((item) => item.id === day?.requestId) ?? approvedLeave;
    return { ...cell, kind: "leave", planMinutes: 0, leave };
  }

  if (day?.status === "holiday" || (!day && holiday)) return { ...cell, kind: "holiday", planMinutes: 0 };
  if (day?.status === "day_off") return { ...cell, kind: "day_off", planMinutes: 0 };

  // Без смены — выходной и впереди: график известен заранее.
  if (!day) return { ...cell, kind: !cell.planMinutes ? "day_off" : date > input.today ? "future" : "empty" };

  const awaiting = day.review === "pending";
  if (awaiting) cell.pending = [...cell.pending, "mark"];

  if (day.status === "absent") return { ...cell, kind: "absent", counted: !awaiting };

  const worked = day.workedMinutes ?? (day.firstIn && day.lastOut ? minutesBetween(day.firstIn, day.lastOut) : null);
  const late = day.lateMinutes;
  const kind: CellKind =
    worked != null
      ? late > 0 || day.status === "late"
        ? "late"
        : "worked"
      : date === input.today && day.firstIn && !day.lastOut
        ? "at_work"
        : "missing_mark";

  return {
    ...cell,
    kind,
    counted: !awaiting,
    remote: day.status === "remote",
    workedMinutes: worked,
    lateMinutes: late,
    overtimeMinutes: overtimeOf(worked, cell.planMinutes),
  };
};

const WORKED_KINDS: CellKind[] = ["worked", "late", "at_work", "missing_mark"];

export const totalsOf = (cells: SheetCell[], today: string): SheetTotals => {
  const totals: SheetTotals = {
    days: 0,
    workedMinutes: 0,
    planMinutes: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    absences: 0,
  };
  // Баланс часов: переработка дня (с порогом) плюс недоработка дней со сменой —
  // опоздание и ранний уход съедают переработку других дней.
  let balance = 0;
  for (const cell of cells) {
    // Норма — по сменам до сегодня включительно: сравнивается с уже отработанным.
    if (cell.date <= today) totals.planMinutes += cell.planMinutes;
    if (!cell.counted) continue;
    if (cell.kind === "absent") totals.absences += 1;
    if (!WORKED_KINDS.includes(cell.kind)) continue;
    totals.days += 1;
    totals.workedMinutes += cell.workedMinutes ?? 0;
    totals.lateMinutes += cell.lateMinutes;
    if (cell.workedMinutes == null) {
      // Ухода нет — часы неизвестны, но опоздание по приходу уже известно.
      balance -= cell.lateMinutes;
    } else if (cell.planMinutes > 0) {
      // Опоздание этого дня уже внутри отработанного — второй раз не вычитаем.
      balance +=
        cell.workedMinutes >= cell.planMinutes ? cell.overtimeMinutes : cell.workedMinutes - cell.planMinutes;
    }
  }
  totals.overtimeMinutes = Math.max(0, balance);
  return totals;
};

export const buildRow = (input: RowInput): { cells: SheetCell[]; totals: SheetTotals } => {
  const cells = input.dates.map((date) => buildCell(input, date));
  return { cells, totals: totalsOf(cells, input.today) };
};

/* ---------- период ---------- */

export type Scale = "month" | "week" | "day";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (key: string) => new Date(`${key}T00:00:00Z`);

export const plusDays = (key: string, days: number): string => {
  const date = utc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};

/** Месяц опорной даты, её неделя с понедельника или сам день. */
export const rangeOf = (scale: Scale, anchor: string): { from: string; to: string } => {
  if (scale === "day") return { from: anchor, to: anchor };
  const date = utc(anchor);
  if (scale === "week") {
    const from = plusDays(anchor, -((date.getUTCDay() + 6) % 7));
    return { from, to: plusDays(from, 6) };
  }
  const from = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  const to = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  return { from, to };
};

/** Опорная дата на шаг назад или вперёд — на месяц, неделю или день. */
export const stepAnchor = (scale: Scale, anchor: string, direction: 1 | -1): string => {
  if (scale === "day") return plusDays(anchor, direction);
  if (scale === "week") return plusDays(anchor, 7 * direction);
  const date = utc(anchor);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)));
};

export const datesOf = ({ from, to }: { from: string; to: string }): string[] => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = plusDays(date, 1)) dates.push(date);
  return dates;
};

export const isWeekend = (key: string) => {
  const day = utc(key).getUTCDay();
  return day === 0 || day === 6;
};

/* ---------- календарь ---------- */

/** Статус дня в календаре — счётчики и отбор в подшапке (`kindStats` прототипа). */
export type DayStatus = "ok" | "late" | "absent" | "leave";

export const statusOf = (cell: SheetCell): DayStatus | null => {
  switch (cell.kind) {
    case "worked":
    case "at_work":
      return "ok";
    case "late":
      return "late";
    // Ухода нет, но опоздание по приходу уже известно.
    case "missing_mark":
      return cell.lateMinutes > 0 ? "late" : "ok";
    case "absent":
      return "absent";
    case "leave":
      return "leave";
    default:
      return null;
  }
};

/** Отсутствие полосой через несколько дней — как в календаре HRMS. */
export type Run = { kind: "day"; cell: SheetCell } | { kind: "leave"; leave: Leave; cells: SheetCell[] };

/** Дни, на которые ложится полоса отсутствия: одобренное — сам день отсутствия, ждущее — день без явки. */
const runLeave = (cell: SheetCell): Leave | null => {
  if (cell.kind === "leave") return cell.leave;
  if (cell.pendingLeave && ["empty", "future", "day_off"].includes(cell.kind)) return cell.pendingLeave;
  return null;
};

/** Подряд идущие дни одного отсутствия склеиваются в одну полосу. */
export const runsOf = (cells: SheetCell[]): Run[] => {
  const runs: Run[] = [];
  for (const cell of cells) {
    const leave = runLeave(cell);
    const last = runs.at(-1);
    if (leave && last?.kind === "leave" && last.leave.id === leave.id) last.cells.push(cell);
    else runs.push(leave ? { kind: "leave", leave, cells: [cell] } : { kind: "day", cell });
  }
  return runs;
};

/* ---------- список ---------- */

/** Внутри дня сначала проблемы — «Статус (сначала проблемы)» прототипа. */
const SEVERITY: Record<DayStatus, number> = { absent: 0, late: 1, ok: 2, leave: 3 };

/**
 * Строки списка: дни со статусом, не позже сегодня. Свежие дни выше,
 * внутри дня — прогулы, потом опоздания (большие выше), явки, отсутствия.
 */
export const listOf = <E>(rows: { employee: E; cells: SheetCell[] }[], today: string) =>
  rows
    .flatMap(({ employee, cells }) =>
      cells.filter((cell) => cell.date <= today && statusOf(cell)).map((cell) => ({ employee, cell })),
    )
    .sort(
      (a, b) =>
        b.cell.date.localeCompare(a.cell.date) ||
        SEVERITY[statusOf(a.cell)!] - SEVERITY[statusOf(b.cell)!] ||
        b.cell.lateMinutes - a.cell.lateMinutes,
    );
