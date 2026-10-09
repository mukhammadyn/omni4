import { useDeferredValue, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import { GAP, pageItems } from "@/shared/ui/pagination";
import { useUi } from "@/shared/lib/ui-store";
import { todayInput } from "@/shared/lib/date-value";
import { Icon } from "@/shared/ui/icon";
import { useTimesheet, type SheetEmployee } from "../api/timesheet";
import type { EmployeeTab } from "./employee-tabs";
import { buildRow, datesOf, rangeOf, statusOf, stepAnchor, type DayStatus, type Scale, type SheetCell } from "../model/timesheet";

/*
 * Общее у экранов посещаемости — «Календаря» и «Табеля»: период,
 * поиск, данные за период и строка над сеткой (`.vt-cal` прототипа).
 */

const SCALES: readonly Scale[] = ["month", "week", "day"];

/** Масштаб и опорная дата — у человека по view (ui-store), как период «Планирования». */
function useSettings(viewId: string, scales: readonly Scale[]) {
  const raw = useUi((s) => s.viewState[viewId]);
  const setViewState = useUi((s) => s.setViewState);
  const saved = raw && typeof raw === "object" ? (raw as { scale?: unknown; anchor?: unknown }) : {};
  const scale = scales.find((item) => item === saved.scale) ?? scales[0]!;
  const anchor = typeof saved.anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved.anchor) ? saved.anchor : undefined;
  return {
    scale,
    /** Нет — период едет за сегодняшней датой. */
    anchor,
    setScale: (next: Scale) => setViewState(viewId, { scale: next, anchor }),
    setAnchor: (next: string | undefined) => setViewState(viewId, { scale, anchor: next }),
  };
}

/** Период и поиск — без данных: строке периода больше ничего не нужно. */
export function usePeriod(viewId: string, scales: readonly Scale[] = SCALES) {
  const today = todayInput();
  const settings = useSettings(viewId, scales);
  const anchor = settings.anchor ?? today;
  const range = useMemo(() => rangeOf(settings.scale, anchor), [settings.scale, anchor]);
  const dates = useMemo(() => datesOf(range), [range]);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  return { ...settings, scales, anchor, range, dates, today, search, setSearch, query };
}

export type Period = ReturnType<typeof usePeriod>;

/** Период, поиск, данные и строки сотрудников за период. */
export function useAttendance(viewId: string, scales: readonly Scale[] = SCALES) {
  const period = usePeriod(viewId, scales);
  const { range, dates, today, query } = period;
  const sheet = useTimesheet({ ...range, dates, today, search: query });
  const rows = useMemo(
    () => sheet.employees.map((employee) => ({ employee, ...buildRow(sheet.inputOf(employee)) })),
    [sheet],
  );
  return { ...period, sheet, rows };
}

export type Attendance = ReturnType<typeof useAttendance>;

/** Открытый день: сотрудник и дата — окну дня (TimesheetDay). */
export type OpenDay = { employee: SheetEmployee; date: string };

const utc = (key: string) => new Date(`${key}T00:00:00Z`);

