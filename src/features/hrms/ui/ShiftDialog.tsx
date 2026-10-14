import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarXIcon, CheckIcon, ChevronDownIcon, LayoutTemplateIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTablePermissions } from "@/features/auth";
import { Avatar } from "@/features/item";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Popover } from "@/shared/ui/popover";
import {
  SHIFTS,
  useBusyShifts,
  useHolidays,
  useEmployeeSearch,
  useEmployeesById,
  useScheduleDirectory,
  useSeries,
  useTemplates,
  useWriteShifts,
  type ScheduleEmployee,
} from "../api/schedule";
import {
  draftsOfForm,
  editSeries,
  endOf,
  formOfSeries,
  isClock,
  isOneDate,
  occupiedBy,
  resolveBusy,
  scopedRows,
  SHIFT_KINDS,
  toClock,
  toMinutes,
  weekdayOf,
  withOwnFields,
  type BusyPolicy,
  type SeriesScope,
  type Shift,
  type ShiftDraft,
  type ShiftForm,
} from "../model/schedule";
import { MoreRows } from "./attendance-parts";
import { ClockInput, DialogLoading, KIND_STYLE, Row, Segments, type OpenShift } from "./schedule-parts";

/**
 * Окно смены — `shiftModal` прототипа. Новая смена — на одного или
 * нескольких сотрудников, на день или серией по дням недели. Правка
 * и удаление серии (`series_id`) — по двум осям, как в HRMS: какие дни
 * и кому; прошлое не трогается — норма табеля (model/schedule,
 * editSeries). «Только 14 окт.» снимает один день у одного сотрудника.
 */
export function ShiftDialog({ open, onClose }: { open: OpenShift; onClose: () => void }) {
  const { shift } = open;
  const today = todayInput();
  // Строки без серии (заведённые в обход графика) — серия из одной строки.
  // Серия — с сегодня или со щёлкнутого дня, что раньше: прошлое правка не трогает.
  const series = useSeries(shift?.seriesId ?? "", shift && shift.date < today ? shift.date : today);
  const rows = useMemo(() => (shift && !shift.seriesId ? [shift] : series.rows), [shift, series.rows]);
  // Сотрудник новой смены (его должность и филиал) или правимой — для «Только <имя>».
  const subject = useEmployeesById([shift?.employeeId ?? open.employeeId ?? ""].filter(Boolean));

  if (shift?.seriesId && series.error) return <DialogLoading onClose={onClose} error={series.error} />;
  if (subject.loading || (shift?.seriesId && series.loading)) return <DialogLoading onClose={onClose} />;
  return (
    <ShiftForm
      key={shift?.id ?? "new"}
      open={open}
      rows={rows}
      oneDate={!series.earlier && isOneDate(rows)}
      subject={subject.employees[0]}
      onClose={onClose}
    />
  );
}

