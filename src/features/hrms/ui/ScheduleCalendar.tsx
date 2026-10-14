import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BriefcaseIcon, ChevronDownIcon, HouseIcon, MoonIcon, SparkleIcon, SunIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useSchedule, useScheduleDirectory, type ScheduleEmployee } from "../api/schedule";
import { byEmployeeDate, SHIFT_KINDS, type Shift, type ShiftKind, type Template } from "../model/schedule";
import { isWeekend } from "../model/timesheet";
import { EmployeeName, PeriodBar, useDayHead, usePeriod, type OpenEmployee } from "./attendance-parts";
import { ATTENDANCE_TAB } from "./employee-tabs";
import { useScheduleSettings, type ScheduleGroup } from "./schedule-settings";
import { NO_TEMPLATE } from "./ScheduleTools";

/** Тип смены: подложка, полоса слева и значок — `KIND` прототипа. */
export const KIND_STYLE: Record<ShiftKind, { chip: string; stripe: string; icon: LucideIcon }> = {
  day: { chip: CHIP_STYLES.blue, stripe: "bg-chart-1", icon: SunIcon },
  night: { chip: CHIP_STYLES.purple, stripe: "bg-chart-7", icon: MoonIcon },
  remote: { chip: CHIP_STYLES.green, stripe: "bg-chart-3", icon: HouseIcon },
};

/** «8 ч», «7 ч 30 м». */
export function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h && m ? t("timesheet.hm", { h, m }) : m ? t("timesheet.m", { m }) : t("timesheet.h", { h });
  };
}

/** Новая смена на клетке или правка существующей — окну смены. */
export type OpenShift = { shift?: Shift; employeeId?: string; date: string };

type Row = { id: string; employees: ScheduleEmployee[]; position?: string };

/**
 * «Календарь» графика работы (`schedView` прототипа, schedule.html):
 * сотрудники × дни, смена — плашкой со временем и филиалом, цвет — тип
 * смены, искра — смена не из шаблона. Ось «Должность» (`posView`)
 * склеивает одинаковые смены должности в одну плашку «N из M». Над
 * сеткой — счётчики по типам смен с отбором и часы по графику.
 *
 * Данные грузит сам (api/schedule). Сделан под `hr_shifts` (FIXED_VIEW_TYPES).
 */
