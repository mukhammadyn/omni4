import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CameraIcon, CheckIcon, EyeIcon, XIcon } from "lucide-react";
import { Avatar, fileUrl, useUpdateItem } from "@/features/item";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { openPreview } from "@/shared/ui/file-preview";
import { Icon } from "@/shared/ui/icon";
import { pageCount } from "@/shared/ui/pagination";
import { ATTENDANCE_DAYS, markClock, useDayMarks, type DayMarks } from "../api/timesheet";
import { listOf, statusOf, type DayStatus, type SheetCell } from "../model/timesheet";
import { EmployeeName, Pager, useScopedPage, PeriodBar, StatusChips, useAttendance, useStatusFilter, type OpenDay, type OpenEmployee } from "./attendance-parts";
import { ATTENDANCE_TAB } from "./employee-tabs";
import { TimesheetDay } from "./TimesheetDay";

const PAGE = 20;

const STATUS_CHIP: Record<DayStatus, ChipColor> = { ok: "green", late: "orange", absent: "red", leave: "purple" };
const REVIEW_CHIP: Record<string, ChipColor> = { pending: "blue", approved: "green", rejected: "red" };
const SOURCE_CHIP: Record<string, ChipColor> = { hikvision: "blue", mobile: "purple", web: "gray", manual: "yellow" };

/**
 * «Список» посещаемости — список отметок HRMS (`udevs_hrms_admin`,
 * Time/Attendance): строка — день сотрудника; приход, уход, опоздание,
 * статус, статус заявки, источник, фото, расстояние, комментарий;
 * «Подтвердить / Отклонить» прямо в строке, когда отметка ждёт решения.
 * Как там — по одному дню и страницами по 20. Из прототипа (`listView`) —
 * неделя и месяц, счётчики статусов и порядок «сначала проблемы».
 *
 * Строка — та же ячейка, что у табеля и календаря (model/timesheet),
 * клик по строке — страница сотрудника на вкладке «Посещаемость»
 * (`employee.html#att` прототипа), «глаз» — то же окно дня.
 * Сделан под `hr_attendance_days` (FIXED_VIEW_TYPES).
 */
