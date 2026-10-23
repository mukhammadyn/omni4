import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, InfoIcon, LogInIcon, XIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { Tooltip } from "@/shared/ui/tooltip";
import type { Scale, SheetCell, SheetTotals } from "../model/timesheet";
import { EmployeeName, MoreRows, PeriodBar, SHEET_PAGE, GroupedRows, useAttendance, dayTone, useDayHead, type OpenDay, type OpenEmployee } from "./attendance-parts";
import { ATTENDANCE_TAB } from "./employee-tabs";
import { TimesheetDay } from "./TimesheetDay";

const SHEET_SCALES: readonly Scale[] = ["month", "week"];

/**
 * Табель — сотрудники × дни периода, в ячейке часы или знак дня, справа
 * итоги. Логика и UX — табеля HRMS (`udevs_hrms_admin`, Time/Sheet),
 * вид — `sheetView` прототипа (attendance.html). Клик по ячейке
 * открывает день (TimesheetDay).
 *
 * Сделан под `hr_attendance_days` (FIXED_VIEW_TYPES): данные грузит
 * сам (api/timesheet), строки view ему не нужны.
 */
export function Timesheet({ viewId, search, onOpenEmployee }: { viewId: string; search: string; onOpenEmployee: OpenEmployee }) {
  const { t, i18n } = useTranslation();
  const view = useAttendance(viewId, SHEET_SCALES, SHEET_PAGE, search);
  const { scale, range, dates, today, sheet, rows } = view;
  const [open, setOpen] = useState<OpenDay | null>(null);
  const head = useDayHead();
  const hours = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const openRow = open ? rows.find((row) => row.employee.id === open.employee.id) : undefined;
  const openCell = open ? openRow?.cells.find((cell) => cell.date === open.date) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={view}>
        <Legend types={sheet.absenceTypes} />
      </PeriodBar>

      {/* Поля — снаружи прокрутки: внутри неё ячейки заезжали бы
          в отступ слева от липкой колонки сотрудника. */}
      <div className="@container relative mx-6 mb-4 min-h-0 flex-1 overflow-auto">
        {sheet.fetching && !sheet.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        {/* Месяц — все дни в ширину видимой области (как табель прототипа), итоги — правее, под прокруткой. */}
        <table
          className={`border-separate border-spacing-0 text-xs ${scale === "week" ? "min-w-full" : "table-fixed"}`}
          style={scale === "week" ? undefined : { width: `calc(100cqw - 12px + ${TOTALS_PX}px)` }}
        >
          <thead>
            <tr>
              <th className={`${headCell} left-0 z-30 px-3 text-left font-normal text-fg-muted ${scale === "week" ? "min-w-[230px]" : "w-[200px]"}`}>
                {t("timesheet.employee")} <span className="text-fg-subtle">{sheet.total || ""}</span>
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className={`${headCell} z-20 px-0.5 text-center font-medium ${scale === "week" ? "min-w-[84px]" : ""} ${
                    dayTone(date, today, sheet.holidays)
                  }`}
                  title={sheet.holidays.get(date)}
                  /* Видимая ширина без колонки сотрудника и полосы прокрутки — поровну на дни. */
                  style={scale === "week" ? undefined : dayWidth(dates.length)}
                >
                  <div className="text-xs leading-tight">{head.day(date)}</div>
                  {/* День недели — только у недели: в месяце число и цвет выходного говорят сами. */}
                  {scale === "week" && <div className="text-2xs font-normal leading-tight opacity-70">{head.weekday(date)}</div>}
                </th>
              ))}
              {TOTALS.map((key, index) => (
                <th
                  key={key}
                  className={`${headCell} z-20 whitespace-nowrap px-2 text-right font-normal text-fg-muted ${index === 0 ? "border-l" : ""} ${scale === "week" ? "" : TOTAL_WIDTH[key]}`}
                >
                  <Tooltip label={t(`timesheet.colHint.${key}`)} placement="bottom">
                    <span className="cursor-help border-b border-dotted border-border-strong">{t(`timesheet.col.${key}`)}</span>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          {/* Пока едет новый период, на экране ещё строки прошлого —
              приглушены, чтобы их не приняли за данные этого. */}
          <tbody className={sheet.fetching && !sheet.loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {sheet.loading ? (
              <tr>
                <td colSpan={dates.length + 1 + TOTALS.length} className="py-10 text-center text-fg-subtle">
                  {t("common.loading")}
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={dates.length + 1 + TOTALS.length} className="py-10 text-center text-fg-subtle">
                  {t("table.noRows")}
                </td>
              </tr>
            ) : (
              <GroupedRows rows={rows} group={view.group} keysOf={({ employee }) => employee} colSpan={dates.length + 1 + TOTALS.length}>

                {({ employee, cells, totals }) => (
                <tr key={employee.id} className="group">
                  <td className={`${body} sticky left-0 z-10 bg-surface px-3 py-1 group-hover:tint-surface-hover`}>
                    <EmployeeName
                      employee={employee}
                      until={range.to}
                      avatar={<Avatar name={employee.name} photo={employee.photo || undefined} size="md" />}
                      brief
                      onOpen={() => onOpenEmployee(employee.id, ATTENDANCE_TAB)}
                    />
                  </td>
                  {cells.map((cell) => (
                    <td
                      key={cell.date}
                      className={`${body} text-center ${scale === "week" ? "px-0.5 py-[3px]" : "px-0 py-0.5"} ${cell.date === today ? "bg-accent-subtle/30" : ""}`}
                    >
                      <CellView
                        cell={cell}
                        hours={(minutes) => hours.format(minutes / 60)}
                        whole={scale !== "week"}
                        onOpen={() => setOpen({ employee, date: cell.date })}
                      />
                    </td>
                  ))}
                  <TotalsCells totals={totals} />
                </tr>
              )}

              </GroupedRows>
            )}
          </tbody>
        </table>
        <MoreRows sheet={sheet} />
      </div>

      {open && openCell && (
        <TimesheetDay
          employee={open.employee}
          cell={openCell}
          canPrev={open.date > range.from}
          canNext={open.date < range.to}
          onNavigate={(direction) =>
            setOpen({ ...open, date: dates[dates.indexOf(open.date) + direction] ?? open.date })
          }
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/* ---------- ячейки ---------- */

/*
 * Сетка — как у DataGrid: линии `border`, шапка липкая. Своя прокрутка
 * по обеим осям — иначе липкие шапка и колонка не держатся.
 */
const headCell = "sticky top-0 h-11 border-b border-border bg-surface";

/** Месяц: видимая ширина без колонки сотрудника (200px) и полосы прокрутки — поровну на дни. */
const dayWidth = (days: number) => ({ width: `calc((100cqw - 212px) / ${days})` });
const body = "border-b border-border";

const TOTALS = ["plan", "hours", "late", "overtime", "days", "absences"] as const;
/** Ширины итогов при месяце (раскладка fixed): длительностям «135ч 56м» — шире, счётчикам — уже. */
/** Сумма ширин итогов ниже — таблица шире экрана ровно на них (раскладка fixed). */
const TOTALS_PX = 72 + 84 + 76 + 76 + 48 + 68;
const TOTAL_WIDTH: Record<(typeof TOTALS)[number], string> = {
  plan: "w-[72px]",
  hours: "w-[84px]",
  late: "w-[76px]",
  overtime: "w-[76px]",
  days: "w-[48px]",
  absences: "w-[68px]",
};

/** Итог в часах и минутах: «8ч», «7ч 45м», «—». */
function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    if (minutes <= 0) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h && m ? t("timesheet.hm", { h, m }) : h ? t("timesheet.h", { h }) : t("timesheet.m", { m });
  };
}

/** Часы против нормы: от 80% — зелёный, от 50% — жёлтый, ниже — красный. */
const hoursColor = ({ workedMinutes, planMinutes }: SheetTotals) => {
  if (!planMinutes) return "text-fg";
  const ratio = workedMinutes / planMinutes;
  return ratio >= 0.8 ? "text-success" : ratio >= 0.5 ? "text-warning" : "text-danger";
};

function TotalsCells({ totals }: { totals: SheetTotals }) {
  const duration = useDuration();
  const cell = `${body} whitespace-nowrap px-2 text-right tabular-nums`;
  return (
    <>
      <td className={`${cell} border-l text-fg-subtle`}>{duration(totals.planMinutes)}</td>
      <td className={`${cell} font-semibold ${hoursColor(totals)}`}>{duration(totals.workedMinutes)}</td>
      <td className={`${cell} text-fg`}>{duration(totals.lateMinutes)}</td>
      <td className={`${cell} text-fg`}>{duration(totals.overtimeMinutes)}</td>
      <td className={`${cell} text-fg`}>{totals.days || "—"}</td>
      <td className={`${cell} ${totals.absences ? "font-semibold text-danger" : "text-fg-subtle"}`}>
        {totals.absences || "—"}
      </td>
    </>
  );
}

/** Код отсутствия цветом его типа — через палитру чипов, не сырым hex. */
const leaveStyle = (color: string) => CHIP_STYLES[hexToChipColor(color)];

function CellView({
  cell,
  hours,
  whole = false,
  onOpen,
}: {
  cell: SheetCell;
  hours: (minutes: number) => string;
  /** Месяц: все дни в экран — в ячейке целые часы, точные — в подсказке. */
  whole?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const duration = useDuration();
  if (cell.kind === "outside") return <div className={`bg-surface-soft ${whole ? "mx-auto size-7 rounded-[4px]" : "h-[30px] rounded-[5px]"}`} />;

  let content: ReactNode = null;
  let style = "text-fg";
  const hints: string[] = [];
  const plan = cell.planMinutes ? t("timesheet.hint.plan", { hours: hours(cell.planMinutes) }) : "";
  const worked = cell.workedMinutes != null ? t("timesheet.hint.worked", { hours: hours(cell.workedMinutes) }) : "";

  switch (cell.kind) {
    case "worked":
    case "late":
      content = cell.workedMinutes == null ? "—" : whole ? String(Math.round(cell.workedMinutes / 60)) : hours(cell.workedMinutes);
      if (cell.kind === "late") {
        style = "font-semibold text-warning";
        hints.push(t("timesheet.hint.late", { duration: duration(cell.lateMinutes) }));
      }
      if (cell.remote) hints.push(t("timesheet.hint.remote"));
      hints.push(worked, plan);
      if (cell.overtimeMinutes) hints.push(t("timesheet.hint.overtime", { duration: duration(cell.overtimeMinutes) }));
      break;
    case "at_work":
      content = <Icon as={LogInIcon} size={14} className="mx-auto text-success" />;
      hints.push(t("timesheet.hint.atWork"), plan);
      break;
    case "missing_mark":
      // Пусто, как «нет данных»: что именно не так — в подсказке и окне дня.
      hints.push(t(cell.day?.firstIn ? "timesheet.hint.missingOut" : "timesheet.hint.missingIn"), plan);
      break;
    case "absent":
      content = <Icon as={XIcon} size={14} className="mx-auto" />;
      style = CHIP_STYLES.red;
      hints.push(t("timesheet.hint.absent"), plan);
      break;
    case "leave":
      content = cell.leave?.code || "•";
      style = `font-semibold ${leaveStyle(cell.leave?.color ?? "")}`;
      hints.push(cell.leave?.title || t("timesheet.legend.leave"));
      break;
    case "holiday":
      content = t("timesheet.holidayShort");
      style = `font-semibold ${CHIP_STYLES.pink}`;
      hints.push(cell.holiday || t("timesheet.legend.holiday"));
      break;
    case "day_off":
      content = t("timesheet.dayOffShort");
      style = "text-fg-subtle";
      hints.push(t("timesheet.hint.dayOff"));
      break;
    case "empty":
      hints.push(t("timesheet.hint.empty"), plan);
      break;
    case "future":
      break;
  }
  // Не засчитано (ждёт согласования) — серым, точка скажет почему.
  if (!cell.counted) {
    style = "text-fg-subtle";
    hints.push(t("timesheet.hint.notCounted"));
  }
  if (cell.pending.includes("mark")) hints.push(t("timesheet.pending.mark"));
  if (cell.pendingLeave) hints.push(t("timesheet.pending.leave", { title: cell.pendingLeave.title }));

  return (
    <Tooltip label={hints.filter(Boolean).join(" · ")}>
      <button
        type="button"
        onClick={onOpen}
        /* Месяц — квадрат 28px по центру узкого дня; неделя — плашкой во всю ячейку. */
        className={`relative flex items-center justify-center px-0.5 text-xs ${whole ? "mx-auto size-7 rounded-[4px]" : "h-[30px] w-full rounded-[5px]"} tabular-nums outline-none transition hover:ring-1 hover:ring-accent hover:ring-inset focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${style}`}
      >
        {content}
        {cell.pending.length > 0 && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" />}
      </button>
    </Tooltip>
  );
}

/* ---------- обозначения ---------- */

const CODE = "inline-flex h-[19px] min-w-6 shrink-0 items-center justify-center rounded px-1 text-2xs font-semibold tabular-nums ring-1 ring-border ring-inset";

function Legend({ types }: { types: { title: string; code: string; color: string }[] }) {
  const { t } = useTranslation();
  const items: { code: ReactNode; style: string; label: string; desc: string }[] = [
    { code: "8,0", style: "text-fg", label: t("timesheet.legend.worked"), desc: t("timesheet.legendDesc.worked") },
    { code: "8,0", style: "text-warning", label: t("timesheet.legend.late"), desc: t("timesheet.legendDesc.late") },
    { code: <Icon as={XIcon} size={12} />, style: CHIP_STYLES.red, label: t("timesheet.legend.absent"), desc: t("timesheet.hint.absent") },
    { code: t("timesheet.dayOffShort"), style: "text-fg-subtle", label: t("timesheet.legend.dayOff"), desc: t("timesheet.hint.dayOff") },
    { code: t("timesheet.holidayShort"), style: CHIP_STYLES.pink, label: t("timesheet.legend.holiday"), desc: t("timesheet.legendDesc.holiday") },
    { code: <Icon as={LogInIcon} size={12} />, style: "text-success", label: t("timesheet.legend.atWork"), desc: t("timesheet.hint.atWork") },
    { code: "", style: "", label: t("timesheet.legend.missing"), desc: t("timesheet.legendDesc.missing") },
    { code: <span className="size-1.5 rounded-full bg-warning" />, style: "", label: t("timesheet.legend.pending"), desc: t("timesheet.legendDesc.pending") },
    ...types.map((type) => ({
      code: type.code || "•",
      style: leaveStyle(type.color),
      label: type.title,
      desc: t("timesheet.legendDesc.leave"),
    })),
  ];

  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover ${open ? "bg-surface-hover" : ""}`}
        >
          <Icon as={InfoIcon} size={14} />
          {t("timesheet.legend.title")}
          <span className="ml-0.5 hidden gap-[3px] md:inline-flex">
            {items.slice(0, 6).filter((_, i) => i !== 1).map((item, i) => (
              <em key={i} className={`${CODE} not-italic ${item.style}`}>
                {item.code}
              </em>
            ))}
          </span>
          <Icon as={ChevronDownIcon} size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {() => (
        <div className="w-[360px] max-w-[calc(100vw-32px)]">
          <div className="max-h-[420px] overflow-auto p-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
                <em className={`${CODE} mt-px h-[22px] min-w-8 text-xs not-italic ${item.style}`}>{item.code}</em>
                <div className="min-w-0">
                  <b className="block text-[13px] font-medium text-fg">{item.label}</b>
                  <small className="block text-xs leading-snug text-fg-muted">{item.desc}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-xs leading-snug text-fg-muted">
            {t("timesheet.legend.footer")}
          </div>
        </div>
      )}
    </Popover>
  );
}