/** Подпись периода: «Сентябрь 2026 г.», «5–11 окт. 2026 г.», «пт, 9 окт. 2026 г.». */
function usePeriodLabel({ scale, anchor, range }: Period) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  if (scale === "month") {
    return capitalize(new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(anchor)));
  }
  const format = new Intl.DateTimeFormat(locale, {
    ...(scale === "day" ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return scale === "day" ? format.format(utc(anchor)) : format.formatRange(utc(range.from), utc(range.to));
}

/**
 * Строка над сеткой — как в HRMS и прототипе: период, «Сегодня»,
 * масштаб, свой блок экрана (обозначения, счётчики), поиск справа.
 */
export function PeriodBar({ view, children }: { view: Period; children?: ReactNode }) {
  const { t } = useTranslation();
  const label = usePeriodLabel(view);
  const { scale, anchor } = view;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 text-sm">
      <NavButton label={t("timesheet.back")} onClick={() => view.setAnchor(stepAnchor(scale, anchor, -1))}>
        <Icon as={ChevronLeftIcon} size={16} />
      </NavButton>
      <b className="min-w-[150px] text-center font-semibold">{label}</b>
      <NavButton label={t("timesheet.forward")} onClick={() => view.setAnchor(stepAnchor(scale, anchor, 1))}>
        <Icon as={ChevronRightIcon} size={16} />
      </NavButton>
      <button
        type="button"
        onClick={() => view.setAnchor(undefined)}
        className="ml-1 h-7 rounded-md border border-border px-2.5 text-[13px] text-fg transition-colors hover:bg-surface-hover"
      >
        {t("timesheet.today")}
      </button>
      <div className="ml-1 flex rounded-md border border-border p-0.5">
        {view.scales.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => view.setScale(item)}
            className={`h-6 rounded-[4px] px-2.5 text-[13px] transition-colors ${
              item === scale ? "bg-surface-active font-medium text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t(`timesheet.scale.${item}`)}
          </button>
        ))}
      </div>
      {children && <span className="mx-2 h-4 w-px bg-border" />}
      {children}

      <label className="ml-auto flex h-7 max-w-52 min-w-28 flex-1 items-center gap-1.5 rounded-md border border-border px-2 text-[13px]">
        <Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" />
        <input
          value={view.search}
          onChange={(event) => view.setSearch(event.target.value)}
          placeholder={t("timesheet.search")}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
        />
        {view.search && (
          <button
            type="button"
            onClick={() => view.setSearch("")}
            aria-label={t("table.clearSearch")}
            className="text-fg-subtle hover:text-fg"
          >
            <Icon as={XIcon} size={14} />
          </button>
        )}
      </label>
    </div>
  );
}

/** Число и день недели в шапке колонки. */
export function useDayHead() {
  const { i18n } = useTranslation();
  const dayNumber = new Intl.DateTimeFormat(i18n.language, { day: "numeric", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
  return { day: (key: string) => dayNumber.format(utc(key)), weekday: (key: string) => weekday.format(utc(key)) };
}

/** Переход на страницу сотрудника на нужной вкладке — `employee.html#att` прототипа. */
export type OpenEmployee = (guid: string, tab: EmployeeTab) => void;

/**
 * Сотрудник в липкой колонке: фото, имя, должность или дата увольнения.
 * С `onOpen` — ссылка на его страницу, как `who()` прототипа.
 */
export function EmployeeName({
  employee,
  until,
  avatar,
  onOpen,
}: {
  employee: SheetEmployee;
  until: string;
  avatar: ReactNode;
  onOpen?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen
        ? {
            type: "button" as const,
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              onOpen();
            },
          }
        : {})}
      className={`flex w-full items-center gap-2 text-left ${onOpen ? "group/name cursor-pointer" : ""}`}
    >
      {avatar}
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-fg group-hover/name:text-accent-text group-hover/name:underline">
          {employee.name}
        </div>
        <div className="truncate text-2xs text-fg-subtle">
          {employee.dismissalDate && employee.dismissalDate <= until
            ? t("timesheet.dismissedOn", { date: employee.dismissalDate.split("-").reverse().join(".") })
            : employee.position}
        </div>
      </div>
    </Tag>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/* ---------- статусы дня ---------- */

export const STATUSES: DayStatus[] = ["ok", "late", "absent", "leave"];

/* Точка и полоса — смысловым цветом: `CHIP_DOT` в тёмной теме белый (как в VacancyPlan). */
export const STATUS_DOT: Record<DayStatus, string> = {
  ok: "bg-success",
  late: "bg-warning",
  absent: "bg-danger",
  leave: "bg-accent",
};

/**
 * Отбор по статусу дня — счётчики над сеткой (`kindStats` прототипа).
 * Отбор не прячет дни, а гасит остальные; список им — прячет.
 */
export function useStatusFilter() {
  const [only, setOnly] = useState<Set<DayStatus>>(() => new Set());
  return {
    only,
    hit: (cell: SheetCell) => only.size === 0 || only.has(statusOf(cell) as DayStatus),
    toggle: (status: DayStatus) =>
      setOnly((prev) => {
        const next = new Set(prev);
        if (!next.delete(status)) next.add(status);
        return next;
      }),
  };
}

export function StatusChips({
  cells,
  filter,
}: {
  cells: SheetCell[];
  filter: ReturnType<typeof useStatusFilter>;
}) {
  const { t } = useTranslation();
  const counts = useMemo(() => {
    const result: Record<DayStatus, number> = { ok: 0, late: 0, absent: 0, leave: 0 };
    for (const cell of cells) {
      const status = statusOf(cell);
      if (status) result[status] += 1;
    }
    return result;
  }, [cells]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => filter.toggle(status)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors ${
            filter.only.has(status)
              ? "bg-surface-active text-fg ring-1 ring-border-strong ring-inset"
              : "text-fg-muted hover:bg-surface-hover"
          }`}
        >
          <i className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
          {t(`attendanceCalendar.status.${status}`)}
          <b className="font-semibold text-fg tabular-nums">{counts[status]}</b>
        </button>
      ))}
    </div>
  );
}

/* ---------- страницы ---------- */

/** Подвал — «Отображение 1 – 20 из N» и номера страниц, как в HRMS. */
export function Pager({
  page,
  pages,
  total,
  size,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-6 flex h-11 shrink-0 items-center gap-1 text-[13px] text-fg-muted">
      <span>
        {t("attendanceList.range", {
          from: total ? (page - 1) * size + 1 : 0,
          to: Math.min(page * size, total),
          total,
        })}
      </span>
      {pages > 1 && (
        <span className="ml-auto flex items-center gap-0.5">
          <PageButton disabled={page === 1} onClick={() => onPage(page - 1)} label={t("attendanceList.prev")}>
            <Icon as={ChevronLeftIcon} size={16} />
          </PageButton>
          {pageItems(page, pages).map((item, i) =>
            item === GAP ? (
              <span key={`gap${i}`} className="px-1 text-fg-subtle">
                …
              </span>
            ) : (
              <PageButton key={item} active={item === page} onClick={() => onPage(item)} label={String(item)}>
                {item}
              </PageButton>
            ),
          )}
          <PageButton disabled={page === pages} onClick={() => onPage(page + 1)} label={t("attendanceList.next")}>
            <Icon as={ChevronRightIcon} size={16} />
          </PageButton>
        </span>
      )}
    </div>
  );
}

function PageButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-7 min-w-7 place-items-center rounded-md px-1.5 tabular-nums transition-colors disabled:opacity-40 ${
        active ? "bg-surface-active font-medium text-fg" : "hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** Страница — своя у каждого отбора: новый отбор начинает с первой. */
export function useScopedPage(scope: string) {
  const [paging, setPaging] = useState({ scope, page: 1 });
  return [paging.scope === scope ? paging.page : 1, (page: number) => setPaging({ scope, page })] as const;
}
