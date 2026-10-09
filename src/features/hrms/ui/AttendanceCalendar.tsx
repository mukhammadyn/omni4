import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CircleSlashIcon,
  Clock3Icon,
  LogInIcon,
  LogOutIcon,
  PartyPopperIcon,
  PlaneIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/features/item";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { markClock } from "../api/timesheet";
import { isWeekend, runsOf, statusOf, type Leave, type SheetCell } from "../model/timesheet";
import {
  EmployeeName,
  PeriodBar,
  STATUS_DOT,
  StatusChips,
  useAttendance,
  useDayHead,
  useStatusFilter,
  type OpenDay,
  type OpenEmployee,
} from "./attendance-parts";
import { ATTENDANCE_TAB } from "./employee-tabs";
import { TimesheetDay } from "./TimesheetDay";


/**
 * «Календарь» посещаемости. Месяц — календарь HRMS (`udevs_hrms_admin`,
 * modules/Calendar): статус дня значком на цветной плашке, отсутствие —
 * одной полосой через свои дни, ждущее решения — пунктиром. Неделя
 * и день — `evView` прототипа (attendance.html): приход, уход и полоса
 * отработанного от смены. Над сеткой — счётчики статусов за период,
 * щелчок по ним оставляет яркими только эти дни (`kindStats` прототипа).
 *
 * Клик по дню — то же окно дня, что у табеля (TimesheetDay). Данные —
 * те же (api/timesheet). Сделан под `hr_attendance_days` (FIXED_VIEW_TYPES).
 */
