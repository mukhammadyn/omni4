import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  ChevronRightIcon,
  CoffeeIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  MousePointerClickIcon,
  PartyPopperIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { todayInput } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast";
import { Anchored } from "@/shared/ui/anchored";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { calendarKey, useHolidayCalendars, type DayMark, type HolidayCalendar } from "../api/holiday";
import { daysInMonth, dayKind, DAY_HOURS, iso, isWorking, weekday, yearStats, type DayKind, type Mark } from "../model/holiday";

const LOOK: Record<Mark, { color: ChipColor; icon: LucideIcon }> = {
  holiday: { color: "red", icon: PartyPopperIcon },
  working_weekend: { color: "blue", icon: BriefcaseIcon },
  extra_day_off: { color: "purple", icon: CoffeeIcon },
};
const CELL: Record<DayKind, string> = {
  workday: "text-fg",
  weekend: "bg-surface-hover text-fg-subtle",
  holiday: `${CHIP_DOT.red} font-semibold text-white`,
  working_weekend: `${CHIP_DOT.blue} font-semibold text-white`,
  extra_day_off: `${CHIP_DOT.purple} font-semibold text-white`,
};

type Open = { year: number; locationId: string };
const EMPTY = new Map<string, DayMark>();

/** «Праздничные дни» — `hcRoot` прототипа: производственные календари по годам. */
export function HolidayCalendars() {
  const data = useHolidayCalendars();
  const [open, setOpen] = useState<Open | null>(null);
  const [creating, setCreating] = useState(false);

  const { t } = useTranslation();
  const name: NameOf = (year, locationId) =>
    locationId ? t("holiday.calendarNameAt", { year, scope: data.locations.get(locationId) || "—" }) : t("holiday.calendarName", { year });

  if (open) {
    const cal = data.calendars.get(calendarKey(open.year, open.locationId)) ?? { key: "", ...open, marks: EMPTY };
    return (
      <YearView
        cal={cal}
        name={name}
        data={data}
        onBack={() => setOpen(null)}
        onOpen={setOpen}
      />
    );
  }
  return (
    <>
      <CalendarList data={data} name={name} onOpen={setOpen} onCreate={() => setCreating(true)} />
      {creating && (
        <NewCalendar
          data={data}
          name={name}
          onClose={() => setCreating(false)}
          onCreated={(o) => (setCreating(false), setOpen(o))}
        />
      )}
    </>
  );
}

type Data = ReturnType<typeof useHolidayCalendars>;
type NameOf = (year: number, locationId: string) => string;

/** Своего статуса у календаря нет — его даёт год. */
function status(year: number): { key: "past" | "current" | "future"; color: ChipColor } {
  const now = Number(todayInput().slice(0, 4));
  return year < now ? { key: "past", color: "gray" } : year === now ? { key: "current", color: "green" } : { key: "future", color: "blue" };
}

