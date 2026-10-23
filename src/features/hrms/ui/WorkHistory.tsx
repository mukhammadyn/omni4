import { useState } from "react";
import {
  BriefcaseIcon,
  Building2Icon,
  CalendarRangeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  InfoIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { relationDataKey, useItems, type Item } from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Chip, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { JOB_HISTORY, useJobHistory, type Choice, type JobEntry } from "../api/job-history";
import { monthsBetween, toDay, type GradeIssue } from "../model/job-history";
import { formError, FormField, FormItem, FormSection } from "./record-form";
import { TemplateSelect } from "./schedule-parts";

/**
 * Не переносятся в новую запись: её начало, конец и причина — то, чем
 * она и отличается от прежней; `is_current` считает функция.
 */
const FRESH = new Set(["guid", "date_from", "date_to", "change_reason", "is_current", "comment"]);

/**
 * Вкладка «Работа» — `workTab()` прототипа: история назначений лентой,
 * текущая сверху. Вместо таблицы связи — потому что запись здесь
 * читается целиком (должность, отдел, оклад, период), а не по колонкам.
 *
 * Правят и заводят запись модалкой — `posModal` прототипа (JobDialog):
 * поля в его порядке, права — из раскладки таблицы.
 */
export function WorkHistory({
  employee,
  link,
  menuId,
  locale,
  language,
}: {
  employee: string;
  /** Колонка-ссылка на сотрудника — из вкладки связи. */
  link: string;
  menuId: string;
  locale: string;
  language: string;
}) {
  const { t } = useTranslation();
  const job = useJobHistory({ employee, link, menuId, language });
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Item | null>(null);
  const units = useItems(UNITS_TABLE, { limit: 200, page: 1, relations: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { entries } = job;
  const current = entries.find((entry) => entry.current) ?? entries[0];
  const shown = open || !current ? entries : [current];
  const editRow = entries.find((entry) => entry.id === editing)?.row;

  /**
   * Новая запись — копия текущей (или выбранной) без периода и причины:
   * чаще всего меняется одно поле, остальное остаётся как было.
   * Подписи связей едут рядом (`<слаг>_data`), иначе карточка показала бы uuid.
   */
  const startDraft = (source: Item | undefined) => {
    const copy: Item = {};
    for (const field of job.fields) {
      if (FRESH.has(field.slug) || !source || source[field.slug] == null) continue;
      copy[field.slug] = source[field.slug];
      const data = source[relationDataKey(field.slug)];
      if (data) copy[relationDataKey(field.slug)] = data;
    }
    /* Выключенный юнит в новое назначение не переносим: его закрыли, а не выбрали. */
    const off = new Set(units.page.rows.filter((row) => row.is_active === false).map((row) => String(row.guid)));
    if (Array.isArray(copy[UNITS])) copy[UNITS] = copy[UNITS].filter((guid) => !off.has(String(guid)));
    setDraft({ ...copy, [link]: employee, date_from: todayInput() });
  };

  return (
    <section className="rounded-[10px] border border-border bg-surface">
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-4.5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon as={BriefcaseIcon} size={16} className="text-fg-muted" />
            <h3 className="text-base font-semibold">{t("employee.work.title")}</h3>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            {t("employee.work.count", { count: entries.length })}
          </p>
        </div>
        {job.can.write && (
          <Button onClick={() => startDraft(current?.row)}>
            <Icon as={PlusIcon} size={15} />
            {t("employee.work.add")}
          </Button>
        )}
      </div>

      {!entries.length ? (
        <p className="p-6 text-center text-sm text-fg-subtle">
          {job.isLoading ? t("common.loading") : (job.error ?? t("employee.work.empty"))}
        </p>
      ) : (
        /* `.wtl`: линия слева, точка на каждой записи; у текущей — цветная. */
        <div className="relative pt-4.5 pr-4.5 pb-1.5 pl-11 before:absolute before:top-6 before:bottom-7 before:left-6.25 before:border-l-[1.5px] before:border-border-strong">
          {shown.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              locale={locale}
              {...(job.can.update ? { onEdit: () => setEditing(entry.id) } : {})}
              {...(job.can.write ? { onCopy: () => startDraft(entry.row) } : {})}
              {...(job.can.delete ? { onDelete: () => setDeleting(entry.id) } : {})}
            />
          ))}
        </div>
      )}

      {entries.length > 1 && (
        <div className="px-4.5 pb-4">
          <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
            {open ? t("employee.work.hide") : t("employee.work.show", { count: entries.length - 1 })}
            <Icon as={open ? ChevronUpIcon : ChevronDownIcon} size={14} />
          </Button>
        </div>
      )}

      {(editRow || draft) && (
        <JobDialog
          row={editRow ?? draft!}
          creating={!editRow}
          fields={job.fields}
          relations={job.relations}
          locale={locale}
          language={language}
          busy={job.creating || job.saving}
          onSave={(values) => {
            const done = () => {
              setDraft(null);
              setEditing(null);
              toast.success(t(editRow ? "employee.work.saved" : "table.rowCreated"));
            };
            if (editRow) job.save(String(editRow.guid), values, done);
            else job.create(values, done);
          }}
          onClose={() => {
            setDraft(null);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("employee.work.delete")}
          description={t("employee.work.deleteHint")}
          confirmLabel={t("action.delete")}
          busy={false}
          onConfirm={() => {
            job.remove(deleting);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

/** Одна запись ленты — `.wtl-item` с карточкой `.wpos`. */
function Entry({
  entry,
  locale,
  onEdit,
  onCopy,
  onDelete,
}: {
  entry: JobEntry;
  locale: string;
  onEdit?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const from = toDay(entry.from);
  const to = toDay(entry.to);
  const meta = [entry.grade, entry.format, entry.schedule && t("employee.work.schedule", { name: entry.schedule })]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative mb-4.5">
      <span
        className={`absolute top-1.25 -left-6.25 size-3 rounded-full ${
          entry.current
            ? "bg-accent ring-4 ring-accent-subtle"
            : "bg-surface shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]"
        }`}
      />
      <div className="mb-2 flex items-center gap-2 text-[13px] text-fg-muted">
        {[from, to].filter((day): day is Date => Boolean(day)).map((day) => DAY(locale).format(day)).join(" – ")}
        {entry.reason && <Chip color={tone(entry.reason)}>{entry.reason.label}</Chip>}
      </div>

      <div
        className={`rounded-[10px] border px-4 pt-4 pb-3 ${
          entry.current ? "border-border-strong shadow-raised" : "border-border"
        }`}
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10.5 shrink-0 place-items-center rounded-[10px] bg-accent-solid text-accent-fg">
            <Icon as={BriefcaseIcon} size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <div className="flex flex-wrap items-center gap-1.5">
              <b className="mr-1 text-[17px] font-semibold">{entry.position || "—"}</b>
              {entry.current && <Chip color="green">{t("employee.work.current")}</Chip>}
              {entry.employment && <Chip color="blue">{entry.employment.label}</Chip>}
              {entry.issue && entry.issue.kind !== "otherCurrency" && (
                <Chip color="orange">
                  <span className="inline-flex items-center gap-1">
                    <Icon as={TriangleAlertIcon} size={12} />
                    {t("employee.work.offMatrix")}
                  </span>
                </Chip>
              )}
            </div>
            {(entry.department || entry.location) && (
              <div className="text-sm text-fg-muted">
                {[entry.department, entry.location].filter(Boolean).join(" · ")}
              </div>
            )}
            {meta && <div className="text-[13.5px] text-fg-subtle">{meta}</div>}
            {entry.issue &&
              (entry.issue.kind === "otherCurrency" ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-surface-hover px-3 py-2.25 text-[13.5px] leading-[1.45] text-fg-muted">
                  <Icon as={InfoIcon} size={15} className="mt-0.5 shrink-0" />
                  <span>{issueText(entry, entry.issue, locale, t)}</span>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.25 text-[13.5px] leading-[1.45] text-warning">
                  <Icon as={TriangleAlertIcon} size={15} className="mt-0.5 shrink-0" />
                  <span>{issueText(entry, entry.issue, locale, t)}</span>
                </div>
              ))}
          </div>
          {(onEdit || onCopy || onDelete) && (
            <Popover
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label={t("employee.work.menu")}
                  className="grid size-7.5 shrink-0 place-items-center rounded-lg border border-border text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                >
                  <Icon as={EllipsisIcon} size={16} />
                </button>
              )}
            >
              {(close) => (
                <div className="w-57.5">
                  {onEdit && (
                    <PopoverItem icon={<Icon as={PencilIcon} size={15} />} onClick={() => {
                        close();
                        onEdit();
                      }}>
                      {t("employee.work.edit")}
                    </PopoverItem>
                  )}
                  {onCopy && (
                    <PopoverItem icon={<Icon as={CopyIcon} size={15} />} onClick={() => {
                        close();
                        onCopy();
                      }}>
                      {t("employee.work.copy")}
                    </PopoverItem>
                  )}
                  {onDelete && (onEdit || onCopy) && <PopoverSeparator />}
                  {onDelete && (
                    <PopoverItem
                      danger
                      icon={<Icon as={Trash2Icon} size={15} />}
                      onClick={() => {
                        close();
                        onDelete();
                      }}
                    >
                      {t("employee.work.delete")}
                    </PopoverItem>
                  )}
                </div>
              )}
            </Popover>
          )}
        </div>

        <div className="mt-3 ml-14 flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-2.5 max-md:ml-0">
          <span className="inline-flex flex-wrap items-baseline gap-2 text-sm">
            <b className="font-medium">{from ? monthYear(from, locale) : "—"}</b>
            <span className="text-fg-subtle">–</span>
            <b className="font-medium">{to ? monthYear(to, locale) : t("employee.work.now")}</b>
            {from && (
              <span className="text-[13px] text-fg-subtle">
                ({spanText(monthsBetween(from, to ?? new Date()), t)})
              </span>
            )}
          </span>
          {entry.salary !== null && (
            <span className="inline-flex items-center gap-2 text-[19px] font-bold tabular-nums">
              <Icon as={WalletIcon} size={17} className="text-fg-subtle" />
              {new Intl.NumberFormat(locale).format(entry.salary)} {entry.currency}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** «2 г. 10 мес.»; меньше месяца — «0 мес.». Сокращения не склоняются. */
export function spanText(months: number, t: TFunction) {
  const years = Math.floor(months / 12);
  return [
    years ? t("employee.years", { count: years }) : "",
    months % 12 || !years ? t("employee.months", { count: months % 12 }) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function issueText(entry: JobEntry, issue: GradeIssue, locale: string, t: TFunction) {
  switch (issue.kind) {
    case "noGrade":
      return t("employee.work.noGrade", { position: entry.position, grades: issue.allowed.join(", ") });
    case "notAllowed":
      return t("employee.work.notAllowed", { grade: entry.grade, position: entry.position });
    case "otherCurrency":
      return t("employee.work.otherCurrency", { currency: entry.currency });
    case "overCeiling":
      return t("employee.work.overCeiling", {
        salary: new Intl.NumberFormat(locale).format(entry.salary ?? 0),
        grade: entry.grade,
        ceiling: new Intl.NumberFormat(locale).format(issue.ceiling),
      });
  }
}

/** Цвет причины — из варианта; без цвета серый, как чип в таблице. */
function tone(choice: Choice): ChipColor {
  return choice.color ? hexToChipColor(choice.color) : "gray";
}

/** «24.11.2023» — `dmy` прототипа, в порядке частей локали. */
const DAY = (locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * «Ноябрь 2023» — `my` прототипа. Только месяц и год: целиком русская
 * локаль дописывает «г.».
 */
function monthYear(date: Date, locale: string) {
  const text = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
    .formatToParts(date)
    .filter((part) => part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const UNITS_TABLE = "core_business_units";
const UNITS = `${UNITS_TABLE}_ids`;

/*
 * Поля модалки по секциям: что за должность и почему сменилась, где
 * человек работает, сколько получает, с какого по какое. Чего нет
 * в схеме или скрыто правами роли, того и в форме нет; пустая секция
 * не рисуется.
 */
const JOB_SECTIONS = [
  { id: "role", icon: BriefcaseIcon, fields: ["hr_positions_id", "hr_grades_id", "employment_type", "change_reason", "comment"] },
  { id: "place", icon: Building2Icon, fields: ["core_business_units_ids", "hr_departments_id", "hr_locations_id", "hr_work_schedules_id"] },
  { id: "pay", icon: WalletIcon, fields: ["salary", "currency"] },
  { id: "period", icon: CalendarRangeIcon, fields: ["date_from", "date_to"] },
] as const;
const JOB_FIELDS: string[] = JOB_SECTIONS.flatMap((section) => section.fields);
const JOB_WIDE = new Set(["core_business_units_ids", "hr_work_schedules_id", "comment"]);
const JOB_REQUIRED = new Set(["hr_positions_id", "date_from"]);

/** «Добавить / Редактировать должность» — `posModal` прототипа. */
function JobDialog({
  row,
  creating,
  fields,
  relations,
  locale,
  language,
  busy,
  onSave,
  onClose,
}: {
  row: Item;
  creating: boolean;
  fields: Field[];
  relations: Relation[];
  locale: string;
  language: string;
  busy: boolean;
  onSave: (values: Item) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Item>(row);
  const [error, setError] = useState<string | null>(null);
  const bySlug = new Map(fields.map((field) => [field.slug, field]));
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const shown = JOB_FIELDS.flatMap((slug) => bySlug.get(slug) ?? []);

  const submit = () => {
    const required = shown.map((field) => (JOB_REQUIRED.has(field.slug) ? { ...field, required: true } : field));
    const why = formError(required, form, language, t);
    if (why) {
      setError(why);
      return;
    }
    // В запрос — только поля формы; ключи `<слаг>_data` нужны лишь подписям.
    const values: Item = Object.fromEntries(
      Object.entries(form).filter(([key]) => key !== "guid" && !key.endsWith("_data")),
    );
    onSave(values);
  };

  return (
    <Modal onClose={onClose}>
      <form
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="px-5 pt-5">
          <h2 className="text-xl font-semibold">{t(creating ? "employee.work.addTitle" : "employee.work.editTitle")}</h2>
          <p className="mt-0.5 text-[13.5px] text-fg-muted">
            {t(creating ? "employee.work.addHint" : "employee.work.editHint")}
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pt-4">
          {JOB_SECTIONS.map((section) => {
            const own = shown.filter((field) => (section.fields as readonly string[]).includes(field.slug));
            if (!own.length) return null;
            return (
              <FormSection
                key={section.id}
                icon={section.icon}
                title={t(`employee.work.sec.${section.id}`)}
                hint={t(`employee.work.sec.${section.id}Hint`)}
              >
          {own.map((field) =>
            /* График — со сводкой шаблона в каждой строке, а не одним названием. */
            field.slug === "hr_work_schedules_id" && field.editable && !field.locked ? (
              <FormItem key={field.slug} label={localized(field.labels, language, field.label)} wide>
                <TemplateSelect
                  value={typeof form.hr_work_schedules_id === "string" ? form.hr_work_schedules_id : ""}
                  placeholder={t("form.pick")}
                  onChange={(id, name) => {
                    setError(null);
                    setForm((prev) => ({
                      ...prev,
                      hr_work_schedules_id: id,
                      [relationDataKey("hr_work_schedules_id")]: id ? { guid: id, name } : null,
                    }));
                  }}
                />
              </FormItem>
            ) : (
            <FormField
              key={field.slug}
              field={field}
              row={form}
              tableSlug={JOB_HISTORY}
              relations={byId}
              locale={locale}
              language={language}
              creating={creating}
              required={JOB_REQUIRED.has(field.slug) || Boolean(field.required)}
              wide={JOB_WIDE.has(field.slug)}
              dropdown={field.slug === "employment_type" || field.slug === "currency"}
                    rows={field.slug === "comment" ? 2 : 4}
              {...(field.slug === "date_to" ? { placeholder: t("employee.work.toHint") } : {})}
              onChange={(value, extra) => {
                setError(null);
                setForm((prev) => ({ ...prev, [field.slug]: value, ...extra }));
              }}
            />
            ),
          )}
              </FormSection>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("action.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
