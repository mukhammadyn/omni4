import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronLeftIcon, ChevronRightIcon, HourglassIcon, LogInIcon, LogOutIcon, UserXIcon, XIcon } from "lucide-react";
import { Avatar, fileUrl, useUpdateItem, type Item } from "@/features/item";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { openPreview } from "@/shared/ui/file-preview";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { ATTENDANCE_DAYS, markClock as clock, markMinutes as minutesOf, useDayEvents, type SheetEmployee } from "../api/timesheet";
import { text } from "../api/org";
import type { SheetCell } from "../model/timesheet";

/**
 * День сотрудника из табеля — DayModal табеля HRMS: что было за день
 * и решение по отметке, которая ждёт согласования (`review`). Сверху —
 * стрелки по дням периода, как там же.
 *
 * Отметки — строки `hr_attendance_events` за день: таймлайн входов
 * и выходов и фотоотчёт (фото есть у отметок из Mini App).
 */
export function TimesheetDay({
  employee,
  cell,
  canPrev,
  canNext,
  onNavigate,
  onClose,
}: {
  employee: SheetEmployee;
  cell: SheetCell;
  canPrev: boolean;
  canNext: boolean;
  onNavigate: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const events = useDayEvents(employee.id, cell.date);
  const update = useUpdateItem(ATTENDANCE_DAYS);
  const day = cell.day;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && canPrev) onNavigate(-1);
      if (event.key === "ArrowRight" && canNext) onNavigate(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canPrev, canNext, onNavigate, onClose]);

  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${cell.date}T00:00:00Z`));

  const decide = (review: "approved" | "rejected") => day && update.mutate({ guid: day.id, values: { review } });

  const status = statusChip(cell, t);

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="flex gap-1">
            <DayNav disabled={!canPrev} label={t("timesheet.day.prev")} onClick={() => onNavigate(-1)}>
              <Icon as={ChevronLeftIcon} size={16} />
            </DayNav>
            <DayNav disabled={!canNext} label={t("timesheet.day.next")} onClick={() => onNavigate(1)}>
              <Icon as={ChevronRightIcon} size={16} />
            </DayNav>
          </div>
          <Avatar name={employee.name} photo={employee.photo || undefined} size="lg" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-fg">{employee.name}</div>
            <div className="text-xs text-fg-muted">
              {dateLabel} ·{" "}
              {cell.planMinutes
                ? t("timesheet.day.shift", { hours: (cell.planMinutes / 60).toLocaleString(i18n.language) })
                : t("timesheet.day.noShift")}
            </div>
          </div>
          {status && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP_STYLES[status.color]}`}>{status.label}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className="ml-auto grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <Icon as={XIcon} size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-soft px-5 py-4">
          {cell.pendingLeave && (
            <Banner>
              <b>{t("timesheet.pending.leave", { title: cell.pendingLeave.title })}</b>{" "}
              <span className="text-fg-muted">{period(cell.pendingLeave.from, cell.pendingLeave.to)}</span>
            </Banner>
          )}
          {day && cell.pending.includes("mark") && (
            <Banner>
              <b className="flex-1">{t("timesheet.pending.mark")}</b>
              <Button size="sm" variant="danger" disabled={update.isPending} onClick={() => decide("rejected")}>
                {t("timesheet.day.reject")}
              </Button>
              <Button size="sm" disabled={update.isPending} onClick={() => decide("approved")}>
                {t("timesheet.day.approve")}
              </Button>
            </Banner>
          )}
          {day?.comment && <p className="text-sm text-fg-muted">«{day.comment}»</p>}

          {cell.kind === "leave" ? (
            <Reason
              icon={<DynamicIcon name={cell.leave?.icon ?? ""} size={22} fallback={<Icon as={HourglassIcon} size={20} />} />}
              color={hexToChipColor(cell.leave?.color ?? "")}
              title={cell.leave?.title || t("timesheet.legend.leave")}
              hint={cell.leave ? period(cell.leave.from, cell.leave.to) : ""}
            />
          ) : cell.kind === "absent" ? (
            <Reason
              icon={<Icon as={UserXIcon} size={20} />}
              color="red"
              title={t("timesheet.day.absentTitle")}
              hint={t("timesheet.day.absentHint")}
            />
          ) : events.rows.length ? (
            <Marks rows={events.rows} cell={cell} />
          ) : events.loading ? (
            <p className="py-6 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
          ) : (
            <Reason
              icon={<Icon as={HourglassIcon} size={20} />}
              color="gray"
              title={
                cell.kind === "holiday"
                  ? cell.holiday || t("timesheet.legend.holiday")
                  : cell.kind === "day_off"
                    ? t("timesheet.legend.dayOff")
                    : cell.kind === "future"
                      ? t("timesheet.day.futureTitle")
                      : t("timesheet.day.emptyTitle")
              }
              hint={cell.kind === "empty" ? t("timesheet.day.emptyHint") : ""}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- отметки ---------- */

/** Варианты `hr_attendance_events.source`. */
const SOURCES = ["hikvision", "mobile", "web", "manual"] as const;

function Marks({ rows, cell }: { rows: Item[]; cell: SheetCell }) {
  const { t } = useTranslation();
  const marks = rows
    .map((row) => ({
      at: text(row.occurred_at),
      minute: minutesOf(text(row.occurred_at)),
      in: text(row.direction) === "in",
      photo: text(row.photo),
      source: SOURCES.find((source) => source === text(row.source)) ?? "manual",
    }))
    .filter((mark): mark is typeof mark & { minute: number } => mark.minute != null);

  const first = marks[0]?.minute ?? 9 * 60;
  const last = marks.at(-1)?.minute ?? 18 * 60;
  // Ось — целыми часами, не уже 08:00–20:00.
  const from = Math.min(8 * 60, Math.floor(first / 60) * 60);
  const to = Math.max(20 * 60, Math.ceil((last + 30) / 60) * 60);
  const pos = (minute: number) => `${(((minute - from) / (to - from)) * 100).toFixed(2)}%`;
  const ticks: number[] = [];
  for (let hour = from; hour <= to; hour += 120) ticks.push(hour);

  // Отрезки «на месте»: от входа до следующего выхода.
  const segments: [number, number][] = [];
  let start: number | null = null;
  for (const mark of marks) {
    if (mark.in && start == null) start = mark.minute;
    if (!mark.in && start != null) {
      segments.push([start, mark.minute]);
      start = null;
    }
  }

  const photos = marks.filter((mark) => mark.photo);
  const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const worked = cell.workedMinutes;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("timesheet.day.firstIn"), cell.day?.firstIn ? clock(cell.day.firstIn) : "—"],
          [t("timesheet.day.lastOut"), cell.day?.lastOut ? clock(cell.day.lastOut) : "—"],
          [t("timesheet.day.worked"), worked != null ? hhmm(worked) : "—"],
          [t("timesheet.day.late"), cell.lateMinutes ? hhmm(cell.lateMinutes) : "—"],
        ].map(([label, value], i) => (
          <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2">
            <small className="block text-xs text-fg-muted">{label}</small>
            <b className={`text-base font-semibold tabular-nums ${i === 3 && cell.lateMinutes ? "text-danger" : "text-fg"}`}>{value}</b>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-3 text-sm">
          <b className="font-semibold">{t("timesheet.day.timeline")}</b>
          <span className="ml-auto inline-flex items-center gap-3 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-success" />{t("timesheet.day.in")}</span>
            <span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-accent" />{t("timesheet.day.out")}</span>
          </span>
        </div>
        <div className="relative mb-1 h-4 text-2xs text-fg-subtle">
          {ticks.map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2" style={{ left: pos(tick) }}>
              {hhmm(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-6 rounded-md bg-surface-soft">
          {segments.map(([a, b]) => (
            <div key={a} className="absolute inset-y-1 rounded bg-success/30" style={{ left: pos(a), width: `${(((b - a) / (to - from)) * 100).toFixed(2)}%` }} />
          ))}
          {marks.map((mark) => (
            <i
              key={mark.at}
              title={`${mark.in ? t("timesheet.day.in") : t("timesheet.day.out")} · ${hhmm(mark.minute)}`}
              className={`absolute inset-y-0 w-0.5 ${mark.in ? "bg-success" : "bg-accent"}`}
              style={{ left: pos(mark.minute) }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {marks.map((mark) => (
            <li key={mark.at} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${mark.in ? CHIP_STYLES.green : CHIP_STYLES.blue}`}>
              <Icon as={mark.in ? LogInIcon : LogOutIcon} size={12} />
              {hhmm(mark.minute)}
              <span className="opacity-70">· {t(`timesheet.source.${mark.source}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 text-sm">
          <b className="font-semibold">{t("timesheet.day.photos")}</b>{" "}
          <span className="text-fg-subtle">{photos.length}</span>
        </div>
        {photos.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((mark, i) => (
              <button
                key={mark.at}
                type="button"
                onClick={() => openPreview(photos.map((p) => fileUrl(p.photo)), i, "image")}
                className="overflow-hidden rounded-lg border border-border text-left"
              >
                <img src={fileUrl(mark.photo)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <span className="flex items-center gap-1 px-2 py-1 text-xs">
                  <Icon as={mark.in ? LogInIcon : LogOutIcon} size={12} className={mark.in ? "text-success" : "text-accent"} />
                  {mark.in ? t("timesheet.day.in") : t("timesheet.day.out")} · {hhmm(mark.minute)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-fg-subtle">{t("timesheet.day.noPhotos")}</p>
        )}
      </section>
    </>
  );
}

/* ---------- части ---------- */

const period = (from: string, to: string) => {
  const ru = (key: string) => key.split("-").reverse().join(".");
  return from === to ? ru(from) : `${ru(from)} — ${ru(to)}`;
};

function statusChip(cell: SheetCell, t: TFunction): { label: string; color: ChipColor } | null {
  switch (cell.kind) {
    case "worked":
      return { label: t("timesheet.status.onTime"), color: "green" };
    case "late":
      return { label: t("timesheet.status.late", { minutes: cell.lateMinutes }), color: "orange" };
    case "at_work":
      return { label: t("timesheet.legend.atWork"), color: "green" };
    case "missing_mark":
      return { label: t("timesheet.legend.missing"), color: "yellow" };
    case "absent":
      return { label: t("timesheet.legend.absent"), color: "red" };
    case "leave":
      return { label: cell.leave?.title || t("timesheet.legend.leave"), color: hexToChipColor(cell.leave?.color ?? "") };
    case "holiday":
      return { label: t("timesheet.legend.holiday"), color: "pink" };
    case "day_off":
      return { label: t("timesheet.legend.dayOff"), color: "gray" };
    default:
      return null;
  }
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-2.5 text-sm text-fg">
      {children}
    </div>
  );
}

function Reason({ icon, color, title, hint }: { icon: ReactNode; color: ChipColor; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${CHIP_STYLES[color]}`}>{icon}</span>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      </div>
    </div>
  );
}

function DayNav({ disabled, label, onClick, children }: { disabled: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md border border-border text-fg-muted hover:bg-surface-hover disabled:opacity-40"
    >
      {children}
    </button>
  );
}