export function AttendanceList({ viewId, onOpenEmployee }: { viewId: string; onOpenEmployee: OpenEmployee }) {
  const { t, i18n } = useTranslation();
  const view = useAttendance(viewId, LIST_SCALES);
  const { range, dates, today, sheet, rows } = view;
  const filter = useStatusFilter();
  const [page, setPage] = useScopedPage(`${range.from}|${view.search}|${[...filter.only].join()}`);
  const [open, setOpen] = useState<OpenDay | null>(null);
  const update = useUpdateItem(ATTENDANCE_DAYS);

  const all = useMemo(() => listOf(rows, today), [rows, today]);
  const shown = useMemo(() => all.filter(({ cell }) => filter.hit(cell)), [all, filter]);
  const pages = pageCount(shown.length, PAGE);
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * PAGE, current * PAGE);

  /* Отметки — только сотрудников и дат этой страницы: за месяц их больше одной порции. */
  const ids = useMemo(() => [...new Set(slice.map(({ employee }) => employee.id))], [slice]);
  const marks = useDayMarks(ids, slice.at(-1)?.cell.date ?? range.from, slice[0]?.cell.date ?? range.to);

  const dateLabel = new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const decide = (cell: SheetCell, review: "approved" | "rejected") =>
    cell.day && update.mutate({ guid: cell.day.id, values: { review } });

  const openRow = open ? rows.find((row) => row.employee.id === open.employee.id) : undefined;
  const openCell = open ? openRow?.cells.find((cell) => cell.date === open.date) : undefined;
  const columns = COLUMNS.map((key) => t(`attendanceList.col.${key}`));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={view}>
        <StatusChips cells={all.map(({ cell }) => cell)} filter={filter} />
      </PeriodBar>

      <div className="relative mx-6 min-h-0 flex-1 overflow-auto">
        {sheet.fetching && !sheet.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        <table className="min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {columns.map((label, i) => (
                <th
                  key={COLUMNS[i]}
                  className={`sticky top-0 z-20 h-9 border-b border-border bg-surface px-2 text-left text-xs font-normal whitespace-nowrap text-fg-muted ${
                    i === 0 ? "left-0 z-30 pl-3" : ""
                  } ${i === columns.length - 1 ? "text-right" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={sheet.fetching && !sheet.loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {sheet.loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-fg-subtle">
                  {t("common.loading")}
                </td>
              </tr>
            ) : !slice.length ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-fg-subtle">
                  {t(dates[0]! > today ? "attendanceList.future" : "table.noRows")}
                </td>
              </tr>
            ) : (
              slice.map(({ employee, cell }) => {
                const status = statusOf(cell)!;
                const day = cell.day;
                const mark = marks.get(`${employee.id}|${cell.date}`);
                const awaiting = cell.pending.includes("mark");
                return (
                  <tr
                    key={`${employee.id}|${cell.date}`}
                    onClick={() => onOpenEmployee(employee.id, ATTENDANCE_TAB)}
                    className="group cursor-pointer"
                  >
                    <td className={`${td} sticky left-0 z-10 bg-surface pl-3 group-hover:bg-surface-hover`}>
                      <EmployeeName
                        employee={employee}
                        until={range.to}
                        avatar={<Avatar name={employee.name} photo={employee.photo || undefined} size="md" />}
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{dateLabel.format(new Date(`${cell.date}T00:00:00Z`))}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{day?.firstIn ? markClock(day.firstIn) : "—"}</td>
                    <td className={`${td} tabular-nums`}>
                      {day?.lastOut ? (
                        markClock(day.lastOut)
                      ) : cell.kind === "at_work" ? (
                        <Tag color="green">{t("timesheet.legend.atWork")}</Tag>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${td} tabular-nums ${cell.lateMinutes ? "font-semibold text-danger" : "text-fg-subtle"}`}>
                      {cell.lateMinutes ? hm(cell.lateMinutes) : "—"}
                    </td>
                    <td className={`${td} tabular-nums ${cell.overtimeMinutes ? "text-success" : "text-fg-subtle"}`}>
                      {cell.overtimeMinutes ? `+${hm(cell.overtimeMinutes)}` : "—"}
                    </td>
                    <td className={td}>
                      {cell.kind === "leave" && cell.leave ? (
                        <Tag color={hexToChipColor(cell.leave.color)}>{cell.leave.title}</Tag>
                      ) : (
                        <Tag color={STATUS_CHIP[status]}>{t(`attendanceCalendar.status.${status}`)}</Tag>
                      )}
                    </td>
                    <td className={td}>
                      {day && REVIEW_CHIP[day.review] ? (
                        <Tag color={REVIEW_CHIP[day.review]!}>{t(`attendanceList.review.${day.review as "pending"}`)}</Tag>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className={td}>
                      {mark?.source ? <Tag color={SOURCE_CHIP[mark.source] ?? "gray"}>{t(`timesheet.source.${source(mark)}`)}</Tag> : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className={td}>
                      <Photos mark={mark} />
                    </td>
                    <td className={`${td} tabular-nums ${mark?.distance != null && mark.distance > 150 ? "font-semibold text-danger" : ""}`}>
                      {mark?.distance != null
                        ? mark.distance >= 1000
                          ? t("attendanceList.km", { value: (mark.distance / 1000).toFixed(1) })
                          : t("attendanceList.m", { value: Math.round(mark.distance) })
                        : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className={`${td} max-w-[240px] truncate text-fg-muted`} title={day?.comment || undefined}>
                      {day?.comment || <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`} onClick={(event) => event.stopPropagation()}>
                      {awaiting ? (
                        <span className="inline-flex gap-1">
                          <RowButton label={t("timesheet.day.approve")} tone="ok" disabled={update.isPending} onClick={() => decide(cell, "approved")}>
                            <Icon as={CheckIcon} size={14} />
                          </RowButton>
                          <RowButton label={t("timesheet.day.reject")} tone="danger" disabled={update.isPending} onClick={() => decide(cell, "rejected")}>
                            <Icon as={XIcon} size={14} />
                          </RowButton>
                        </span>
                      ) : (
                        <RowButton label={t("attendanceList.open")} tone="plain" onClick={() => setOpen({ employee, date: cell.date })}>
                          <Icon as={EyeIcon} size={14} />
                        </RowButton>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pager page={current} pages={pages} total={shown.length} size={PAGE} onPage={setPage} />

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

/** Как в HRMS — по умолчанию один день. */
const LIST_SCALES = ["day", "week", "month"] as const;

const COLUMNS = [
  "employee",
  "date",
  "in",
  "out",
  "late",
  "overtime",
  "status",
  "review",
  "source",
  "photo",
  "distance",
  "comment",
  "actions",
] as const;

const td = "h-11 border-b border-border px-2 whitespace-nowrap group-hover:bg-surface-hover";

const SOURCES = ["hikvision", "mobile", "web", "manual"] as const;
const source = (mark: DayMarks) => SOURCES.find((item) => item === mark.source) ?? "manual";

function Tag({ color, children }: { color: ChipColor; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_STYLES[color]}`}>{children}</span>;
}

/** Фото прихода и ухода миниатюрами — как в HRMS; щелчок — просмотр. */
function Photos({ mark }: { mark: DayMarks | undefined }) {
  const photos = mark?.photos ?? [];
  if (!photos.length) return <span className="text-fg-subtle">—</span>;
  const shown = [photos.find((p) => p.in), photos.findLast((p) => !p.in)].filter((p) => p !== undefined);
  return (
    <span className="flex gap-1" onClick={(event) => event.stopPropagation()}>
      {(shown.length ? shown : photos.slice(0, 2)).map((photo) => (
        <button
          key={photo.at}
          type="button"
          title={markClock(photo.at)}
          onClick={() => openPreview(photos.map((p) => fileUrl(p.url)), photos.indexOf(photo), "image")}
          className="relative size-8 overflow-hidden rounded-md border border-border bg-surface-soft hover:opacity-80"
        >
          <img src={fileUrl(photo.url)} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      ))}
      {photos.length > 2 && (
        <span className="inline-flex items-center gap-0.5 text-2xs text-fg-subtle">
          <Icon as={CameraIcon} size={11} />
          {photos.length}
        </span>
      )}
    </span>
  );
}

function RowButton({
  label,
  tone,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: "ok" | "danger" | "plain";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const color =
    tone === "ok" ? CHIP_STYLES.green : tone === "danger" ? CHIP_STYLES.red : "text-fg-muted hover:bg-surface-active hover:text-fg";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md transition-opacity hover:opacity-80 disabled:opacity-40 ${color}`}
    >
      {children}
    </button>
  );
}