export function ScheduleCalendar({
  viewId,
  onOpenEmployee,
  onOpenShift,
}: {
  viewId: string;
  onOpenEmployee: OpenEmployee;
  onOpenShift?: (open: OpenShift) => void;
}) {
  const { t } = useTranslation();
  const period = usePeriod(viewId);
  const { scale, range, dates, today, query } = period;
  const settings = useScheduleSettings(viewId);
  const data = useSchedule(range);
  const { locations } = useScheduleDirectory();
  const head = useDayHead();
  const duration = useDuration();
  const [kinds, setKinds] = useState<Set<ShiftKind>>(() => new Set());
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const month = scale === "month";

  const shiftsOf = useMemo(() => byEmployeeDate(data.shifts), [data.shifts]);
  const templateById = useMemo(() => new Map(data.templates.map((item) => [item.id, item])), [data.templates]);
  const locationName = useMemo(() => new Map(locations.map((item) => [item.id, item.name])), [locations]);

  /** Шаблон сотрудника: по сменам периода, иначе из карточки (`curTpl` прототипа). */
  const templateOf = useMemo(() => {
    const bySchedule = new Map<string, string>();
    for (const shift of data.shifts) if (shift.templateId && !bySchedule.has(shift.employeeId)) bySchedule.set(shift.employeeId, shift.templateId);
    return (employee: ScheduleEmployee): Template | undefined =>
      templateById.get(bySchedule.get(employee.id) ?? employee.templateId);
  }, [data.shifts, templateById]);

  const employees = useMemo(() => {
    const needle = query.toLocaleLowerCase();
    const hit = (values: string[], value: string) => !values.length || values.includes(value);
    return data.employees.filter(
      (employee) =>
        (!needle || employee.name.toLocaleLowerCase().includes(needle)) &&
        hit(settings.values("dept"), employee.departmentId) &&
        hit(settings.values("location"), employee.locationId) &&
        hit(settings.values("template"), templateOf(employee)?.id ?? NO_TEMPLATE),
    );
  }, [data.employees, query, settings, templateOf]);

  const visible = (shift: Shift) => !kinds.size || kinds.has(shift.kind);

  const stats = useMemo(() => {
    const counts: Record<ShiftKind | "off", number> = { day: 0, night: 0, remote: 0, off: 0 };
    let minutes = 0;
    for (const employee of employees)
      for (const date of dates) {
        const list = shiftsOf(employee.id, date);
        if (!list.length) counts.off += 1;
        for (const shift of list) {
          counts[shift.kind] += 1;
          minutes += shift.plannedMinutes;
        }
      }
    return { counts, minutes };
  }, [employees, dates, shiftsOf]);

  /* Строки: сотрудники или должности, по группам. */
  const groups = useMemo(() => {
    const rowsOf = (list: ScheduleEmployee[]): Row[] => {
      if (settings.axis === "employee") return list.map((employee) => ({ id: employee.id, employees: [employee] }));
      const byPosition = new Map<string, ScheduleEmployee[]>();
      for (const employee of list) byPosition.set(employee.position, [...(byPosition.get(employee.position) ?? []), employee]);
      return [...byPosition]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([position, members]) => ({ id: `p:${position}`, employees: members, position }));
    };
    const keyOf: Record<Exclude<ScheduleGroup, "none">, (e: ScheduleEmployee) => [string, string]> = {
      dept: (e) => [e.departmentId, e.department],
      location: (e) => [e.locationId, e.location],
      template: (e) => {
        const template = templateOf(e);
        return [template?.id ?? NO_TEMPLATE, template?.name ?? t("schedule.noTemplate")];
      },
    };
    if (settings.group === "none") return [{ id: "", label: "", rows: rowsOf(employees) }];
    const buckets = new Map<string, { label: string; members: ScheduleEmployee[] }>();
    for (const employee of employees) {
      const [id, label] = keyOf[settings.group](employee);
      const bucket = buckets.get(id) ?? { label: label || "—", members: [] };
      bucket.members.push(employee);
      buckets.set(id, bucket);
    }
    return [...buckets]
      // Крупные группы первыми, «—» (поле не заполнено) — в конце.
      .sort(([idA, a], [idB, b]) => Number(!idA) - Number(!idB) || b.members.length - a.members.length)
      .map(([id, { label, members }]) => ({ id: `${settings.group}:${id}`, label, rows: rowsOf(members) }));
  }, [employees, settings.axis, settings.group, templateOf, t]);

  const toggleGroup = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const width = month ? "min-w-[36px]" : scale === "week" ? "min-w-[136px]" : "min-w-[320px]";
  const shade = (date: string) =>
    date === today ? "bg-accent-subtle/40" : data.holidays.has(date) ? "bg-chip-pink-bg/25" : isWeekend(date) ? "bg-danger-subtle/30" : "";

  /** Клетка: смены дня; пусто — «Выходной» или «Праздник» пунктиром. */
  const cell = (row: Row, date: string): ReactNode => {
    const all = row.employees.flatMap((employee) => shiftsOf(employee.id, date));
    const shown = all.filter(visible);
    if (!all.length) {
      return month ? null : (
        <div className="flex h-11 items-center justify-center rounded-md border border-dashed border-border-strong text-xs font-medium text-fg-subtle group-hover/cell:border-accent group-hover/cell:text-accent-text">
          {data.holidays.has(date) ? t("schedule.holiday") : t("schedule.dayOff")}
        </div>
      );
    }
    if (!row.position) return shown.map((shift) => <ShiftChip key={shift.id} shift={shift} mini={month} place={place(shift)} onOpen={open(shift)} />);
    // По должности — одинаковые смены одной плашкой «N из M».
    const same = new Map<string, Shift[]>();
    for (const shift of shown) {
      const key = `${shift.kind}|${shift.start}|${shift.end}`;
      same.set(key, [...(same.get(key) ?? []), shift]);
    }
    return [...same.values()]
      .sort((a, b) => a[0]!.start.localeCompare(b[0]!.start))
      .map((list) => {
        const shift = list[0]!;
        const count = new Set(list.map((item) => item.employeeId)).size;
        return (
          <ShiftChip
            key={shift.id}
            shift={shift}
            mini={month}
            place={t("schedule.ofTotal", { count, total: row.employees.length })}
            placeIcon={UsersIcon}
            badge={month ? String(count) : undefined}
            onOpen={open(shift)}
          />
        );
      });
  };

  const place = (shift: Shift) => (shift.kind === "remote" ? t("schedule.kind.remote") : locationName.get(shift.locationId) ?? "");
  const open = (shift: Shift) => (onOpenShift ? () => onOpenShift({ shift, date: shift.date }) : undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={period}>
        <div className="flex flex-wrap items-center gap-1">
          {SHIFT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setKinds((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(kind)) next.add(kind);
                  return next;
                })
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors ${
                kinds.has(kind) ? "bg-surface-active text-fg ring-1 ring-border-strong ring-inset" : "text-fg-muted hover:bg-surface-hover"
              }`}
            >
              <i className={`size-2 rounded-full ${KIND_STYLE[kind].stripe}`} />
              {t(`schedule.kind.${kind}`)}
              <b className="font-semibold text-fg tabular-nums">{stats.counts[kind]}</b>
            </button>
          ))}
          <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[13px] text-fg-muted">
            <i className="size-2 rounded-full bg-fg-subtle/50" />
            {t("schedule.dayOff")}
            <b className="font-semibold text-fg tabular-nums">{stats.counts.off}</b>
          </span>
          <span className="ml-2 text-xs text-fg-subtle">
            {t("schedule.total", { count: employees.length, hours: duration(stats.minutes) })}
          </span>
        </div>
      </PeriodBar>

      <div className="relative mx-6 mb-4 min-h-0 flex-1 overflow-auto">
        {data.fetching && !data.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className={`${headCell} left-0 z-30 min-w-[250px] px-3 text-left font-normal`}>
                <AxisSwitch value={settings.axis} onChange={settings.setAxis} />
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
                    <div className="px-1">
                      <div className="text-xs">
                        {head.weekday(date)}, {head.day(date)}
                      </div>
                      {data.holidays.get(date) && <div className="truncate text-2xs font-normal text-chip-pink-fg">{data.holidays.get(date)}</div>}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={data.fetching && !data.loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {data.loading ? (
              <Message span={dates.length + 1}>{t("common.loading")}</Message>
            ) : !employees.length ? (
              <Message span={dates.length + 1}>{t("table.noRows")}</Message>
            ) : (
              groups.map((group) => (
                <Fragment key={group.id}>
                  {group.label && (
                    <tr className="cursor-pointer" onClick={() => toggleGroup(group.id)}>
                      <td className={`${body} sticky left-0 z-10 bg-surface-soft px-3 py-1.5`}>
                        <span className="flex items-center gap-1.5 text-[13px]">
                          <Icon
                            as={ChevronDownIcon}
                            size={14}
                            className={`text-fg-subtle transition-transform ${closed.has(group.id) ? "-rotate-90" : ""}`}
                          />
                          <b className="font-semibold">{group.label}</b>
                          <span className="text-fg-subtle">{group.rows.length}</span>
                        </span>
                      </td>
                      <td colSpan={dates.length} className={`${body} bg-surface-soft`} />
                    </tr>
                  )}
                  {!closed.has(group.id) &&
                    group.rows.map((row) => (
                      <tr key={row.id} className="group">
                        <td className={`${body} sticky left-0 z-10 bg-surface px-3 py-1.5 group-hover:bg-surface-hover`}>
                          {row.position !== undefined ? (
                            <PositionName name={row.position || "—"} count={row.employees.length} />
                          ) : (
                            <EmployeeHead
                              employee={row.employees[0]!}
                              until={range.to}
                              template={month ? undefined : templateOf(row.employees[0]!)}
                              onOpen={() => onOpenEmployee(row.employees[0]!.id, ATTENDANCE_TAB)}
                            />
                          )}
                        </td>
                        {dates.map((date) => (
                          <td
                            key={date}
                            onClick={onOpenShift ? () => onOpenShift({ employeeId: row.employees[0]!.id, date }) : undefined}
                            className={`${body} group/cell px-1 py-1 align-middle ${month ? "text-center" : ""} ${shade(date)} ${
                              onOpenShift ? "cursor-copy" : ""
                            }`}
                          >
                            <div className={month ? "flex flex-col items-center gap-0.5" : "flex flex-col gap-0.5"}>{cell(row, date)}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const headCell = "sticky top-0 h-11 border-b border-border bg-surface";
const body = "border-b border-border";

function Message({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="py-10 text-center text-fg-subtle">
        {children}
      </td>
    </tr>
  );
}

/** «Сотрудник | Должность» — `axisSeg` прототипа. */
function AxisSwitch({ value, onChange }: { value: "employee" | "position"; onChange: (axis: "employee" | "position") => void }) {
  const { t } = useTranslation();
  const items = [
    { axis: "employee" as const, icon: UserIcon, label: t("schedule.axis.employee") },
    { axis: "position" as const, icon: BriefcaseIcon, label: t("schedule.axis.position") },
  ];
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {items.map((item) => (
        <button
          key={item.axis}
          type="button"
          onClick={() => onChange(item.axis)}
          className={`inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-xs transition-colors ${
            value === item.axis ? "bg-surface-active font-medium text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          <Icon as={item.icon} size={13} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function EmployeeHead({
  employee,
  until,
  template,
  onOpen,
}: {
  employee: ScheduleEmployee;
  until: string;
  template: Template | undefined;
  onOpen: () => void;
}) {
  return (
    <div>
      <EmployeeName employee={employee} until={until} avatar={<Avatar name={employee.name} photo={employee.photo || undefined} size="lg" />} onOpen={onOpen} />
      {template && <TemplateTag template={template} className="mt-1 ml-[38px]" />}
    </div>
  );
}

