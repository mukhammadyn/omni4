import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarXIcon, CheckIcon, ChevronDownIcon, ClockIcon, LayoutTemplateIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
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
  useHolidays,
  useScheduleDirectory,
  useScheduleEmployees,
  useSeries,
  useTemplates,
  useWriteShifts,
  type ScheduleEmployee,
} from "../api/schedule";
import {
  draftsOfForm,
  endOf,
  formOfSeries,
  isClock,
  rewriteSeries,
  SHIFT_KINDS,
  weekdayOf,
  type Shift,
  type ShiftForm,
} from "../model/schedule";
import { KIND_STYLE, type OpenShift } from "./schedule-parts";

/**
 * Окно смены — `shiftModal` прототипа. Новая смена — на одного или
 * нескольких сотрудников, на день или серией по дням недели; правка —
 * всей серии (`series_id`), но с сегодняшнего дня: прошлое — норма
 * табеля (model/schedule, rewriteSeries). «Только 14 окт.» снимает
 * один день серии — удаляет его строку.
 */
export function ShiftDialog({ open, onClose }: { open: OpenShift; onClose: () => void }) {
  const { shift } = open;
  // Строки без серии (заведённые в обход графика) — серия из одной строки.
  const series = useSeries(shift?.seriesId ?? "");
  const rows = useMemo(() => (shift && !shift.seriesId ? [shift] : series.rows), [shift, series.rows]);
  const { employees } = useScheduleEmployees();

  if (shift && series.loading && shift.seriesId) return null;
  return <ShiftForm key={shift?.id ?? "new"} open={open} rows={rows} employees={employees} onClose={onClose} />;
}

function ShiftForm({
  open,
  rows,
  employees,
  onClose,
}: {
  open: OpenShift;
  rows: Shift[];
  employees: ScheduleEmployee[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const editing = Boolean(open.shift);
  const today = todayInput();
  const directory = useScheduleDirectory({ forms: true });
  const { templates } = useTemplates();
  const write = useWriteShifts();
  const [form, setForm] = useState<ShiftForm>(() => {
    if (editing) return formOfSeries(rows);
    const employee = employees.find((item) => item.id === open.employeeId);
    return {
      employeeIds: employee ? [employee.id] : [],
      positionId: employee?.positionId ?? "",
      mode: "range",
      start: "09:00",
      end: "18:00",
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
  const holidays = useHolidays(form.from, form.to);
  const set = (patch: Partial<ShiftForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const one = form.from === form.to;
  const preview = useMemo(() => (one ? [] : draftsOfForm(form, "", holidays)), [one, form, holidays]);
  const template = templates.find((item) => item.id === rows[0]?.templateId);
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

  const save = () => {
    if (!form.employeeIds.length) return toast.error(t("shift.needEmployees"));
    if (form.mode === "range" ? !isClock(form.start) || !isClock(form.end) : !isClock(form.start) || form.hours <= 0)
      return toast.error(t("shift.badTime"));
    if (!one && !form.weekdays.length) return toast.error(t("shift.needWeekdays"));
    const seriesId = rows[0]?.seriesId || crypto.randomUUID();
    const drafts = draftsOfForm({ ...form, weekdays: one ? [] : form.weekdays }, seriesId, holidays).map((draft) => ({
      ...draft,
      templateId: rows[0]?.templateId ?? "",
    }));
    const change = editing ? rewriteSeries(rows, drafts, today) : { remove: [], add: drafts };
    write.mutate(change, {
      onSuccess: () =>
        done(editing ? t("shift.saved") : form.employeeIds.length > 1 ? t("shift.createdMany", { count: form.employeeIds.length }) : t("shift.created")),
    });
  };

  const removeSeries = () =>
    write.mutate({ remove: rewriteSeries(rows, [], today).remove, add: [] }, { onSuccess: () => done(t("shift.deleted")) });
  const skipDay = () =>
    open.shift && write.mutate({ remove: [open.shift.id], add: [] }, { onSuccess: () => done(t("shift.skipped", { day })) });

  const weekdayName = (index: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)));
  const options = (list: { id: string; name: string }[]) => [{ value: "", label: "—" }, ...list.map((item) => ({ value: item.id, label: item.name }))];

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">{editing ? t("shift.edit") : t("shift.new")}</h2>

        <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
          {template && (
            <div className="flex gap-2 rounded-lg bg-accent-subtle px-3 py-2.5 text-[13px] text-fg">
              <Icon as={LayoutTemplateIcon} size={15} className="mt-0.5 shrink-0 text-accent-text" />
              <span>{t("shift.fromTemplate", { name: template.name })}</span>
            </div>
          )}

          <Row label={t("shift.employees")}>
            <EmployeePicker employees={employees} value={form.employeeIds} onChange={(employeeIds) => set({ employeeIds })} />
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

          <div className="flex flex-wrap gap-2">
            <Segments
              value={form.mode}
              items={[
                { value: "range", label: t("shift.mode.range") },
                { value: "hours", label: t("shift.mode.hours") },
              ]}
              onChange={(mode) => set({ mode })}
            />
            <Segments
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
              <Button variant="danger" onClick={removeSeries} disabled={write.isPending}>
                <Icon as={Trash2Icon} size={14} />
                {t("action.delete")}
              </Button>
              {rows.length > 1 && (
                <Button variant="secondary" onClick={skipDay} disabled={write.isPending}>
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
          <Button onClick={save} disabled={write.isPending}>
            {write.isPending ? t("common.saving") : t("action.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Время «ЧЧ:ММ» текстом, как `.tin` прототипа: системное поле времени
 * пишет его по часам ОС — «06:00 PM» рядом с «09:00–17:00» в сетке.
 */
export function ClockInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Input
        value={value}
        inputMode="numeric"
        maxLength={5}
        placeholder="09:00"
        aria-invalid={!isClock(value)}
        onChange={(event) => onChange(event.target.value)}
        className={`pr-8 tabular-nums ${isClock(value) ? "" : "border-danger"}`}
      />
      <Icon as={ClockIcon} size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
}

function Segments<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 text-[13px] transition-colors ${
            value === item.value ? "bg-surface-active font-medium text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Сотрудники плашками и список с поиском — `.ms` прототипа. */
export function EmployeePicker({
  employees,
  value,
  onChange,
}: {
  employees: ScheduleEmployee[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);
  const needle = query.trim().toLocaleLowerCase();
  const shown = employees.filter(
    (item) => !needle || item.name.toLocaleLowerCase().includes(needle) || item.department.toLocaleLowerCase().includes(needle),
  );
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
      {() => (
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
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
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
          </div>
        </div>
      )}
    </Popover>
  );
}
