import { useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, PartyPopperIcon, PlusIcon } from "lucide-react";
import { todayInput } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useSchedule, useScheduleDirectory } from "../api/schedule";
import { byEmployeeDate, spanOf, toClock, toMinutes, type Shift } from "../model/schedule";
import { datesOf, isWeekend, rangeOf, stepAnchor } from "../model/timesheet";
import { NavButton, useDayHead, usePeriodLabel } from "./attendance-parts";
import { Segments, useDuration, useKinds, useShiftTime, type KindLook, type OpenShift } from "./schedule-parts";
import { ShiftDialog } from "./ShiftDialog";

type Scale = "week" | "month";

/** Неделя — сетка по часам 07–22, как `schWeek` прототипа; час — 44px. */
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const HOUR_PX = 44;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

/**
 * Вкладка «График работы» страницы сотрудника — `schTab` прототипа
 * (employee.html): его смены неделей по часам или месяцем клетками,
 * «N смен · X ч» за период. Щелчок по часу недели — новая смена с этого
 * часа, по дню месяца — на этот день, по смене — её правка; окно то же,
 * что у календаря графика (ShiftDialog).
 */
export function EmployeeSchedule({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation();
  const today = todayInput();
  const [scale, setScale] = useState<Scale>("week");
  const [anchor, setAnchor] = useState(today);
  const [editing, setEditing] = useState<OpenShift | null>(null);

  const range = useMemo(() => rangeOf(scale, anchor), [scale, anchor]);
  // Месяц — целыми неделями, с понедельника до воскресенья.
  const grid = useMemo(
    () => (scale === "week" ? range : { from: rangeOf("week", range.from).from, to: rangeOf("week", range.to).to }),
    [scale, range],
  );
  const dates = useMemo(() => datesOf(grid), [grid]);
  const data = useSchedule({ ...grid, employeeId });
  const { locations } = useScheduleDirectory();
  const head = useDayHead();
  const duration = useDuration();
  const shiftTime = useShiftTime();
  const label = usePeriodLabel({ scale, anchor, range });

  const shiftsOn = useMemo(() => {
    const of = byEmployeeDate(data.shifts);
    return (date: string) => of(employeeId, date).sort((a, b) => a.start.localeCompare(b.start));
  }, [data.shifts, employeeId]);
  const locationName = useMemo(() => new Map(locations.map((item) => [item.id, item.name])), [locations]);
  const kinds = useKinds();
  const place = (shift: Shift) => {
    const kind = kinds.of(shift.kind);
    // Удалённо — вид вместо филиала; филиала нет — тоже вид: под временем не должно быть пусто.
    return kind.remote ? kind.name : locationName.get(shift.locationId) || (kind.id ? kind.name : "");
  };

  const inRange = data.shifts.filter((shift) => shift.employeeId === employeeId && shift.date >= range.from && shift.date <= range.to);
  const minutes = inRange.reduce((sum, shift) => sum + shift.plannedMinutes, 0);

  const openShift = (shift: Shift) => (event: MouseEvent) => {
    event.stopPropagation();
    setEditing({ shift, date: shift.date });
  };

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      {/* `.sc2-top`. */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5 text-sm">
        <span className="flex items-center gap-1">
          <NavButton label={t("timesheet.back")} onClick={() => setAnchor(stepAnchor(scale, anchor, -1))}>
            <Icon as={ChevronLeftIcon} size={16} />
          </NavButton>
          <NavButton label={t("timesheet.forward")} onClick={() => setAnchor(stepAnchor(scale, anchor, 1))}>
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
        </span>
        <span className="text-xs text-fg-subtle">{t("employeeSchedule.total", { count: inRange.length, hours: duration(minutes) })}</span>
        <span className="ml-auto flex items-center gap-2">
          <Segments
            value={scale}
            items={[
              { value: "week", label: t("timesheet.scale.week") },
              { value: "month", label: t("timesheet.scale.month") },
            ]}
            onChange={setScale}
          />
          <Button variant="primary" onClick={() => setEditing({ employeeId, date: today })}>
            <Icon as={PlusIcon} size={15} />
            {t("shift.new")}
          </Button>
        </span>
      </div>

      {data.loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
      ) : scale === "week" ? (
        /* `.sw` — неделя по часам. */
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-border">
              <div />
              {dates.map((date) => (
                <div key={date} className="flex min-w-0 flex-col gap-0.5 border-l border-border px-2 pt-2 pb-1.5">
                  <small className={`text-[11.5px] ${isWeekend(date) ? "text-danger/75" : "text-fg-subtle"}`}>{head.weekday(date)}</small>
                  <b
                    className={`text-lg leading-tight font-semibold ${
                      date === today ? "grid size-7 place-items-center rounded-full bg-accent-solid text-sm text-accent-fg" : ""
                    }`}
                  >
                    {head.day(date)}
                  </b>
                  {data.holidays.get(date) && <HolidayTag name={data.holidays.get(date)!} />}
                </div>
              ))}
            </div>
            <div className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height: HOURS.length * HOUR_PX }}>
              <div className="relative">
                {HOURS.map((hour, i) => (
                  <span
                    key={hour}
                    className={`absolute right-2 text-[11px] text-fg-subtle ${i ? "-translate-y-1.5" : ""}`}
                    style={{ top: i ? i * HOUR_PX : 2 }}
                  >
                    {toClock(hour * 60)}
                  </span>
                ))}
              </div>
              {dates.map((date) => (
                <div
                  key={date}
                  onClick={(event) => {
                    const top = event.currentTarget.getBoundingClientRect().top;
                    const hour = Math.min(LAST_HOUR - 1, FIRST_HOUR + Math.floor((event.clientY - top) / HOUR_PX));
                    setEditing({ employeeId, date, start: toClock(hour * 60) });
                  }}
                  className={`relative cursor-copy border-l border-border ${
                    date === today ? "bg-accent-subtle/30" : data.holidays.has(date) ? "bg-chip-pink-bg/40" : ""
                  }`}
                >
                  {HOURS.map((hour, i) => (
                    <i key={hour} className="absolute inset-x-0 h-px bg-border/70" style={{ top: i * HOUR_PX }} />
                  ))}
                  {shiftsOn(date).map((shift) => (
                    <WeekShift key={shift.id} shift={shift} kind={kinds.of(shift.kind)} place={place(shift)} onOpen={openShift(shift)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* `.at-cal` — месяц клетками. */
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-surface-soft text-xs text-fg-muted">
            {dates.slice(0, 7).map((date) => (
              <div key={date} className={`px-2 py-1.5 ${isWeekend(date) ? "text-danger" : ""}`}>
                {head.weekday(date)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((date) => {
              const shifts = shiftsOn(date);
              const outside = date < range.from || date > range.to;
              return (
                <div
                  key={date}
                  onClick={() => setEditing({ employeeId, date })}
                  className={`group flex min-h-28 cursor-copy flex-col gap-1 border-r border-b border-border p-1.5 text-xs transition-colors hover:bg-surface-hover [&:nth-child(7n)]:border-r-0 ${
                    outside ? "opacity-40" : ""
                  } ${date === today ? "bg-accent-subtle/30" : !shifts.length ? "bg-surface-soft" : ""}`}
                >
                  <span className="flex items-center justify-between px-0.5">
                    <span className={`font-semibold ${date === today ? "text-accent-text" : "text-fg"}`}>{head.day(date)}</span>
                    <Icon as={PlusIcon} size={13} className="text-fg-subtle opacity-0 group-hover:opacity-100" />
                  </span>
                  {data.holidays.get(date) && <HolidayTag name={data.holidays.get(date)!} />}
                  {shifts.map((shift) => (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={openShift(shift)}
                      title={`${shiftTime(shift)}${place(shift) ? ` · ${place(shift)}` : ""}`}
                      className={`relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[5px] py-0.5 pr-1.5 pl-2 text-left text-[11.5px] hover:brightness-95 ${kinds.of(shift.kind).chip}`}
                    >
                      <i className={`absolute inset-y-0 left-0 w-[3px] ${kinds.of(shift.kind).stripe}`} />
                      <b className="font-semibold whitespace-nowrap tabular-nums">{shiftTime(shift)}</b>
                      <span className="min-w-0 flex-1 truncate opacity-80">{place(shift)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && <ShiftDialog open={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function HolidayTag({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 self-start truncate rounded-md bg-chip-pink-bg px-1.5 py-0.5 text-2xs font-medium text-chip-pink-fg">
      <Icon as={PartyPopperIcon} size={11} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Смена в колонке дня — `.sw-sh`; что вне 07–22 (ночная), обрезается краем сетки. */
function WeekShift({ shift, kind, place, onOpen }: { shift: Shift; kind: KindLook; place: string; onOpen: (event: MouseEvent) => void }) {
  const time = useShiftTime()(shift);
  const start = toMinutes(shift.start);
  // ponytail: у гибкой смены нет часов — плашка в час сверху колонки; своя полоса «весь день», если начнёт мешать.
  const top = shift.start ? Math.max(0, (start / 60 - FIRST_HOUR) * HOUR_PX) : 0;
  const bottom = shift.start ? Math.min(HOURS.length * HOUR_PX, ((start + spanOf(shift.start, shift.end)) / 60 - FIRST_HOUR) * HOUR_PX) : HOUR_PX;
  if (bottom <= top) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ top, height: bottom - top - 2 }}
      className={`absolute inset-x-1 z-[1] flex flex-col gap-px overflow-hidden rounded-md py-1 pr-1.5 pl-2.5 text-left text-xs hover:shadow-md ${kind.chip}`}
    >
      <i className={`absolute inset-y-0 left-0 w-[3px] ${kind.stripe}`} />
      <b className="text-[12.5px] font-semibold tabular-nums">{time}</b>
      {place && <span className="truncate opacity-80">{place}</span>}
    </button>
  );
}