/** Метка шаблона — `.sg-tn` прототипа, цветом шаблона. */
export function TemplateTag({ template, className = "" }: { template: Template; className?: string }) {
  return (
    <span className={`inline-flex max-w-[190px] items-center gap-1 truncate rounded px-1.5 py-px text-2xs ${CHIP_STYLES[hexToChipColor(template.color)]} ${className}`}>
      {template.name}
    </span>
  );
}

function PositionName({ name, count }: { name: string; count: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-hover text-fg-muted">
        <Icon as={BriefcaseIcon} size={15} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-fg">{name}</div>
        <div className="text-2xs text-fg-subtle">{t("schedule.employees", { count })}</div>
      </div>
    </div>
  );
}

/** Плашка смены — `.sg-chip` прототипа; в месяце — `.sg-mini` с часом начала. */
function ShiftChip({
  shift,
  mini,
  place,
  placeIcon,
  badge,
  onOpen,
}: {
  shift: Shift;
  mini: boolean;
  place: string;
  placeIcon?: LucideIcon;
  badge?: string | undefined;
  onOpen: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const style = KIND_STYLE[shift.kind];
  const time = `${shift.start}–${shift.end}`;
  const click = onOpen
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onOpen();
      }
    : undefined;
  if (mini)
    return (
      <button type="button" title={`${time}${place ? ` · ${place}` : ""}`} onClick={click} className={`h-6 w-[30px] rounded text-[11px] font-semibold tabular-nums hover:brightness-95 ${style.chip}`}>
        {badge ?? shift.start.slice(0, 2)}
      </button>
    );
  return (
    <button type="button" onClick={click} className={`relative flex w-full flex-col items-start overflow-hidden rounded-md py-1.5 pr-2 pl-3 text-left hover:brightness-[.97] ${style.chip}`}>
      <i className={`absolute inset-y-0 left-0 w-[3px] ${style.stripe}`} />
      <b className="text-[13px] font-semibold tabular-nums">{time}</b>
      {place && (
        <span className="flex max-w-full items-center gap-1 truncate text-[11.5px] opacity-80">
          <Icon as={placeIcon ?? style.icon} size={11} className="shrink-0" />
          <span className="truncate">{place}</span>
        </span>
      )}
      {!shift.templateId && !placeIcon && (
        <span title={t("schedule.oneOff")} className="absolute top-1 right-1.5 text-chart-2">
          <Icon as={SparkleIcon} size={12} />
        </span>
      )}
    </button>
  );
}