function ShiftForm({
  open,
  rows,
  oneDate,
  subject,
  onClose,
}: {
  open: OpenShift;
  rows: Shift[];
  /** Серия из одной даты — правится целиком (model/schedule, isOneDate). */
  oneDate: boolean;
  subject: ScheduleEmployee | undefined;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const editing = Boolean(open.shift);
  const today = todayInput();
  const directory = useScheduleDirectory({ forms: true });
  const { templates } = useTemplates();
  const write = useWriteShifts();
  // Бэкенд права проверит сам; здесь — чтобы не предлагать то, что он отклонит.
  const can = useTablePermissions()(SHIFTS);
  const anchor = open.shift;
  const [form, setForm] = useState<ShiftForm>(() => {
    if (anchor) return formOfSeries(rows, anchor);
    const employee = subject;
    return {
      employeeIds: employee ? [employee.id] : [],
      positionId: employee?.positionId ?? "",
      mode: "range",
      start: open.start ?? "09:00",
      // С часа — те же девять часов, что у 09–18, но не позже 23:00, как в прототипе.
      end: open.start ? toClock(Math.min(23 * 60, toMinutes(open.start) + 9 * 60)) : "18:00",
      hours: 8,
      kind: "day",
      from: open.date,
      to: open.date,
      weekdays: [],
      locationId: employee?.locationId ?? "",
      projectId: "",
      comment: "",
    };
  });
  const { dates: holidays, loading: holidaysLoading } = useHolidays(form.from, form.to);
  /** Шаг подтверждения правки или удаления серии: какие дни и кому. */
  const [confirm, setConfirm] = useState<"save" | "delete" | null>(null);
  const [scope, setScope] = useState<SeriesScope>({ days: "all", people: "all" });
  /** Заполнить пропуски — только по просьбе (model/schedule, editSeries). */
  const [fillGaps, setFillGaps] = useState(false);
  const manyDates = !oneDate;
  const members = new Set(rows.map((row) => row.employeeId)).size;
  const set = (patch: Partial<ShiftForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const one = form.from === form.to;
  const preview = useMemo(() => (one ? [] : draftsOfForm(form, "", holidays)), [one, form, holidays]);
  const template = templates.find((item) => item.id === anchor?.templateId);
  const day = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${open.date}T00:00:00Z`),
  );

  const setPeriod = (patch: { from?: string; to?: string }) => {
    const next = { ...form, ...patch };
    if (next.to < next.from) next.to = next.from;
    // Серии нужны дни недели — по умолчанию будни, как в прототипе.
    if (next.from !== next.to && !next.weekdays.length) next.weekdays = [0, 1, 2, 3, 4];
    setForm(next);
  };

  const done = (message: string) => {
    toast.success(message);
    onClose();
  };

  // guid серии новой смены — один на окно: план пересчитывается на каждый клик, а цифры должны сравниваться.
  const [newSeriesId] = useState(() => crypto.randomUUID());
  const busyCheck = useBusyShifts();
  /** Смены, что уже стоят у выбранных в периоде формы (кроме своей серии), — грузятся на «Сохранить». */
  const [busy, setBusy] = useState<Shift[]>([]);
  const [policy, setPolicy] = useState<BusyPolicy>("skip");

  // Карточки выбранных — свои поля новых строк, имена в пропусках и занятых днях; тот же запрос, что у плашек выбора.
  const chosen = useEmployeesById(form.employeeIds);
  const cards = useMemo(() => new Map(chosen.employees.map((item) => [item.id, item])), [chosen.employees]);

  /** Что запишет сохранение при этих осях — до проверки занятых дней. */
  const planOf = (axes: SeriesScope, gaps: boolean) => {
    const plan = anchor
      ? editSeries(rows, anchor, form, axes, { today, holidays, oneDate, fillGaps: gaps })
      : { remove: [], add: draftsOfForm(form, newSeriesId, holidays), gaps: [], moved: [] };
    return { ...plan, add: withOwnFields(plan.add, cards) };
  };

  /** Что запишет подтверждение при текущих осях. */
  const change = useMemo((): {
    remove: string[];
    add: (ShiftDraft & { id?: string })[];
    gaps: ShiftDraft[];
    conflicts: Shift[];
  } => {
    if (!confirm) return { remove: [], add: [], gaps: [], conflicts: [] };
    if (confirm === "delete")
      return { remove: anchor ? scopedRows(rows, anchor, form, scope, today, oneDate).map((row) => row.id) : [], add: [], gaps: [], conflicts: [] };
    const plan = planOf(scope, fillGaps);
    return { ...plan, ...resolveBusy(plan.add, busy, policy) };
  }, [anchor, confirm, rows, form, scope, today, holidays, oneDate, fillGaps, busy, policy, newSeriesId, cards]);
  const weekdayName = (index: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)));
  const shortDate = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const nameOf = (id: string) => cards.get(id)?.name ?? "…";
  const gapSummary = useMemo(() => {
    const { gaps } = change;
    if (!gaps.length) return "";
    const weekdays = [...new Set(gaps.map((gap) => weekdayOf(gap.date)))].sort().map(weekdayName).join(", ");
    const names = [...new Set(gaps.map((gap) => nameOf(gap.employeeId)))].join(", ");
    return t("shift.gaps", { weekdays, names, count: gaps.length });
  }, [change, chosen.employees, t]);
  /** «Иванов — 21 окт., 28 окт.»: чью смену затрут и в какие дни, а не голое число. */
  const conflictLines = useMemo(() => {
    const byEmployee = new Map<string, string[]>();
    for (const row of change.conflicts) byEmployee.set(row.employeeId, [...(byEmployee.get(row.employeeId) ?? []), row.date]);
    return [...byEmployee].map(([id, dates]) => ({ id, name: nameOf(id), dates: dates.sort() }));
  }, [change.conflicts, chosen.employees]);

  const savedMessage = anchor
    ? t("shift.saved")
    : form.employeeIds.length > 1
      ? t("shift.createdMany", { count: form.employeeIds.length })
      : t("shift.created");

  const commit = (next: { remove: string[]; add: (ShiftDraft & { id?: string })[] }, message: string) => {
    // Пустое изменение — не успех: правка целиком в прошлом или ничего не тронуто.
    if (!next.remove.length && !next.add.length) {
      toast.error(t("shift.nothing"));
      return setConfirm(null);
    }
    write.mutate(next, { onSuccess: () => done(message) });
  };

  const save = async () => {
    if (!form.employeeIds.length) return toast.error(t("shift.needEmployees"));
    if (form.mode === "range" ? !isClock(form.start) || !isClock(form.end) : !isClock(form.start) || form.hours <= 0)
      return toast.error(t("shift.badTime"));
    if (!one && !form.weekdays.length) return toast.error(t("shift.needWeekdays"));
    // Новая серия задним числом переписала бы норму табеля; один прошлый день — можно.
    if (!anchor && !one && form.from < today) return toast.error(t("shift.pastFrom"));

    // Занятые дни — как в HRMS: всё, что стоит у выбранных в периоде формы, кроме своей серии.
    let found: Shift[];
    try {
      found = await busyCheck.mutateAsync({ employeeIds: form.employeeIds, from: form.from, to: form.to });
    } catch {
      return;
    }
    const own = (row: Shift) => Boolean(anchor) && (anchor!.seriesId ? row.seriesId === anchor!.seriesId : row.id === anchor!.id);
    const others = found.filter((row) => !own(row));
    // С пропусками — самый широкий план: занятость проверяется по всему, что может лечь.
    const widest = planOf({ days: "all", people: "all" }, true);
    const occupied = occupiedBy(widest.moved, others);
    if (occupied) return toast.error(t("shift.occupied", { name: nameOf(occupied.employeeId), day: shortDate(occupied.date) }));
    setBusy(others);
    setPolicy("skip");

    const plain = planOf({ days: "all", people: "all" }, false);
    const conflicts = resolveBusy(widest.add, others, "skip").conflicts.length;
    // Пропуски — вопрос к человеку, даже у смены одного дня: растянули её — новые дни тоже пропуски.
    if (conflicts || (anchor && (manyDates || members > 1 || plain.gaps.length))) {
      setScope({ days: "all", people: "all" });
      setFillGaps(false);
      return setConfirm("save");
    }
    commit(plain, savedMessage);
  };

  // Удаление по умолчанию сужено до одной строки (hrms ADR-0004).
  const askDelete = () => {
    // Прошлый день серии не снимается — «только этот» там недоступен, ближайшее — «с него и дальше» (то есть с сегодня).
    setScope({ days: manyDates && open.date < today ? "following" : "single", people: "single" });
    setConfirm("delete");
  };
  const skipDay = () => anchor && commit({ remove: [anchor.id], add: [] }, t("shift.skipped", { day }));
  const person = subject?.name ?? "—";
  const updated = change.add.filter((row) => "id" in row).length;

  const options = (list: { id: string; name: string }[]) => [{ value: "", label: "—" }, ...list.map((item) => ({ value: item.id, label: item.name }))];

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">
          {confirm === "delete" ? t("shift.deleteTitle") : editing ? t("shift.edit") : t("shift.new")}
        </h2>

        {confirm ? (
          <>
            <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
              {manyDates && (
                <Row label={t("shift.scope.days")}>
                  <div className="flex flex-col gap-1.5">
                    <Choice on={scope.days === "single"} disabled={open.date < today} onClick={() => setScope({ ...scope, days: "single" })}>
                      {t("shift.only", { day })}
                    </Choice>
                    <Choice on={scope.days === "following"} onClick={() => setScope({ ...scope, days: "following" })}>
                      {t("shift.scope.following", { day })}
                    </Choice>
                    <Choice on={scope.days === "all"} onClick={() => setScope({ ...scope, days: "all" })}>
                      {t("shift.scope.all")}
                    </Choice>
                  </div>
                </Row>
              )}
              {members > 1 && (
                <Row label={t("shift.scope.people", { count: members })}>
                  <div className="flex flex-col gap-1.5">
                    <Choice on={scope.people === "all"} onClick={() => setScope({ ...scope, people: "all" })}>
                      {t("shift.scope.everyone")}
                    </Choice>
                    <Choice on={scope.people === "single"} onClick={() => setScope({ ...scope, people: "single" })}>
                      {t("shift.only", { day: person })}
                    </Choice>
                  </div>
                </Row>
              )}
              <p className="text-[13px] text-fg-muted">
                {confirm === "delete"
                  ? t("shift.scope.deleteCount", { count: change.remove.length })
                  : t("shift.scope.saveCount", { updated, added: change.add.length - updated, removed: change.remove.length })}
              </p>
              {/* Пропуск — записанное решение (сняли день), поэтому заполнение отдельным вопросом, а не молча. */}
              {confirm === "save" && (change.gaps.length > 0 || fillGaps) && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 ring-1 ring-border ring-inset">
                  <input type="checkbox" checked={fillGaps} onChange={(event) => setFillGaps(event.target.checked)} className="mt-0.5 size-4 accent-accent" />
                  <span className="min-w-0 text-[13px]">
                    <span className="block font-medium text-fg">{t("shift.fillGaps")}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {gapSummary}
                      {!fillGaps && gapSummary && ` ${t("shift.gapsStay")}`}
                    </span>
                  </span>
                </label>
              )}
              {/* Кого перезаписываем — по именам и датам: «у 3 дней смены уже есть» не отвечает,
                  чью смену затрут (HRMS, ShiftModal). */}
              {confirm === "save" && conflictLines.length > 0 && (
                <div className="rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] ring-1 ring-warning/40 ring-inset">
                  <p className="font-medium text-fg">{t("shift.busy", { count: change.conflicts.length })}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-fg-muted">
                    {conflictLines.map((line) => (
                      <li key={line.id}>
                        <span className="font-medium text-fg">{line.name}</span> — {line.dates.slice(0, 4).map(shortDate).join(", ")}
                        {line.dates.length > 4 && ` ${t("shift.busyMore", { count: line.dates.length - 4 })}`}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(["skip", "overwrite"] as const).map((value) => (
                      <label key={value} className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="shift-busy"
                          checked={policy === value}
                          onChange={() => setPolicy(value)}
                          className="size-4 accent-accent"
                        />
                        {t(`shift.busyPolicy.${value}`)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {manyDates && rows.some((row) => row.date < today) && <p className="text-xs text-fg-subtle">{t("shift.scope.past")}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                {t("action.back")}
              </Button>
              <Button
                variant={confirm === "delete" ? "danger" : "primary"}
                disabled={write.isPending}
                onClick={() =>
                  commit(
                    change,
                    confirm === "delete"
                      ? t("shift.deleted")
                      : policy === "skip" && change.conflicts.length
                        ? `${savedMessage} · ${t("shift.busySkipped", { count: change.conflicts.length })}`
                        : savedMessage,
                  )
                }
              >
                {write.isPending ? t("common.saving") : confirm === "delete" ? t("action.delete") : t("action.save")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
              {template && (
                <div className="flex gap-2 rounded-lg bg-accent-subtle px-3 py-2.5 text-[13px] text-fg">
                  <Icon as={LayoutTemplateIcon} size={15} className="mt-0.5 shrink-0 text-accent-text" />
                  <span>{t("shift.fromTemplate", { name: template.name })}</span>
                </div>
              )}

              <Row label={t("shift.employees")}>
                <EmployeePicker value={form.employeeIds} onChange={(employeeIds) => set({ employeeIds })} />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label={t("shift.position")}>
                  <Dropdown
                    value={form.positionId}
                    items={options(directory.positions)}
                    onChange={(positionId) => set({ positionId })}
                  />
                </Row>
                <Row label={t("shift.count")}>
                  <Input value={form.employeeIds.length} readOnly className="bg-surface-soft" />
                </Row>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Segments
                  full
                  value={form.mode}
                  items={[
                    { value: "range", label: t("shift.mode.range") },
                    { value: "hours", label: t("shift.mode.hours") },
                  ]}
                  onChange={(mode) => set({ mode })}
                />
                <Segments
                  full
                  value={form.kind}
                  items={SHIFT_KINDS.map((kind) => ({
                    value: kind,
                    label: (
                      <>
                        <Icon as={KIND_STYLE[kind].icon} size={13} />
                        {t(`schedule.kind.${kind}`)}
                      </>
                    ),
                  }))}
                  onChange={(kind) => set({ kind })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Row label={t("shift.start")}>
                  <ClockInput value={form.start} onChange={(start) => set({ start })} />
                </Row>
                {form.mode === "range" ? (
                  <Row label={t("shift.end")} hint={isClock(form.start) && isClock(form.end) && form.end <= form.start ? t("shift.overnight") : undefined}>
                    <ClockInput value={form.end} onChange={(end) => set({ end })} />
                  </Row>
                ) : (
                  <Row label={t("shift.hours")} hint={isClock(form.start) ? t("shift.until", { end: endOf(form) }) : undefined}>
                    <Input type="number" min={1} max={16} value={form.hours} onChange={(event) => set({ hours: Number(event.target.value) })} />
                  </Row>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Row label={t("shift.from")}>
                  <DatePicker value={form.from} locale={i18n.language} className="h-(--spacing-input) w-full" onChange={(from) => from && setPeriod({ from })} />
                </Row>
                <Row label={t("shift.to")}>
                  <DatePicker value={form.to} locale={i18n.language} className="h-(--spacing-input) w-full" onChange={(to) => to && setPeriod({ to })} />
                </Row>
              </div>

              <Row label={t("shift.weekdays")} hint={one ? t("shift.oneDayHint") : undefined}>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 7 }, (_, index) => {
                    const on = one ? index === weekdayOf(form.from) : form.weekdays.includes(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        disabled={one}
                        onClick={() =>
                          set({ weekdays: on ? form.weekdays.filter((item) => item !== index) : [...form.weekdays, index].sort() })
                        }
                        className={`h-8 min-w-11 rounded-md border text-[13px] font-medium capitalize transition-colors ${
                          on ? "border-accent/50 bg-accent-subtle text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-hover"
                        } ${one && !on ? "opacity-45" : ""}`}
                      >
                        {weekdayName(index)}
                      </button>
                    );
                  })}
                </div>
              </Row>

              <Row label={t("shift.location")}>
                <Dropdown value={form.locationId} items={options(directory.locations)} onChange={(locationId) => set({ locationId })} />
              </Row>
              <Row label={t("shift.project")}>
                <Dropdown value={form.projectId} items={options(directory.projects)} onChange={(projectId) => set({ projectId })} />
              </Row>
              <Row label={t("shift.comment")}>
                <textarea
                  rows={3}
                  value={form.comment}
                  onChange={(event) => set({ comment: event.target.value })}
                  placeholder={t("shift.commentPlaceholder")}
                  className="w-full resize-y rounded-md border border-border-strong bg-input px-2.5 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
                />
              </Row>
              {!one && preview.length > 0 && (
                <p className="text-xs text-fg-subtle">
                  {t("shift.summary", { days: preview.length / Math.max(1, form.employeeIds.length), hours: preview[0]!.plannedMinutes / 60 })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border px-5 py-3">
              {editing && (
                <>
                  <Button variant="danger" onClick={askDelete} disabled={write.isPending || !can.delete}>
                    <Icon as={Trash2Icon} size={14} />
                    {t("action.delete")}
                  </Button>
                  {/* Прошлый день серии не снимается — он уже в норме табеля. */}
                  {manyDates && open.date >= today && (
                    <Button variant="secondary" onClick={skipDay} disabled={write.isPending || !can.delete}>
                      <Icon as={CalendarXIcon} size={14} />
                      {t("shift.only", { day })}
                    </Button>
                  )}
                </>
              )}
              <span className="flex-1" />
              <Button variant="ghost" onClick={onClose}>
                {t("action.cancel")}
              </Button>
              <Button onClick={save} disabled={write.isPending || busyCheck.isPending || holidaysLoading || chosen.loading || !(editing ? can.update : can.write)}>
                {write.isPending || busyCheck.isPending ? t("common.saving") : t("action.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Вариант оси — как выбор шаблона в «Применить». */
function Choice({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] disabled:opacity-45 ${
        on ? "bg-accent-subtle ring-2 ring-accent ring-inset" : "ring-1 ring-border ring-inset enabled:hover:bg-surface-hover"
      }`}
    >
      <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${on ? "border-accent" : "border-border-strong"}`}>
        {on && <span className="size-2 rounded-full bg-accent" />}
      </span>
      {children}
    </button>
  );
}

/**
 * Сотрудники плашками и список с поиском — `.ms` прототипа. Список ищет
 * на сервере и догружается прокруткой: вся компания окну не нужна.
 * Плашки — по guid выбранных.
 */
export function EmployeePicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const { t } = useTranslation();
  const chosen = useEmployeesById(value);
  const byId = useMemo(() => new Map(chosen.employees.map((item) => [item.id, item])), [chosen.employees]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <Popover
      className="w-full"
      trigger={({ open, toggle: flip }) => (
        <div className="flex min-h-9 w-full items-start gap-0.5 rounded-md border border-border-strong bg-input py-1 pr-1 pl-1.5">
          <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1">
            {value.length ? (
              value.map((id) => (
                <span key={id} className="inline-flex h-6 max-w-full items-center gap-1 rounded bg-surface-hover pr-1 pl-2 text-xs">
                  <span className="truncate">{byId.get(id)?.name ?? "…"}</span>
                  <button type="button" onClick={() => toggle(id)} className="grid size-4 place-items-center rounded text-fg-subtle hover:bg-border">
                    <Icon as={XIcon} size={11} />
                  </button>
                </span>
              ))
            ) : (
              <span className="pl-1 text-sm text-fg-subtle">{t("shift.pickEmployees")}</span>
            )}
          </div>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} title={t("shift.clear")} className="grid h-7 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-hover">
              <Icon as={XIcon} size={14} />
            </button>
          )}
          <button type="button" onClick={flip} aria-expanded={open} className="grid h-7 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-hover">
            <Icon as={ChevronDownIcon} size={14} />
          </button>
        </div>
      )}
    >
      {() => <EmployeeList value={value} onToggle={toggle} />}
    </Popover>
  );
}

/** Список выбора — отдельно, чтобы запрос шёл, только пока список открыт. */
function EmployeeList({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim());
  const list = useEmployeeSearch(search);

  return (
    <div className="w-[380px] p-1">
      <label className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-2 text-sm focus-within:border-accent">
        <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("shift.searchEmployee")}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
        />
      </label>
      <div className="mt-1 max-h-60 overflow-auto">
        {list.loading && <p className="py-3 text-center text-xs text-fg-subtle">{t("common.loading")}</p>}
        {list.employees.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-surface-hover"
          >
            <Avatar name={item.name} photo={item.photo || undefined} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.name}</span>
              <span className="block truncate text-2xs text-fg-subtle">{[item.position, item.department].filter(Boolean).join(" · ")}</span>
            </span>
            {value.includes(item.id) && <Icon as={CheckIcon} size={14} className="shrink-0 text-accent" />}
          </button>
        ))}
        <MoreRows sheet={list} />
      </div>
    </div>
  );
}
