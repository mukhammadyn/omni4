import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlarmClockIcon,
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LogInIcon,
  PartyPopperIcon,
  PlaneIcon,
  TrendingUpIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";
import { todayInput } from "@/shared/lib/date-value";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { markClock, useTimesheet } from "../api/timesheet";
import {
  buildRow,
  datesOf,
  rangeOf,
  statusOf,
  stepAnchor,
  type SheetCell,
} from "../model/timesheet";
import { TimesheetDay } from "./TimesheetDay";

type Filter = "" | "late" | "absent" | "leave" | "over";

/**
 * Вкладка «Посещаемость» страницы сотрудника — `attTab` прототипа
 * (employee.html): итоги месяца, отбор дней и календарь месяца, в дне —
 * приход → уход, полоса отработанного от смены и статус. Клик по дню —
 * то же окно дня, что у экранов посещаемости (TimesheetDay).
 *
 * Данные — те же, что у табеля (api/timesheet), только одного человека.
 */
export function EmployeeAttendance({ employeeId }: { employeeId: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const today = todayInput();
  const [anchor, setAnchor] = useState(today);
  const [filter, setFilter] = useState<Filter>("");
  const [open, setOpen] = useState<string | null>(null);

  const month = rangeOf("month", anchor);
  // Сетка — целые недели: с понедельника до первого числа, до воскресенья после последнего.
  const grid = useMemo(
    () => ({ from: rangeOf("week", month.from).from, to: rangeOf("week", month.to).to }),
    [month.from, month.to],
  );
  const dates = useMemo(() => datesOf(grid), [grid]);
  const sheet = useTimesheet({ ...grid, dates, today, search: "", employeeId });
  const employee = sheet.employees[0];
  const row = useMemo(() => (employee ? buildRow(sheet.inputOf(employee)) : null), [employee, sheet]);
  const cells = row?.cells ?? [];
  const inMonth = cells.filter((cell) => cell.date >= month.from && cell.date <= month.to);

  const stats = useMemo(() => {
    const own = row ? buildRow({ ...sheet.inputOf(employee!), dates: datesOf(month) }).totals : null;
    return {
      totals: own,
      late: inMonth.filter((cell) => statusOf(cell) === "late").length,
      absent: inMonth.filter((cell) => cell.kind === "absent").length,
      leave: inMonth.filter((cell) => cell.kind === "leave").length,
    };
  }, [row, sheet, employee, month, inMonth]);

  const hit = (cell: SheetCell) =>
    !filter ||
    (filter === "late" && statusOf(cell) === "late") ||
    (filter === "absent" && cell.kind === "absent") ||
    (filter === "leave" && cell.kind === "leave") ||
    (filter === "over" && cell.overtimeMinutes >= 30);

  const label = capitalize(
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(month.from)),
  );
  const weekdays = dates.slice(0, 7).map((date) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(utc(date)),
  );
  const totals = stats.totals;
  const percent = totals?.planMinutes ? Math.round((totals.workedMinutes / totals.planMinutes) * 100) : 0;
  const openCell = open ? cells.find((cell) => cell.date === open) : undefined;

  return (
    <section className="rounded-[10px] border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon as={CalendarClockIcon} size={16} className="text-fg-muted" />
        <div>
          <h3 className="text-[15px] font-semibold">{t("employeeAttendance.title")}</h3>
          <p className="text-xs text-fg-subtle">{t("employeeAttendance.subtitle")}</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* `.at-sum` — итоги месяца. */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Kpi
            icon={ClockIcon}
            label={t("employeeAttendance.kpi.worked")}
            value={hm(totals?.workedMinutes ?? 0)}
            note={t("employeeAttendance.kpi.workedOf", { plan: hm(totals?.planMinutes ?? 0), percent })}
            bar={percent}
          />
          <Kpi
            icon={AlarmClockIcon}
            label={t("employeeAttendance.kpi.late")}
            value={String(stats.late)}
            note={totals?.lateMinutes ? t("employeeAttendance.kpi.lateTotal", { time: hm(totals.lateMinutes) }) : t("employeeAttendance.kpi.noLate")}
          />
          <Kpi icon={UserXIcon} label={t("employeeAttendance.kpi.absent")} value={String(stats.absent)} note={t("employeeAttendance.kpi.absentNote")} />
          <Kpi icon={PlaneIcon} label={t("employeeAttendance.kpi.leave")} value={String(stats.leave)} note={t("employeeAttendance.kpi.leaveNote")} />
          <Kpi
            icon={TrendingUpIcon}
            label={t("employeeAttendance.kpi.overtime")}
            value={hm(totals?.overtimeMinutes ?? 0)}
            note={t("employeeAttendance.kpi.overtimeNote")}
          />
        </div>

        {/* `.at-bar-top` — период и отбор дней. */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <NavButton label={t("timesheet.back")} onClick={() => setAnchor(stepAnchor("month", anchor, -1))}>
            <Icon as={ChevronLeftIcon} size={16} />
          </NavButton>
          <NavButton label={t("timesheet.forward")} onClick={() => setAnchor(stepAnchor("month", anchor, 1))}>
            <Icon as={ChevronRightIcon} size={16} />
          </NavButton>
          <b className="mx-1 font-semibold">{label}</b>
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="h-7 rounded-md border border-border px-2.5 text-[13px] transition-colors hover:bg-surface-hover"
          >
            {t("timesheet.today")}
          </button>
          <span className="ml-auto flex flex-wrap gap-1">
            {(
              [
                ["", t("employeeAttendance.filter.all"), null],
                ["late", t("employeeAttendance.filter.late"), stats.late],
                ["absent", t("employeeAttendance.filter.absent"), stats.absent],
                ["leave", t("employeeAttendance.filter.leave"), stats.leave],
                ["over", t("employeeAttendance.filter.over"), null],
              ] as [Filter, string, number | null][]
            ).map(([key, text, count]) => (
              <button
                key={key || "all"}
                type="button"
                onClick={() => setFilter(key)}
                className={`h-7 rounded-full border px-2.5 text-[13px] transition-colors ${
                  filter === key ? "border-accent bg-accent-subtle text-accent-text" : "border-border text-fg-muted hover:bg-surface-hover"
                }`}
              >
                {text}
                {count ? <span className="ml-1 text-fg-subtle">{count}</span> : null}
              </button>
            ))}
          </span>
        </div>

        {/* `.at-cal` — месяц неделями. */}
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-surface-soft text-xs text-fg-muted">
            {weekdays.map((day, i) => (
              <div key={day} className={`px-2 py-1.5 ${i > 4 ? "text-danger" : ""}`}>
                {day}
              </div>
            ))}
          </div>
          {sheet.loading ? (
            <p className="py-10 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((cell) => (
                <DayBox
                  key={cell.date}
                  cell={cell}
                  outside={cell.date < month.from || cell.date > month.to}
                  today={cell.date === today}
                  dim={!hit(cell)}
                  onOpen={() => setOpen(cell.date)}
                />
              ))}
            </div>
          )}
        </div>

        {/* `.at-legend`. */}
        <div className="flex flex-wrap gap-3 text-xs text-fg-muted">
          {(
            [
              ["bg-success", t("attendanceCalendar.status.ok")],
              ["bg-warning", t("attendanceCalendar.status.late")],
              ["bg-danger", t("attendanceCalendar.status.absent")],
              ["bg-accent", t("attendanceCalendar.status.leave")],
              ["bg-chip-pink-fg", t("timesheet.legend.holiday")],
              ["bg-fg-subtle", t("timesheet.legend.dayOff")],
            ] as const
          ).map(([dot, text]) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <i className={`size-2 rounded-full ${dot}`} />
              {text}
            </span>
          ))}
        </div>
      </div>

      {employee && openCell && (
        <TimesheetDay
          employee={employee}
          cell={openCell}
          canPrev={openCell.date > grid.from}
          canNext={openCell.date < grid.to}
          onNavigate={(direction) => setOpen(dates[dates.indexOf(openCell.date) + direction] ?? openCell.date)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

const STATUS_BAR: Record<string, string> = { ok: "bg-success", late: "bg-warning", absent: "bg-danger", leave: "bg-accent" };

/** День месяца — `.at-day` прототипа. */
function DayBox({
  cell,
  outside,
  today,
  dim,
  onOpen,
}: {
  cell: SheetCell;
  outside: boolean;
  today: boolean;
  dim: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const firstIn = cell.day?.firstIn ? markClock(cell.day.firstIn) : "";
  const lastOut = cell.day?.lastOut ? markClock(cell.day.lastOut) : "";
  const status = statusOf(cell);
  const percent = cell.workedMinutes != null && cell.planMinutes ? Math.min(100, (cell.workedMinutes / cell.planMinutes) * 100) : 0;
  const tag = tagOf(cell, t);
  const clickable = cell.kind !== "outside";

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onOpen}
      className={`flex min-h-24 flex-col gap-1 border-r border-b border-border p-2 text-left text-xs transition-colors [&:nth-child(7n)]:border-r-0 ${
        clickable ? "hover:bg-surface-hover" : "bg-surface-soft"
      } ${outside ? "opacity-40" : ""} ${dim ? "opacity-25" : ""} ${today ? "bg-accent-subtle/30" : ""}`}
    >
      <span className="flex items-center justify-between">
        <span className={`font-semibold ${today ? "text-accent-text" : "text-fg"}`}>{Number(cell.date.slice(8))}</span>
        {cell.planMinutes > 0 && <span className="text-2xs text-fg-subtle">{hm(cell.planMinutes)}</span>}
      </span>
      {firstIn && (
        <>
          <span className="inline-flex items-center gap-1 tabular-nums text-fg">
            <Icon as={LogInIcon} size={11} className="text-fg-subtle" />
            {firstIn} <span className="text-fg-subtle">→</span> {lastOut || "…"}
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-surface-soft">
            <i className={`block h-full rounded-full ${STATUS_BAR[status ?? "ok"]}`} style={{ width: `${percent}%` }} />
          </span>
          <span className="tabular-nums text-fg-muted">
            {cell.workedMinutes != null ? hm(cell.workedMinutes) : "—"}
            {cell.overtimeMinutes >= 30 && <span className="ml-1 text-success">+{hm(cell.overtimeMinutes)}</span>}
          </span>
        </>
      )}
      {tag && (
        <span className={`mt-auto inline-flex max-w-full items-center gap-1 self-start truncate rounded-md px-1.5 py-0.5 text-2xs font-medium ${CHIP_STYLES[tag.color]}`}>
          {tag.icon && <Icon as={tag.icon} size={11} />}
          <span className="truncate">{tag.label}</span>
        </span>
      )}
    </button>
  );
}

function tagOf(cell: SheetCell, t: TFunction): { label: string; color: ChipColor; icon?: LucideIcon } | null {
  switch (cell.kind) {
    case "worked":
      return { label: t("attendanceCalendar.status.ok"), color: "green" };
    case "late":
      return { label: t("timesheet.status.late", { minutes: cell.lateMinutes }), color: "orange" };
    case "at_work":
      return { label: t("timesheet.legend.atWork"), color: "green", icon: LogInIcon };
    case "missing_mark":
      return { label: t("timesheet.legend.missing"), color: "yellow" };
    case "absent":
      return { label: t("timesheet.legend.absent"), color: "red", icon: UserXIcon };
    case "leave":
      return cell.leave
        ? { label: cell.leave.title, color: hexToChipColor(cell.leave.color), icon: PlaneIcon }
        : { label: t("timesheet.legend.leave"), color: "purple", icon: PlaneIcon };
    case "holiday":
      return { label: cell.holiday || t("timesheet.legend.holiday"), color: "pink", icon: PartyPopperIcon };
    default:
      return null;
  }
}

function Kpi({ icon, label, value, note, bar }: { icon: LucideIcon; label: string; value: string; note: string; bar?: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <small className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Icon as={icon} size={13} />
        {label}
      </small>
      <b className="mt-1 block text-lg font-semibold tabular-nums">{value}</b>
      <span className="text-2xs text-fg-subtle">{note}</span>
      {bar !== undefined && (
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-soft">
          <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, bar)}%` }} />
        </span>
      )}
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

const utc = (key: string) => new Date(`${key}T00:00:00Z`);
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);
