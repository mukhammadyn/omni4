import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlarmClockPlusIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  LoaderIcon,
  MessageSquareIcon,
  SigmaIcon,
  TableIcon,
  TimerIcon,
  Undo2Icon,
  UserCheckIcon,
  UsersIcon,
  UserXIcon,
  LayoutGridIcon,
  HistoryIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActiveCell, Avatar, editorKind } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { firstText, related, text, useOrgDirectory } from "../api/org";
import { TIMESHEETS, useLogEvent, useTimesheetDoc, useTimesheetNeighbours } from "../api/timesheet-docs";
import { useDecideSheet } from "../api/timesheet-days";
import { isEdited, type DayRow } from "../model/timesheet-days";
import { ApproveDialog, DayEditor, FillDoc } from "./TimesheetDayEditor";
import { TimesheetHistory } from "./TimesheetHistory";
import { monthName, SHEET_STATUS } from "../model/timesheet-docs";
import { useDayHead, dayTone } from "./attendance-parts";
import { Card } from "./page-parts";
import { CellView, Legend, TOTALS, TotalsCells } from "./Timesheet";

const OVERVIEW = "overview";
const GRID = "grid";
const HISTORY = "history";

/** Обязательные поля формы прототипа (`req:1`) — со звёздочкой. */
const REQUIRED = new Set(["period", "hr_departments_id"]);

/** Карточки «Обзора» — `form.layout` прототипа: поле и его значок. */
const SHEET: [string, LucideIcon][] = [
  ["period", CalendarIcon],
  ["period_kind", CalendarDaysIcon],
  ["hr_departments_id", BuildingIcon],
  ["status", LoaderIcon],
  ["core_users_id", UserCheckIcon],
];
const TOTAL_FIELDS: [string, LucideIcon][] = [
  ["people", UsersIcon],
  ["work_days", CalendarDaysIcon],
  ["worked_hours", TimerIcon],
  ["overtime_hours", AlarmClockPlusIcon],
  ["absence_days", UserXIcon],
];

/**
 * Страница табеля — `timesheet.html` прототипа: шапка с «Действиями»
 * (заполнить, утвердить / вернуть), «Обзор» — поля документа и итоги,
 * «Табель по дням» — сотрудники отдела × дни месяца, тот же табель, что
 * на экране «Посещаемость». Поле правится щелчком, как на странице
 * сотрудника; утверждённый табель только читается.
 */
