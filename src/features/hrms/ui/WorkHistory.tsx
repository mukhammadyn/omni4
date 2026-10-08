import { useState } from "react";
import {
  BriefcaseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ItemDrawer, relationDataKey, rowErrors, type Item } from "@/features/item";
import type { DataLanguage } from "@/features/workspace";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Chip, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { JOB_HISTORY, useJobHistory, type Choice, type JobEntry } from "../api/job-history";
import { monthsBetween, toDay, type GradeIssue } from "../model/job-history";

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
 * Правят и заводят запись карточкой записи (ItemDrawer): поля, их
 * порядок и права — из раскладки таблицы, как везде. Своей формы
 * у вкладки нет, чтобы не было второго способа править те же поля.
 */
export function WorkHistory({
  employee,
  link,
  menuId,
  locale,
  language,
  languages,
  onLanguage,
}: {
  employee: string;
  /** Колонка-ссылка на сотрудника — из вкладки связи. */
  link: string;
  menuId: string;
  locale: string;
  language: string;
  languages: DataLanguage[];
  onLanguage: (code: string) => void;
}) {
  const { t } = useTranslation();
  const job = useJobHistory({ employee, link, menuId, language });
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Item | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { entries } = job;
  const current = entries.find((entry) => entry.current) ?? entries[0];
  const shown = open || !current ? entries : [current];
  const editRow = entries.find((entry) => entry.id === editing)?.row;
  const errors = draft ? rowErrors(job.columns, draft) : new Map();

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
    setShowErrors(false);
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

      {editRow && (
        <ItemDrawer
          tableSlug={JOB_HISTORY}
          columns={job.columns}
          row={editRow}
          relations={job.relations}
          locale={locale}
          language={language}
          languages={languages}
          onLanguage={onLanguage}
          sections={job.sections}
          heading=""
          titlePlaceholder={t("employee.work.entry")}
          {...(job.can.update ? { onEdit: job.edit } : {})}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Новая запись: правки копятся в черновике и уезжают одним
          запросом по кнопке — как черновик строки в таблице. */}
      {draft && (
        <ItemDrawer
          tableSlug={JOB_HISTORY}
          columns={job.columns}
          row={draft}
          relations={job.relations}
          locale={locale}
          language={language}
          languages={languages}
          onLanguage={onLanguage}
          sections={job.sections}
          heading=""
          creating
          titlePlaceholder={t("employee.work.add")}
          onEdit={(_guid, slug, value) =>
            setDraft((prev) => (prev ? { ...prev, [slug]: value } : prev))
          }
          onLink={(slug, item) =>
            setDraft((prev) =>
              prev ? { ...prev, [slug]: item?.guid ?? null, [relationDataKey(slug)]: item } : prev,
            )
          }
          footer={
            <>
              {showErrors && errors.size > 0 && (
                <span className="mr-auto text-xs text-danger">
                  {t("table.fillRequired", { count: errors.size })}
                </span>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("action.cancel")}
              </Button>
              <Button
                disabled={job.creating}
                onClick={() => {
                  if (errors.size) {
                    setShowErrors(true);
                    return;
                  }
                  job.create(draft, () => {
                    setDraft(null);
                    toast.success(t("table.rowCreated"));
                  });
                }}
              >
                {t("action.create")}
              </Button>
            </>
          }
          onClose={() => setDraft(null)}
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
              {entry.issue && (
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
            {entry.issue && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.25 text-[13.5px] leading-[1.45] text-warning">
                <Icon as={TriangleAlertIcon} size={15} className="mt-0.5 shrink-0" />
                <span>{issueText(entry, entry.issue, locale, t)}</span>
              </div>
            )}
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
