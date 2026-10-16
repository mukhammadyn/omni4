import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BriefcaseIcon, ChevronDownIcon, RefreshCwIcon, SparkleIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { Icon } from "@/shared/ui/icon";
import { useSchedule, useScheduleDirectory, type ScheduleEmployee } from "../api/schedule";
import { byEmployeeDate, type Shift, type ShiftKind } from "../model/schedule";
import { isWeekend } from "../model/timesheet";
import { EmployeeName, MoreRows, PeriodBar, SHEET_PAGE, useDayHead, usePeriod, type OpenEmployee } from "./attendance-parts";
import { SCHEDULE_TAB } from "./employee-tabs";
import { useScheduleSettings, type ScheduleGroup } from "./schedule-settings";
import { KindIcon, useDuration, useKinds, useShiftTime, type KindLook, type OpenShift } from "./schedule-parts";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import { ShiftDialog } from "./ShiftDialog";

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
  search,
  onOpenEmployee,
  onOpenTemplate,
}: {
  viewId: string;
  search: string;
  onOpenEmployee: OpenEmployee;
  /** Шаблон смены — на вкладке «Шаблоны». */
  onOpenTemplate?: ((templateId: string) => void) | undefined;
}) {
  const { t } = useTranslation();
  const period = usePeriod(viewId, undefined, search);
  const { scale, range, dates, today, query } = period;
  const settings = useScheduleSettings(viewId);
  // Ось «Должность» сводит всех людей должности в строку — ей нужны все сразу.
  const data = useSchedule({
    ...range,
    search: query,
    where: settings.where,
    ...(settings.axis === "employee" ? { pageSize: SHEET_PAGE } : {}),
  });
  const { locations } = useScheduleDirectory();
  const head = useDayHead();
  const duration = useDuration();
  const kindsOf = useKinds();
  const [kinds, setKinds] = useState<Set<ShiftKind>>(() => new Set());
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<OpenShift | null>(null);
  const [applyFor, setApplyFor] = useState<string | null>(null);
  const onOpenShift = setEditing;
  const month = scale === "month";

  const shiftsOf = useMemo(() => byEmployeeDate(data.shifts), [data.shifts]);
  const locationName = useMemo(() => new Map(locations.map((item) => [item.id, item.name])), [locations]);

  // Поиск и отбор — на сервере (api/schedule, useSchedule): второй отбор на клиенте
  // прятал бы тех, кого сервер нашёл, и итог разошёлся бы со строками.
  const employees = data.employees;

  const visible = (shift: Shift) => !kinds.size || kinds.has(shift.kind);

  /*
   * Счётчики — по всей компании, а не по прокрученным строкам: смены
   * периода и так грузятся на всех (api/schedule), а число сотрудников
   * приходит в `count`. С поиском или отбором так нельзя — смены не знают
   * отдела, — и счёт идёт по загруженным, как в «Посещаемости».
   */
  const narrowed = Boolean(query) || settings.active > 0;
  const stats = useMemo(() => {
    const byKind = new Map<ShiftKind, number>();
    const count = (shift: Shift) => byKind.set(shift.kind, (byKind.get(shift.kind) ?? 0) + 1);
    let off = 0;
    let minutes = 0;
    if (data.hasMore && !narrowed) {
      const worked = new Set<string>();
      for (const shift of data.shifts) {
        count(shift);
        minutes += shift.plannedMinutes;
        worked.add(`${shift.employeeId}|${shift.date}`);
      }
      off = Math.max(0, data.total * dates.length - worked.size);
      return { byKind, off, minutes, people: data.total };
    }
    for (const employee of employees)
      for (const date of dates) {
        const list = shiftsOf(employee.id, date);
        if (!list.length) off += 1;
        for (const shift of list) {
          count(shift);
          minutes += shift.plannedMinutes;
        }
      }
    return { byKind, off, minutes, people: employees.length };
  }, [employees, dates, shiftsOf, data.hasMore, data.shifts, data.total, narrowed]);

  /* Строки: сотрудники или должности, по группам. */
  const groups = useMemo(() => {
    const rowsOf = (list: ScheduleEmployee[]): Row[] => {
      if (settings.axis === "employee") return list.map((employee) => ({ id: employee.id, employees: [employee] }));
      const byPosition = new Map<string, ScheduleEmployee[]>();
      for (const employee of list) byPosition.set(employee.position, [...(byPosition.get(employee.position) ?? []), employee]);
      return [...byPosition]
        // «—» (должность не заполнена) — в конце, как у групп.
        .sort(([a], [b]) => Number(!a) - Number(!b) || a.localeCompare(b))
        .map(([position, members]) => ({ id: `p:${position}`, employees: members, position }));
    };
    const keyOf: Record<Exclude<ScheduleGroup, "none">, (e: ScheduleEmployee) => [string, string]> = {
      dept: (e) => [e.departmentId, e.department],
      location: (e) => [e.locationId, e.location],
      position: (e) => [e.positionId, e.position],
    };
    if (settings.group === "none")
      return [{ id: "", label: "", rows: rowsOf(employees) }];
    const group = keyOf[settings.group];
    // Строки — целиком, по первому сотруднику: должность не делится между группами, как в прототипе.
    const buckets = new Map<string, { label: string; rows: Row[] }>();
    for (const row of settings.axis === "position" ? rowsOf(employees) : employees.map((e) => ({ id: e.id, employees: [e] }))) {
      const [id, label] = group(row.employees[0]!);
      const bucket = buckets.get(id) ?? { label: label || "—", rows: [] };
      bucket.rows.push(row);
      buckets.set(id, bucket);
    }
    return [...buckets]
      // Крупные группы первыми, «—» (поле не заполнено) — в конце.
      .sort(([idA, a], [idB, b]) => Number(!idA) - Number(!idB) || b.rows.length - a.rows.length)
      .map(([id, { label, rows }]) => ({ id: `${settings.axis}:${settings.group}:${id}`, label, rows }));
  }, [employees, settings.axis, settings.group]);

  const toggleGroup = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const width = month ? "min-w-[40px]" : scale === "week" ? "min-w-[136px]" : "min-w-[320px]";
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
    if (!row.position) return shown.map((shift) => <ShiftChip key={shift.id} shift={shift} kind={kindsOf.of(shift.kind)} mini={month} place={place(shift)} onOpen={open(shift)} />);
    // По должности — смены одного вида одной плашкой «N из M»; время у них
    // может расходиться, на плашке — время самой ранней.
    const same = new Map<string, Shift[]>();
    for (const shift of shown) {
      const key = shift.kind;
      same.set(key, [...(same.get(key) ?? []), shift]);
    }
    return [...same.values()]
      .map((list) => [...list].sort((a, b) => a.start.localeCompare(b.start)))
      .sort((a, b) => a[0]!.start.localeCompare(b[0]!.start))
      .map((list) => {
        const shift = list[0]!;
        const count = new Set(list.map((item) => item.employeeId)).size;
        return (
          <ShiftChip
            key={shift.id}
            shift={shift}
            kind={kindsOf.of(shift.kind)}
            mini={month}
            place={t("schedule.ofTotal", { count, total: row.employees.length })}
            placeIcon={UsersIcon}
            badge={month ? `${count}/${row.employees.length}` : undefined}
            onOpen={() => onOpenShift({ shift, date: shift.date, seriesIds: list.map((item) => item.seriesId) })}
          />
        );
      });
  };

  const place = (shift: Shift) => {
    const kind = kindsOf.of(shift.kind);
    // Удалённо — вид вместо филиала; филиала нет — тоже вид: под временем не должно быть пусто.
    return kind.remote ? kind.name : locationName.get(shift.locationId) || (kind.id ? kind.name : "");
  };
  const open = (shift: Shift) => () => onOpenShift({ shift, date: shift.date });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={period}>
        <div className="flex flex-wrap items-center gap-1">
          {kindsOf.list.map(({ id: kind, name, stripe }) => (
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
              <i className={`size-2 rounded-full ${stripe}`} />
              {name}
              <b className="font-semibold text-fg tabular-nums">{stats.byKind.get(kind) ?? 0}</b>
            </button>
          ))}
          <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[13px] text-fg-muted">
            <i className="size-2 rounded-full bg-fg-subtle/50" />
            {t("schedule.dayOff")}
            <b className="font-semibold text-fg tabular-nums">{stats.off}</b>
          </span>
        </div>
      </PeriodBar>

      <div className="relative mx-6 mb-2 min-h-0 flex-1 overflow-auto">
        {data.fetching && !data.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className={`${headCell} left-0 z-30 min-w-[250px] border-r px-3 text-left font-normal`}>
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
                      <td className={`${body} sticky left-0 z-10 border-r bg-surface-soft px-3 py-1.5`}>
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
                        <td className={`${body} sticky left-0 z-10 border-r bg-surface px-3 py-1.5 group-hover:tint-surface-hover`}>
                          {row.position !== undefined ? (
                            <PositionName
                              name={row.position || "—"}
                              count={row.employees.length}
                            />
                          ) : (
                            <EmployeeHead
                              employee={row.employees[0]!}
                              until={range.to}
                              onOpen={() => onOpenEmployee(row.employees[0]!.id, SCHEDULE_TAB)}
                              onApply={() => setApplyFor(row.employees[0]!.id)}
                            />
                          )}
                        </td>
                        {dates.map((date) => (
                          <td
                            key={date}
                            // На строке должности сотрудника не подставляем: в ней их несколько.
                            onClick={() => onOpenShift(row.position !== undefined ? { date } : { employeeId: row.employees[0]!.id, date })}
                            className={`${body} group/cell px-1 py-1 align-middle ${month ? "text-center" : ""} ${shade(date)} cursor-copy`}
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
        {!data.loading && <MoreRows sheet={data} />}
      </div>
      {/* Итог — под таблицей, вне её прокрутки: виден всегда. */}
      <div className="mx-6 mb-3 shrink-0 text-xs text-fg-subtle tabular-nums">
        {t("schedule.total", { count: stats.people, hours: duration(stats.minutes) })}
      </div>

      {editing && <ShiftDialog open={editing} onClose={() => setEditing(null)} onOpenTemplate={onOpenTemplate} />}
      {applyFor && <ApplyTemplateDialog employeeIds={[applyFor]} onClose={() => setApplyFor(null)} />}
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
  onOpen,
  onApply,
}: {
  employee: ScheduleEmployee;
  until: string;
  onOpen: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <EmployeeName employee={employee} until={until} avatar={<Avatar name={employee.name} photo={employee.photo || undefined} size="lg" />} onOpen={onOpen} />
        {/* `.sg-tp` прототипа: применить шаблон этому сотруднику. */}
        <button
          type="button"
          onClick={onApply}
          title={t("apply.title")}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent-subtle hover:text-accent-text focus-visible:opacity-100"
        >
          <Icon as={RefreshCwIcon} size={14} />
        </button>
      </div>
    </div>
  );
}


/** Должность — `.sg-pos` прототипа, без отдела: «2 сотр.». */
function PositionName({ name, count }: { name: string; count: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-hover text-fg-muted">
        <Icon as={BriefcaseIcon} size={15} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-fg">{name}</div>
        <div className="truncate text-2xs text-fg-subtle">
          {t("schedule.employees", { count })}
        </div>
      </div>
    </div>
  );
}

/** Час и минуты сверху: «09⁰⁰». */
function MiniClock({ clock }: { clock: string }) {
  const [hours, minutes] = clock.split(":");
  return (
    <span>
      {hours}
      <sup className="text-[8px]">{minutes}</sup>
    </span>
  );
}

/** Плашка смены — `.sg-chip` прототипа; в месяце — `.sg-mini` с началом и концом. */
function ShiftChip({
  shift,
  kind: style,
  mini,
  place,
  placeIcon,
  badge,
  onOpen,
}: {
  shift: Shift;
  kind: KindLook;
  mini: boolean;
  place: string;
  placeIcon?: LucideIcon;
  badge?: string | undefined;
  onOpen: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const time = useShiftTime()(shift);
  // У гибкой смены нет часов — в месяце вместо них «8 ч».
  const short = badge ?? (shift.start ? undefined : time);
  const click = onOpen
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onOpen();
      }
    : undefined;
  if (mini)
    return (
      <button type="button" title={`${time}${place ? ` · ${place}` : ""}`} onClick={click} className={`flex min-w-[34px] flex-col items-center rounded px-0.5 py-0.5 text-[11px] leading-[13px] font-semibold tabular-nums hover:brightness-95 ${short ? "h-6 justify-center" : ""} ${style.chip}`}>
        {short ?? [shift.start, shift.end].map((clock, index) => <MiniClock key={index} clock={clock} />)}
      </button>
    );
  return (
    <button type="button" onClick={click} className={`relative flex w-full flex-col items-start overflow-hidden rounded-md py-1.5 pr-2 pl-3 text-left hover:brightness-[.97] ${style.chip}`}>
      <i className={`absolute inset-y-0 left-0 w-[3px] ${style.stripe}`} />
      <b className="text-[13px] font-semibold tabular-nums">{time}</b>
      {place && (
        <span className="flex max-w-full items-center gap-1 truncate text-[11.5px] opacity-80">
          <span className="contents shrink-0">{placeIcon ? <Icon as={placeIcon} size={11} /> : <KindIcon kind={style} size={11} />}</span>
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