export function TimesheetDocPage({
  guid,
  locale,
  language,
  tab,
  onTab,
  onOpenEmployee,
  onOpen,
}: {
  guid: string;
  locale: string;
  language: string;
  tab: string | undefined;
  onTab: (tab: string | undefined) => void;
  onOpenEmployee: (guid: string) => void;
  /** Соседний табель — «1 из 18» ‹ ›. */
  onOpen: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const doc = useTimesheetDoc(guid);
  const neighbours = useTimesheetNeighbours(guid);
  const log = useLogEvent(guid);
  const decide = useDecideSheet(guid);
  const [dialog, setDialog] = useState<"fill" | "approve" | null>(null);
  const [editing, setEditing] = useState<{ row: DayRow; name: string } | null>(null);
  const { departments } = useOrgDirectory();
  const head = useDayHead();
  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  const bySlug = useMemo(() => new Map(doc.fields.map((field) => [field.slug, field])), [doc.fields]);
  const relations = useMemo(() => new Map(doc.relations.map((relation) => [relation.id, relation])), [doc.relations]);

  const row = doc.row;
  if (!row)
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">
        {doc.isLoading ? t("common.loading") : (doc.error ?? t("timesheets.notFound"))}
      </p>
    );

  const approved = firstText(row.status) === SHEET_STATUS.approved;
  const canEdit = doc.can.update && !approved;
  const label = (field: Field) => localized(field.labels, language, field.label);

  /* Название — из месяца и отдела, как `apply` прототипа: меняется вместе с ними. */
  const titleFor = (values: Record<string, unknown>) => {
    const period = text(values.period ?? row.period).slice(0, 7);
    const dept = departments.find((item) => item.id === text(values.hr_departments_id ?? row.hr_departments_id))?.name ?? "";
    return period && dept ? `${t("timesheets.title")} · ${monthName(period, locale)} · ${dept}` : text(row.title);
  };

  /*
   * Значение — простым текстом, как поле формы прототипа: у выбора
   * стрелка, у даты календарь, числа — справа. Цветные чипы таблицы
   * тут лишние: это карточка документа, а не строка списка.
   */
  const plain = (field: Field, source: Record<string, unknown> = row): string => {
    const raw = source[field.slug];
    if (field.slug === "hr_departments_id")
      return departments.find((item) => item.id === text(raw))?.name ?? text(related(source, field.slug).name);
    // Логин не показываем: это учётные данные, а не имя.
    if (field.slug === "core_users_id") return doc.userNames.get(text(raw)) ?? "";
    if (field.type === "DATE") return formatDate(text(raw), "date", locale) ?? "";
    if (field.type === "PICK_LIST" || field.type === "STATUS") {
      const option = optionOf(field, firstText(raw));
      return option ? localized(option.labels, language, option.label || option.value) : firstText(raw);
    }
    return raw == null ? "" : String(raw);
  };
  /* Правка поля — и событие истории «было → стало» текстом, как на экране. */
  const edit = (slug: string, next: unknown) => {
    const field = bySlug.get(slug);
    const values = slug === "period" || slug === "hr_departments_id" ? { [slug]: next, title: titleFor({ [slug]: next }) } : { [slug]: next };
    const before = field ? plain(field) : "";
    doc.edit(values, () => {
      const after = field ? plain(field, { ...row, ...values }) : "";
      if (field && before !== after) log.mutate({ action: "edited", field: label(field), before, after });
    });
  };
  const trailing = (field: Field) =>
    field.type === "DATE" ? CalendarIcon : field.type === "PICK_LIST" || field.type.startsWith("LOOKUP") ? ChevronDownIcon : null;
  const value = (field: Field, align = "") => {
    const shown = plain(field);
    const tail = trailing(field);
    const content = (
      <>
        <span className={`min-w-0 flex-1 truncate ${align} ${shown ? "" : "text-fg-subtle"}`}>{shown || "—"}</span>
        {canEdit && tail && <Icon as={tail} size={15} className="shrink-0 text-fg-muted" />}
      </>
    );
    // Статус меняют только «Утвердить» и «Вернуть» (ADR-0018).
    return canEdit && field.slug !== "status" && editorKind(field) ? (
      <button
        type="button"
        onClick={(event) => setActive({ slug: field.slug, anchor: event.currentTarget.getBoundingClientRect() })}
        className="-mx-1.5 flex min-h-8 w-[calc(100%+12px)] min-w-0 items-center gap-2 rounded-[5px] px-1.5 text-left hover:bg-surface-hover"
      >
        {content}
      </button>
    ) : (
      <div className="flex min-h-8 min-w-0 items-center gap-2">{content}</div>
    );
  };
  const prop = (slug: string, icon: LucideIcon, align = ""): ReactNode => {
    const field = bySlug.get(slug);
    if (!field) return null;
    return (
      <div key={slug} className="flex min-h-11 items-center gap-3 text-sm">
        <span className="flex w-44 shrink-0 items-center gap-2 text-fg-muted">
          <Icon as={icon} size={15} />
          {label(field)}
          {REQUIRED.has(slug) && <span className="text-danger">*</span>}
        </span>
        <div className="min-w-0 flex-1">{value(field, align)}</div>
      </div>
    );
  };

  const giveBack = () =>
    decide.mutate({ decision: "return", mode: "daily" }, { onSuccess: () => toast.success(t("timesheets.returned")) });
  const status = bySlug.get("status");
  const note = bySlug.get("comment");
  const activeTab = tab === GRID || tab === HISTORY ? tab : OVERVIEW;
  const activeField = active ? bySlug.get(active.slug) : undefined;
  const today = todayInput();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pb-20 max-md:px-3">
        <header className="flex flex-wrap items-start gap-4 pt-6 pb-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-soft text-3xl">
            {approved ? "✅" : "⏱️"}
          </span>
          <div className="min-w-60 flex-1">
            <small className="text-xs font-medium tracking-[0.3px] text-fg-subtle uppercase">{t("timesheets.title")}</small>
            <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-bold tracking-[-0.01em]">
              {text(row.title) || "—"}
              {status && <StatusPill field={status} value={firstText(row.status)} language={language} />}
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
          {doc.can.update && (
            <Popover
              align="end"
              trigger={({ open, toggle }) => (
                <Button variant="secondary" onClick={toggle} aria-expanded={open}>
                  {t("timesheets.actions")}
                  <Icon as={ChevronDownIcon} size={14} />
                </Button>
              )}
            >
              {(close) => (
                <>
                  {!approved && (
                    <PopoverItem
                      icon={<Icon as={CalendarClockIcon} size={15} />}
                      onClick={() => {
                        close();
                        setDialog("fill");
                      }}
                    >
                      {t("timesheets.fill")}
                    </PopoverItem>
                  )}
                  {approved ? (
                    <PopoverItem
                      icon={<Icon as={Undo2Icon} size={15} />}
                      onClick={() => {
                        close();
                        giveBack();
                      }}
                    >
                      {t("timesheets.return")}
                    </PopoverItem>
                  ) : (
                    <PopoverItem
                      icon={<Icon as={CheckIcon} size={15} />}
                      onClick={() => {
                        close();
                        setDialog("approve");
                      }}
                    >
                      {t("timesheets.approve")}
                    </PopoverItem>
                  )}
                </>
              )}
            </Popover>
          )}
          {neighbours && (
            <div className="flex items-center gap-1 text-sm text-fg-subtle tabular-nums">
              {t("timesheets.position", { index: neighbours.index, total: neighbours.total })}
              <NavArrow icon={ChevronLeftIcon} label={t("timesheets.prev")} to={neighbours.prev} onOpen={onOpen} />
              <NavArrow icon={ChevronRightIcon} label={t("timesheets.next")} to={neighbours.next} onOpen={onOpen} />
            </div>
          )}
          </div>
        </header>

        <div className="mb-4 border-b border-border">
          <Tabs
            activeId={activeTab}
            onSelect={(id) => onTab(id === OVERVIEW ? undefined : id)}
            tabs={[
              { id: OVERVIEW, label: t("timesheets.overview"), icon: LayoutGridIcon },
              { id: GRID, label: t("timesheets.byDay"), icon: TableIcon, count: doc.rows.length },
              { id: HISTORY, label: t("timesheets.history"), icon: HistoryIcon },
            ]}
          />
        </div>

        {activeTab === OVERVIEW ? (
          <>
            <div className="grid items-stretch gap-4 min-[900px]:grid-cols-2">
              <Card icon={ClipboardListIcon} title={t("timesheets.title")}>
                {SHEET.map(([slug, icon]) => prop(slug, icon))}
              </Card>
              <Card icon={SigmaIcon} title={t("timesheets.totals")}>
                {TOTAL_FIELDS.map(([slug, icon]) => prop(slug, icon, "text-right tabular-nums"))}
              </Card>
            </div>
            {note && (
              <section className="mt-1">
                <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
                  <Icon as={MessageSquareIcon} size={16} className="text-fg-muted" />
                  {label(note)}
                </h3>
                <NoteInput
                  value={text(row.comment)}
                  /* Утверждённый табель только читается — и поле говорит об этом, а не молчит. */
                  placeholder={approved ? t("timesheets.lockedNote") : t("timesheets.notePlaceholder")}
                  disabled={!canEdit}
                  onCommit={(next) => doc.edit({ comment: next || null })}
                />
              </section>
            )}
          </>
        ) : activeTab === HISTORY ? (
          <TimesheetHistory guid={guid} createdAt={text(row.created_at)} canComment={doc.can.update} locale={locale} />
        ) : (
          <section className="rounded-[10px] border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
              <Legend types={doc.absenceTypes} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-fg-muted">
                    <th className="sticky left-0 z-10 min-w-50 border-b border-border bg-surface px-3 py-2 text-left font-normal">
                      {t("timesheet.employee")}
                    </th>
                    {doc.dates.map((date) => (
                      <th
                        key={date}
                        className={`min-w-7 border-b border-border px-0.5 py-2 text-center font-medium ${dayTone(date, today, doc.holidays)}`}
                      >
                        {head.day(date)}
                      </th>
                    ))}
                    {TOTALS.map((key, index) => (
                      <th
                        key={key}
                        className={`border-b border-border px-2 py-2 text-right font-normal whitespace-nowrap ${index === 0 ? "border-l" : ""}`}
                      >
                        {t(`timesheet.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.daysLoading || !doc.rows.length ? (
                    <tr>
                      <td colSpan={doc.dates.length + 1 + TOTALS.length} className="py-10 text-center text-fg-subtle">
                        {t(doc.daysLoading ? "common.loading" : "timesheets.notFilled")}
                      </td>
                    </tr>
                  ) : (
                    doc.rows.map(({ employee, cells, byDate, totals }) => (
                      <tr key={employee.id} className="group">
                        <td className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-1 group-hover:tint-surface-hover">
                          <button
                            type="button"
                            onClick={() => onOpenEmployee(employee.id)}
                            className="flex min-w-0 items-center gap-2 text-left text-sm hover:underline"
                          >
                            <Avatar name={employee.name} photo={employee.photo || undefined} size="sm" />
                            <span className="truncate">{employee.name}</span>
                          </button>
                        </td>
                        {cells.map((sheetCell, index) => {
                          const date = doc.dates[index]!;
                          const day = byDate.get(date);
                          return (
                            <td
                              key={date}
                              title={day && isEdited(day) ? t("timesheets.editedHint") : undefined}
                              className={`border-b border-border px-0 py-0.5 text-center ${day && isEdited(day) ? "ring-1 ring-accent ring-inset" : ""}`}
                            >
                              {sheetCell && (
                                <CellView
                                  cell={sheetCell}
                                  hours={(minutes) => String(Math.round(minutes / 6) / 10)}
                                  whole
                                  onOpen={() => (canEdit && day ? setEditing({ row: day, name: employee.name }) : onOpenEmployee(employee.id))}
                                />
                              )}
                            </td>
                          );
                        })}
                        <TotalsCells totals={totals} />
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {dialog === "fill" && (
        <FillDoc
          guid={guid}
          period={text(row.period).slice(0, 10)}
          kind={doc.kind}
          departmentId={text(row.hr_departments_id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "approve" && (
        <ApproveDialog
          unconfirmed={doc.days.filter((day) => !day.outside_period && day.unconfirmed).length}
          empty={!doc.days.length}
          busy={decide.isPending}
          onClose={() => setDialog(null)}
          onApprove={(mode) =>
            decide.mutate(
              { decision: "approve", mode },
              {
                onSuccess: () => {
                  toast.success(t("timesheets.approvedToast"));
                  setDialog(null);
                },
              },
            )
          }
        />
      )}
      {editing && <DayEditor guid={guid} days={doc.days} row={editing.row} name={editing.name} locale={locale} onClose={() => setEditing(null)} />}
      {active && activeField && (
        <ActiveCell
          key={active.slug}
          field={activeField}
          row={row}
          guid={guid}
          tableSlug={TIMESHEETS}
          anchor={active.anchor}
          relations={relations}
          locale={locale}
          language={language}
          onEdit={(next) => edit(active.slug, next)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/** Статус в шапке — пилюля с точкой цвета варианта, как `.tag.round` прототипа. */
function StatusPill({ field, value, language }: { field: Field; value: string; language: string }) {
  const option = optionOf(field, value);
  if (!option) return null;
  const color = hexToChipColor(option.color ?? "");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${CHIP_STYLES[color]}`}>
      <span className={`size-1.5 rounded-full ${CHIP_DOT[color]}`} />
      {localized(option.labels, language, option.label || option.value)}
    </span>
  );
}

/** Комментарий — сразу поле ввода (`.ep-note` прототипа); пишется по уходу фокуса. */
function NoteInput({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() !== value.trim() && onCommit(draft.trim())}
      className="block w-full resize-y rounded-[10px] border border-border bg-surface px-3.5 py-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-fg-muted"
    />
  );
}

/** Стрелка к соседнему табелю; на краю списка — неактивна. */
function NavArrow({ icon, label, to, onOpen }: { icon: LucideIcon; label: string; to: string | undefined; onOpen: (guid: string) => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={!to}
      onClick={() => to && onOpen(to)}
      className="grid size-6 place-items-center rounded-[5px] transition-colors hover:bg-surface-hover hover:text-fg-muted disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon as={icon} size={16} />
    </button>
  );
}