function StatusChip({ year }: { year: number }) {
  const { t } = useTranslation();
  const s = status(year);
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs ${CHIP_STYLES[s.color]}`}>{t(`holiday.status.${s.key}`)}</span>;
}

function CalendarList({ data, name, onOpen, onCreate }: { data: Data; name: NameOf; onOpen: (o: Open) => void; onCreate: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const rows = [...data.calendars.values()]
    .map((cal) => ({ cal, title: name(cal.year, cal.locationId), stats: yearStats(cal.year, cal.marks) }))
    .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.cal.year - a.cal.year || a.cal.locationId.localeCompare(b.cal.locationId));
  const th = "px-2.5 py-2 text-left text-xs font-medium whitespace-nowrap text-fg-subtle";
  const count = (n: number, color: ChipColor) => (
    <span className={`inline-grid h-5 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold ${CHIP_STYLES[color]}`}>{n}</span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon as={SearchIcon} size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("holiday.search")} className="pl-8" />
        </div>
        <Button onClick={onCreate}>
          <Icon as={PlusIcon} size={14} />
          {t("holiday.new")}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>{t("holiday.calendar")}</th>
              <th className={th}>{t("holiday.year")}</th>
              <th className={th}>{t("holiday.scope")}</th>
              <th className={`${th} text-right`}>{t("holiday.holidays")}</th>
              <th className={`${th} text-right`}>{t("holiday.transfers")}</th>
              <th className={`${th} text-right`}>{t("holiday.workDays")}</th>
              <th className={th}>{t("holiday.statusLabel")}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cal, title, stats }) => (
              <tr
                key={cal.key}
                onClick={() => onOpen({ year: cal.year, locationId: cal.locationId })}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
              >
                <td className="px-2.5 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Icon as={FolderIcon} size={16} className="text-chip-yellow-fg" />
                    {title}
                  </span>
                </td>
                <td className="px-2.5 py-2">{cal.year}</td>
                <td className="px-2.5 py-2 text-fg-muted">{cal.locationId ? data.locations.get(cal.locationId) || "—" : t("holiday.wholeCompany")}</td>
                <td className="px-2.5 py-2 text-right">{count(stats.holidays, "red")}</td>
                <td className="px-2.5 py-2 text-right">{count(stats.transfers, "blue")}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {stats.work} <span className="text-fg-subtle">· {t("holiday.hours", { n: stats.hours })}</span>
                </td>
                <td className="px-2.5 py-2">
                  <StatusChip year={cal.year} />
                </td>
                <td className="px-2.5 py-2 text-fg-subtle">
                  <Icon as={ChevronRightIcon} size={15} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-fg-subtle">
                  {data.loading ? t("common.loading") : t("holiday.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Icon as={InfoIcon} size={13} />
        {t("holiday.scopeHint")}
      </p>
    </div>
  );
}

function YearView({ cal, name, data, onBack, onOpen }: { cal: HolidayCalendar; name: NameOf; data: Data; onBack: () => void; onOpen: (o: Open) => void }) {
  const { t, i18n } = useTranslation();
  const [pop, setPop] = useState<{ date: string; anchor: DOMRect } | null>(null);
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  const stats = yearStats(cal.year, cal.marks);
  const today = todayInput();
  const months = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { month: "long", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2026, m, 1))));
  }, [i18n.language]);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, d) => f.format(new Date(Date.UTC(2026, 0, 5 + d))));
  }, [i18n.language]);
  const marks = [...cal.marks.values()].sort((a, b) => a.date.localeCompare(b.date));

  const copy = async () => {
    const year = cal.year + 1;
    if (data.calendars.has(calendarKey(year, cal.locationId))) return toast.error(t("holiday.exists", { year }));
    setBusy(true);
    try {
      await data.fill(year, cal.locationId, "uz");
      toast.success(t("holiday.copied", { year }));
      onOpen({ year, locationId: cal.locationId });
    } catch {
      // Ошибку показал хук записи; недописанные дни видны в календаре.
    } finally {
      setBusy(false);
    }
  };
  const show = (date: string) => {
    document.querySelector(`[data-day="${date}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(date);
    setTimeout(() => setFlash(""), 1200);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <Icon as={ArrowLeftIcon} size={14} />
          {t("holiday.all")}
        </Button>
        <span className="inline-flex items-center gap-2 text-base font-semibold">
          <Icon as={FolderOpenIcon} size={19} className="text-chip-yellow-fg" />
          {name(cal.year, cal.locationId)}
        </span>
        <StatusChip year={cal.year} />
        <span className="flex-1" />
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void copy()}>
          <Icon as={CopyIcon} size={14} />
          {t("holiday.copyTo", { year: cal.year + 1 })}
        </Button>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-border sm:grid-cols-5">
        {(
          [
            ["sumWork", stats.work],
            ["sumHours", stats.hours],
            ["sumOff", stats.off],
            ["holidays", stats.holidays],
            ["transfersShort", stats.transfers],
          ] as const
        ).map(([key, value], i) => (
          <div key={key} className={`px-3.5 py-2.5 ${i ? "sm:border-l sm:border-border" : ""}`}>
            <small className="block text-xs text-fg-subtle">{t(`holiday.${key}`)}</small>
            <b className="text-xl font-bold tabular-nums">{value}</b>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3.5 text-xs text-fg-muted">
        {(["workday", "weekend", "holiday", "working_weekend", "extra_day_off"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className={`size-3.5 rounded ${k === "workday" ? "border border-border-strong" : CELL[k]}`} />
            {t(`holiday.kind.${k}`)}
          </span>
        ))}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-fg-subtle">
          <Icon as={MousePointerClickIcon} size={13} />
          {t("holiday.clickHint")}
        </span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 ${data.busy ? "cursor-progress" : ""}`}>
          {months.map((month, m) => {
            const n = daysInMonth(cal.year, m);
            const dates = Array.from({ length: n }, (_, d) => iso(cal.year, m, d + 1));
            const work = dates.filter((d) => isWorking(dayKind(d, cal.marks))).length;
            return (
              <div key={m} className="rounded-xl border border-border p-2.5">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <b className="text-[13.5px] font-semibold capitalize">{month}</b>
                  <span className="text-[11px] text-fg-subtle">{t("holiday.monthWork", { n: work, h: work * DAY_HOURS })}</span>
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {weekdays.map((w, i) => (
                    <span key={w} className={`pb-0.5 text-center text-[10.5px] ${i > 4 ? "text-danger/70" : "text-fg-subtle"}`}>
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: weekday(dates[0]!) }, (_, i) => (
                    <i key={`e${i}`} />
                  ))}
                  {dates.map((date, d) => {
                    const kind = dayKind(date, cal.marks);
                    return (
                      <button
                        key={date}
                        type="button"
                        data-day={date}
                        disabled={data.busy}
                        title={cal.marks.get(date)?.name}
                        onClick={(e) => {
                          // Anchored кладёт слой на левый верх якоря; якорь — под днём, чтобы его не закрыть.
                          const r = e.currentTarget.getBoundingClientRect();
                          setPop({ date, anchor: new DOMRect(r.left, r.bottom + 4, r.width, 0) });
                        }}
                        className={`grid aspect-square place-items-center rounded-[5px] text-xs tabular-nums transition-transform hover:ring-[1.5px] hover:ring-accent hover:ring-inset ${CELL[kind]} ${
                          date === today ? "ring-[1.5px] ring-fg ring-inset" : ""
                        } ${flash === date ? "scale-125 ring-2 ring-accent" : ""}`}
                      >
                        {d + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="overflow-auto rounded-xl border border-border lg:sticky lg:top-0 lg:max-h-[calc(100vh-220px)]">
          <div className="border-b border-border px-3 py-2.5 text-[13.5px] font-semibold">{t("holiday.changes", { n: marks.length })}</div>
          {marks.map((mk) => {
            const look = LOOK[mk.type];
            return (
              <div
                key={mk.id}
                onClick={() => show(mk.date)}
                className="group flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 last:border-0 hover:bg-surface-hover"
              >
                <span className={`flex size-9.5 shrink-0 flex-col items-center justify-center rounded-lg leading-tight text-white ${CHIP_DOT[look.color]}`}>
                  <b className="text-sm font-bold">{Number(mk.date.slice(8))}</b>
                  <small className="text-[10px]">{months[Number(mk.date.slice(5, 7)) - 1]!.slice(0, 3)}</small>
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-medium">{mk.name}</b>
                  <small className={`mt-0.5 inline-flex h-4.5 items-center rounded px-1.5 text-[11px] ${CHIP_STYLES[look.color]}`}>
                    {t(`holiday.kind.${mk.type}`)}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={t("holiday.reset")}
                  disabled={data.busy}
                  onClick={(e) => (e.stopPropagation(), data.clear([mk.id]).then(() => toast.success(t("holiday.resetDone")), () => {}))}
                  className="grid size-6 place-items-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-danger"
                >
                  <Icon as={XIcon} size={13} />
                </button>
              </div>
            );
          })}
          {!marks.length && <div className="p-3 text-sm text-fg-subtle">{t("holiday.noChanges")}</div>}
        </aside>
      </div>

      {pop && <DayPop key={pop.date} cal={cal} date={pop.date} anchor={pop.anchor} data={data} onClose={() => setPop(null)} />}
    </div>
  );
}

function DayPop({ cal, date, anchor, data, onClose }: { cal: HolidayCalendar; date: string; anchor: DOMRect; data: Data; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const mark = cal.marks.get(date);
  const kind = dayKind(date, cal.marks);
  const [name, setName] = useState(mark?.name ?? "");
  const title = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
  // Ошибку показывает хук записи; здесь только успех.
  const run = (p: Promise<unknown>, done: TranslationKey) => {
    onClose();
    p.then(() => toast.success(t(done)), () => {});
  };
  const set =(type: Mark, done: TranslationKey = `holiday.done.${type}`) =>
    run(data.mark(cal, date, type, name.trim() || t(`holiday.default.${type}`)), done);
  const rename = () => mark && set(mark.type, "holiday.saved");
  /** Enter в поле — первое действие меню. */
  const primary = () => (mark ? rename() : set(kind === "weekend" ? "working_weekend" : "holiday"));
  const item = (icon: LucideIcon, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover ${danger ? "text-danger" : ""}`}
    >
      <Icon as={icon} size={14} />
      {label}
    </button>
  );

  return (
    <Anchored anchor={anchor} onClose={onClose}>
      <div className="w-68 rounded-lg border border-border bg-surface p-1 shadow-popover">
        <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-subtle first-letter:uppercase">{title}</div>
        <div className="px-1.5 pt-0.5 pb-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && primary()}
            placeholder={t(kind === "weekend" ? "holiday.reasonPh" : "holiday.namePh")}
            className="h-7.5 text-[13px]"
          />
        </div>
        {kind === "weekend" && (
          <>
            {item(BriefcaseIcon, t("holiday.makeWork"), () => set("working_weekend"))}
            {item(PartyPopperIcon, t("holiday.makeHoliday"), () => set("holiday"))}
          </>
        )}
        {kind === "workday" && (
          <>
            {item(PartyPopperIcon, t("holiday.makeHoliday"), () => set("holiday"))}
            {item(CoffeeIcon, t("holiday.makeOff"), () => set("extra_day_off"))}
          </>
        )}
        {mark && (
          <>
            {item(LOOK[mark.type].icon, t("holiday.rename"), rename)}
            {item(RotateCcwIcon, t("holiday.reset"), () => run(data.clear([mark.id]), "holiday.resetDone"), true)}
          </>
        )}
      </div>
    </Anchored>
  );
}

function NewCalendar({ data, name, onClose, onCreated }: { data: Data; name: NameOf; onClose: () => void; onCreated: (o: Open) => void }) {
  const { t } = useTranslation();
  const [year, setYear] = useState(String(Number(todayInput().slice(0, 4)) + 1));
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("uz");
  const [busy, setBusy] = useState(false);
  const label = "mb-1 block text-xs font-medium text-fg-muted";
  const y = Number(year);
  const exists = data.calendars.has(calendarKey(y, locationId));

  const submit = async () => {
    setBusy(true);
    try {
      const source = from === "uz" ? "uz" : data.calendars.get(from);
      if (source) await data.fill(y, locationId, source);
      toast.success(t("holiday.created"));
      onCreated({ year: y, locationId });
    } catch {
      // Ошибку показал хук записи.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t("holiday.new")}</h2>
        <div className="grid grid-cols-2 gap-3 px-4 py-3">
          <label>
            <span className={label}>{t("holiday.year")}</span>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </label>
          <div>
            <span className={label}>{t("holiday.scope")}</span>
            <Dropdown
              value={locationId}
              onChange={setLocationId}
              items={[{ value: "", label: t("holiday.wholeCompany") }, ...[...data.locations].map(([value, label]) => ({ value, label }))]}
            />
          </div>
          <div className="col-span-2">
            <span className={label}>{t("holiday.fill")}</span>
            <Dropdown
              value={from}
              onChange={setFrom}
              items={[
                { value: "uz", label: t("holiday.fillUz") },
                ...[...data.calendars.values()].map((c) => ({ value: c.key, label: t("holiday.fillCopy", { name: name(c.year, c.locationId) }) })),
              ]}
            />
          </div>
          {exists && <p className="col-span-2 text-xs text-danger">{t("holiday.exists", { year: y })}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={busy || exists || !(y >= 2000 && y <= 2100)} onClick={() => void submit()}>
            {t("action.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