export function AttendanceCalendar({ viewId, onOpenEmployee }: { viewId: string; onOpenEmployee: OpenEmployee }) {
  const { t } = useTranslation();
  const view = useAttendance(viewId);
  const { scale, range, dates, today, sheet, rows } = view;
  const [open, setOpen] = useState<OpenDay | null>(null);
  const head = useDayHead();
  const month = scale === "month";

  const filter = useStatusFilter();
  const allCells = useMemo(() => rows.flatMap((row) => row.cells), [rows]);
  const dim = (cell: SheetCell) => !filter.hit(cell);

  const openRow = open ? rows.find((row) => row.employee.id === open.employee.id) : undefined;
  const openCell = open ? openRow?.cells.find((cell) => cell.date === open.date) : undefined;
  const width = month ? "min-w-[44px]" : scale === "week" ? "min-w-[150px]" : "min-w-[320px]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={view}>
        <StatusChips cells={allCells} filter={filter} />
      </PeriodBar>

      <div className="relative mx-6 mb-4 min-h-0 flex-1 overflow-auto">
        {sheet.fetching && !sheet.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className={`${headCell} left-0 z-30 min-w-[230px] px-3 text-left font-normal text-fg-muted`}>
                {t("timesheet.employee")} <span className="text-fg-subtle">{rows.length || ""}</span>
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className={`${headCell} z-20 px-1 font-medium ${width} ${month ? "text-center" : "text-left"} ${
                    date === today ? "bg-accent-subtle text-accent-text" : isWeekend(date) ? "text-danger" : "text-fg-muted"
                  }`}
                >
                  {month ? (
                    <>
                      <div className="text-xs leading-tight">{head.day(date)}</div>
                      <div className="text-2xs font-normal leading-tight opacity-70">{head.weekday(date)}</div>
                    </>
                  ) : (
                    <span className="px-1 text-xs">
                      {head.weekday(date)}, {head.day(date)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={sheet.fetching && !sheet.loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {sheet.loading ? (
              <tr>
                <td colSpan={dates.length + 1} className="py-10 text-center text-fg-subtle">
                  {t("common.loading")}
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={dates.length + 1} className="py-10 text-center text-fg-subtle">
                  {t("table.noRows")}
                </td>
              </tr>
            ) : (
              rows.map(({ employee, cells }) => (
                <tr key={employee.id} className="group">
                  <td className={`${body} sticky left-0 z-10 bg-surface px-3 py-1 group-hover:bg-surface-hover`}>
                    <EmployeeName
                      employee={employee}
                      until={range.to}
                      avatar={<Avatar name={employee.name} photo={employee.photo || undefined} size="lg" />}
                      onOpen={() => onOpenEmployee(employee.id, ATTENDANCE_TAB)}
                    />
                  </td>
                  {runsOf(cells).map((run) => {
                    const first = run.kind === "day" ? run.cell : run.cells[0]!;
                    const openDay = () => setOpen({ employee, date: first.date });
                    const shade = isWeekend(first.date) && run.kind === "day" ? "bg-surface-soft/60" : "";
                    return run.kind === "leave" ? (
                      <td
                        key={first.date}
                        colSpan={run.cells.length}
                        className={`${body} px-0.5 py-1 ${first.date === today ? "bg-accent-subtle/30" : ""} ${dim(first) ? "opacity-30" : ""}`}
                      >
                        <LeaveBar leave={run.leave} days={run.cells.length} wide={!month} onOpen={openDay} />
                      </td>
                    ) : (
                      <td
                        key={first.date}
                        className={`${body} px-0.5 py-1 ${first.date === today ? "bg-accent-subtle/30" : shade} ${dim(first) ? "opacity-30" : ""}`}
                      >
                        {month ? <MonthCell cell={first} onOpen={openDay} /> : <DayCard cell={first} onOpen={openDay} />}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && openCell && (
        <TimesheetDay
          employee={open.employee}
          cell={openCell}
          canPrev={open.date > range.from}
          canNext={open.date < range.to}
          onNavigate={(direction) => setOpen({ ...open, date: dates[dates.indexOf(open.date) + direction] ?? open.date })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

const headCell = "sticky top-0 h-11 border-b border-border bg-surface";
const body = "border-b border-border";

/** Значок дня — `AttendanceIcon` календаря HRMS. */
const DAY_ICON: Partial<Record<SheetCell["kind"], { icon: LucideIcon; color: ChipColor }>> = {
  worked: { icon: CheckIcon, color: "green" },
  late: { icon: Clock3Icon, color: "orange" },
  at_work: { icon: LogInIcon, color: "green" },
  absent: { icon: XIcon, color: "red" },
  holiday: { icon: PartyPopperIcon, color: "pink" },
};

/** Подсказка дня: статус, ждущее решения. */
function useHint() {
  const { t } = useTranslation();
  return (cell: SheetCell) =>
    [
      cell.kind === "holiday"
        ? cell.holiday || t("timesheet.legend.holiday")
        : statusOf(cell) && t(`attendanceCalendar.status.${statusOf(cell)!}`),
      cell.kind === "late" || (cell.kind === "missing_mark" && cell.lateMinutes)
        ? t("timesheet.status.late", { minutes: cell.lateMinutes })
        : "",
      cell.kind === "missing_mark" ? t(cell.day?.firstIn ? "timesheet.hint.missingOut" : "timesheet.hint.missingIn") : "",
      cell.pending.includes("mark") ? t("timesheet.pending.mark") : "",
      cell.pendingLeave ? t("timesheet.pending.leave", { title: cell.pendingLeave.title }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
}

function MonthCell({ cell, onOpen }: { cell: SheetCell; onOpen: () => void }) {
  const hint = useHint();
  if (cell.kind === "outside") return <div className="h-8 rounded-md bg-surface-soft" />;
  // Ухода нет: значок — по приходу, опоздал или нет.
  const look =
    cell.kind === "missing_mark" ? DAY_ICON[cell.lateMinutes > 0 ? "late" : "worked"] : DAY_ICON[cell.kind];
  if (!look) return <div className="h-8" />;
  const awaiting = cell.pending.includes("mark");

  return (
    <Tooltip label={hint(cell)}>
      <button
        type="button"
        onClick={onOpen}
        className={`relative flex h-8 w-full items-center justify-center rounded-md transition hover:ring-2 hover:ring-accent/30 ${
          CHIP_STYLES[look.color]
        } ${awaiting ? "border border-dashed border-warning" : ""}`}
      >
        <Icon as={look.icon} size={16} />
        {cell.kind === "missing_mark" && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" />}
      </button>
    </Tooltip>
  );
}

/** Отсутствие полосой — сегмент календаря HRMS; ждущее решения — пунктиром и серым. */
function LeaveBar({ leave, days, wide, onOpen }: { leave: Leave; days: number; wide: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const pending = leave.status === "pending";
  const showTitle = days > 1 || wide;
  const period = leave.from === leave.to ? dmy(leave.from) : `${dmy(leave.from)} — ${dmy(leave.to)}`;
  return (
    <Tooltip label={[leave.title, period, pending ? t("attendanceCalendar.awaiting") : ""].filter(Boolean).join(" · ")}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex h-8 w-full items-center gap-1 overflow-hidden rounded-md text-xs font-medium transition hover:ring-2 hover:ring-accent/30 ${
          showTitle ? "px-2" : "justify-center"
        } ${pending ? `border border-dashed border-border-strong ${CHIP_STYLES.gray}` : CHIP_STYLES[hexToChipColor(leave.color)]}`}
      >
        {pending && showTitle && <Icon as={Clock3Icon} size={13} className="shrink-0" />}
        <DynamicIcon name={leave.icon} size={16} fallback={<Icon as={PlaneIcon} size={16} />} />
        {showTitle && <span className="truncate">{leave.title}</span>}
      </button>
    </Tooltip>
  );
}

/** Карточка дня недели — `.evc` прототипа: приход, уход, полоса отработанного от смены. */
function DayCard({ cell, onOpen }: { cell: SheetCell; onOpen: () => void }) {
  const { t } = useTranslation();
  const hint = useHint();
  if (cell.kind === "outside") return <div className="h-12 rounded-md bg-surface-soft" />;

  const firstIn = cell.day?.firstIn ? markClock(cell.day.firstIn) : "";
  if (firstIn) {
    const lastOut = cell.day?.lastOut ? markClock(cell.day.lastOut) : "";
    const status = statusOf(cell) ?? "ok";
    const percent = cell.workedMinutes != null ? Math.min(100, (cell.workedMinutes / (cell.planMinutes || 480)) * 100) : 0;
    return (
      <Tooltip label={hint(cell)}>
        <button
          type="button"
          onClick={onOpen}
          className={`relative w-full rounded-md border px-2 py-1.5 text-left transition hover:ring-2 hover:ring-accent/30 ${
            cell.pending.includes("mark") ? "border-dashed border-warning" : "border-border"
          } bg-surface`}
        >
          <span className={`absolute inset-y-1 left-0 w-0.5 rounded-full ${STATUS_DOT[status]}`} />
          <span className="flex items-center gap-2 text-xs tabular-nums">
            <span className={`inline-flex items-center gap-1 ${status === "late" ? "font-semibold text-warning" : "text-fg"}`}>
              <Icon as={LogInIcon} size={12} />
              {firstIn}
            </span>
            {lastOut ? (
              <span className="inline-flex items-center gap-1 text-fg-muted">
                <Icon as={LogOutIcon} size={12} />
                {lastOut}
              </span>
            ) : (
              <span className="text-fg-subtle" title={t("timesheet.hint.missingOut")}>
                <Icon as={CircleSlashIcon} size={12} />
              </span>
            )}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-soft">
              <i className={`block h-full rounded-full ${STATUS_DOT[status]}`} style={{ width: `${percent}%` }} />
            </span>
            <small className="text-2xs text-fg-subtle tabular-nums">
              {cell.workedMinutes != null ? hm(cell.workedMinutes) : "—"}
            </small>
          </span>
        </button>
      </Tooltip>
    );
  }

  const tag =
    cell.kind === "absent"
      ? { icon: XIcon, color: "red" as ChipColor, label: t("timesheet.legend.absent") }
      : cell.kind === "holiday"
        ? { icon: PartyPopperIcon, color: "pink" as ChipColor, label: cell.holiday || t("timesheet.legend.holiday") }
        : null;
  if (!tag) return <div className="h-12" />;
  return (
    <Tooltip label={hint(cell)}>
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md px-2 text-xs font-medium ${CHIP_STYLES[tag.color]} ${
          cell.pending.includes("mark") ? "border border-dashed border-warning" : ""
        }`}
      >
        <Icon as={tag.icon} size={12} />
        <span className="truncate">{tag.label}</span>
      </button>
    </Tooltip>
  );
}

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const dmy = (key: string) => key.split("-").reverse().join(".");
