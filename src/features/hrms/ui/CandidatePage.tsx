import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  AwardIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CoinsIcon,
  EyeIcon,
  HistoryIcon,
  InfoIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PartyPopperIcon,
  PencilIcon,
  PhoneIcon,
  PrinterIcon,
  RadioIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  TagIcon,
  ThumbsDownIcon,
  Trash2Icon,
  TrophyIcon,
  UserIcon,
  UserPlusIcon,
  UserRoundSearchIcon,
  WalletIcon,
  XCircleIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { ActiveCell, Avatar, Cell, uploadFolder, useFileMeta, useUploadFiles, type Item } from "@/features/item";
import { localized, type Field } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { openPreview } from "@/shared/ui/file-preview";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { useCandidate, useTransferChoices } from "../api/candidate-page";
import { firstText, related, text } from "../api/org";
import { CANDIDATES } from "../api/vacancy-page";
import type { StageStep } from "../model/candidate-steps";
import { plusDays } from "../model/vacancy-dates";
import { blank, Tags as TagsInput } from "./record-form";
import { Score, stageDot, stageText } from "./vacancy-parts";

/* HTML комментариев — тем же редактором; грузится отдельно. */
const RichText = lazy(() => import("@/shared/ui/rich-text").then((m) => ({ default: m.RichText })));

/**
 * Свойства в карточке профиля — `.cd-props` прототипа. Подписи — из
 * схемы; валюта — только в правке: в чтении она приписана к ожиданиям.
 */
const PROPS: [slug: string, icon: LucideIcon][] = [
  ["email", MailIcon],
  ["phone", PhoneIcon],
  ["telegram_username", SendIcon],
  ["hr_candidate_sources_id", RadioIcon],
  ["applied_at", CalendarIcon],
  ["salary_expectation", WalletIcon],
  ["currency", CoinsIcon],
  ["city", MapPinIcon],
  ["experience", AwardIcon],
  ["core_users_id", UserRoundSearchIcon],
  ["tags", TagIcon],
  ["hr_rejection_reasons_id", InfoIcon],
];

/** Плашка исхода — `.cd-fin` прототипа: цвет и значок по статусу. */
const FINISHED: Record<string, { color: ChipColor; icon: LucideIcon }> = {
  hired: { color: "green", icon: PartyPopperIcon },
  rejected: { color: "red", icon: XCircleIcon },
  reserve: { color: "purple", icon: ArchiveIcon },
};

const FIN_TITLE: Record<string, TranslationKey> = {
  hired: "candidate.page.fin.hired",
  rejected: "candidate.page.fin.rejected",
  reserve: "candidate.page.fin.reserve",
};

/**
 * Выход на работу по умолчанию — через две недели после найма, как
 * в прототипе (`#cdHire`). Точную дату правят свойством.
 */
const START_IN = 14;

const card = "rounded-xl bg-surface px-4.5 py-4 ring-1 ring-border ring-inset";

/**
 * Страница кандидата — `candidate.html` прототипа. Слева профиль
 * со свойствами и документы, справа воронка с действиями, оценки
 * и комментарии по этапам, история переходов.
 *
 * «Изменить» включает правку свойств щелчком — тем же редактором, что
 * в таблице (ActiveCell), как на странице сотрудника.
 */
export function CandidatePage({
  guid,
  locale,
  language,
  onOpenVacancy,
  onOpenEmployee,
}: {
  guid: string;
  locale: string;
  language: string;
  onOpenVacancy: (guid: string) => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const candidate = useCandidate(guid);
  const upload = useUploadFiles();
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  /** Раскрытый этап в «Оценке по этапам»; null — текущий по умолчанию. */
  const [open, setOpen] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const stepRefs = useRef(new Map<string, HTMLDivElement>());
  const bySlug = useMemo(() => new Map(candidate.fields.map((f) => [f.slug, f])), [candidate.fields]);
  const relations = useMemo(() => new Map(candidate.relations.map((r) => [r.id, r])), [candidate.relations]);

  const row = candidate.row;
  if (!row) {
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">
        {candidate.isLoading ? t("common.loading") : (candidate.error ?? t("candidate.page.notFound"))}
      </p>
    );
  }

  const status = text(row.status);
  const isActive = status === "active";
  const canEdit = candidate.can.update;
  const steps = candidate.steps;
  const at = steps.findIndex((s) => s.id === text(row.hr_recruiting_stages_id));
  const next = isActive && at >= 0 ? steps[at + 1] : undefined;
  const done = steps.filter((s) => s.done);
  const opened = open ?? (steps[at]?.id || done.at(-1)?.id || "");
  const scores = candidate.evaluations.map((e) => e.score).filter((x): x is number => typeof x === "number");
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const vacancy = related(row, "hr_vacancies_id");
  const name = text(row.full_name) || "—";

  const cell = (field: Field) => (
    <Cell field={field} row={row} tableSlug={CANDIDATES} relations={relations} locale={locale} language={language} wrap />
  );
  const label = (field: Field) => localized(field.labels, language, field.label);

  /** Значение свойства; в правке — щелчок открывает редактор поля, у меток — свой ввод. */
  const value = (field: Field) => {
    if (field.slug === "tags")
      return editing ? (
        <TagsInput
          value={strings(row.tags)}
          placeholder={t("candidate.page.tagsHint")}
          onChange={(next) => candidate.edit("tags", next)}
        />
      ) : (
        <Tags value={row.tags} />
      );
    const shown = blank(row[field.slug]) ? (
      <span className="text-fg-subtle">—</span>
    ) : field.slug === "salary_expectation" ? (
      <span className="flex items-center gap-1">
        {cell(field)} {!editing && text(row.currency)}
      </span>
    ) : (
      cell(field)
    );
    return editing ? (
      <button
        type="button"
        onClick={(event) => setActive({ slug: field.slug, anchor: event.currentTarget.getBoundingClientRect() })}
        className="-mx-1.5 flex min-h-7 w-[calc(100%+12px)] min-w-0 items-center rounded-[5px] bg-input px-1.5 text-left shadow-[inset_0_0_0_1px_var(--color-border-strong)] transition-colors hover:bg-surface-hover"
      >
        {shown}
      </button>
    ) : (
      <div className="flex min-h-7 min-w-0 items-center font-medium">{shown}</div>
    );
  };

  const props = PROPS.filter(([slug]) => {
    if (!bySlug.has(slug)) return false;
    if (editing) return true;
    if (slug === "currency") return false;
    /* Метки и причина — только когда есть, как в прототипе. */
    if (slug === "tags" || slug === "hr_rejection_reasons_id") return !blank(row[slug]);
    return true;
  });

  const resume = text(row.resume);
  const attachments = Array.isArray(row.attachments) ? row.attachments.filter((x): x is string => typeof x === "string") : [];
  const attachmentsField = bySlug.get("attachments");
  const addFiles = (files: File[]) => {
    if (!files.length || !attachmentsField) return;
    upload.mutate(
      { files, folder: uploadFolder(attachmentsField.attributes) },
      { onSuccess: (urls) => candidate.edit("attachments", [...attachments, ...urls]) },
    );
  };

  const openStep = (step: StageStep) => {
    if (step.done) {
      setOpen(step.id);
      requestAnimationFrame(() => stepRefs.current.get(step.id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } else if (isActive && canEdit) {
      candidate.move(step.id);
      setOpen(step.id);
    }
  };

  const fin = FINISHED[status];
  const email = text(row.email);
  const telegram = text(row.telegram_username).replace(/^@/, "");

  return (
    /* `data-print-page`: на бумагу уходит страница без сайдбара и шапки (app/styles.css). */
    <div data-print-page className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pt-3.5 pb-20 max-md:px-3">
        {/* `.cd-top`: имя, уровень, статус; «Изменить» и «Ещё». */}
        <header className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] leading-tight font-bold">{name}</h1>
          {bySlug.get("level") && text(row.level) && <span className="flex">{cell(bySlug.get("level")!)}</span>}
          {bySlug.get("status") && status && <span className="flex">{cell(bySlug.get("status")!)}</span>}
          <span className="flex-1" />
          {canEdit && (
            <Button variant="secondary" className="print:hidden" onClick={() => setEditing(!editing)}>
              <Icon as={editing ? CheckIcon : PencilIcon} size={15} />
              {t(editing ? "candidate.page.done" : "candidate.page.edit")}
            </Button>
          )}
          <Popover
            align="end"
            className="print:hidden"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label={t("candidate.page.more")}
                className="grid size-(--spacing-control) place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <Icon as={MoreHorizontalIcon} size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                {email && (
                  <PopoverItem icon={<Icon as={MailIcon} size={15} />} onClick={() => { close(); window.location.href = `mailto:${email}`; }}>
                    {t("candidate.page.mail")}
                  </PopoverItem>
                )}
                {telegram && (
                  <PopoverItem icon={<Icon as={SendIcon} size={15} />} onClick={() => { close(); window.open(`https://t.me/${telegram}`, "_blank", "noopener"); }}>
                    {t("candidate.page.telegram")}
                  </PopoverItem>
                )}
                {canEdit && status !== "hired" && (
                  <PopoverItem icon={<Icon as={ArrowLeftRightIcon} size={15} />} onClick={() => { close(); setTransferring(true); }}>
                    {t("candidate.page.transfer")}
                  </PopoverItem>
                )}
                {(email || telegram || (canEdit && status !== "hired")) && <PopoverSeparator />}
                <PopoverItem icon={<Icon as={PrinterIcon} size={15} />} onClick={() => { close(); window.print(); }}>
                  {t("candidate.page.print")}
                </PopoverItem>
              </>
            )}
          </Popover>
        </header>

        <div className="grid items-start gap-4.5 min-[900px]:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* `.cd-prof`: фото, имя, вакансия, средний балл, свойства. */}
            <section className={`${card} flex flex-col items-center text-center`}>
              <div className="mb-2.5">
                <Avatar name={name} photo={firstText(row.photo) || undefined} size="2xl" />
              </div>
              <h2 className="text-[19px] font-semibold">{name}</h2>
              {text(vacancy.title) && (
                <button
                  type="button"
                  onClick={() => onOpenVacancy(text(row.hr_vacancies_id))}
                  className="mt-1 inline-flex items-center gap-1.25 text-sm text-accent-text hover:underline"
                >
                  <Icon as={BriefcaseIcon} size={14} />
                  {text(vacancy.title)}
                </button>
              )}
              <div className="mt-2.5 mb-1 flex items-center gap-2">
                <Score value={average === null ? undefined : Math.round(average)} />
                <span className="text-[12.5px] text-fg-subtle">
                  {t("candidate.page.average")}
                  {average !== null && ` · ${average}`}
                </span>
              </div>
              <div className="mt-3 w-full border-t border-border pt-1.5 text-left">
                {props.map(([slug, icon]) => {
                  const field = bySlug.get(slug)!;
                  return (
                    <div key={slug} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2 py-1 text-[13.5px]">
                      <span className="flex min-w-0 items-center gap-1.75 text-fg-muted">
                        <Icon as={icon} size={14} className="shrink-0 text-fg-subtle" />
                        <span className="truncate">{label(field)}</span>
                      </span>
                      {value(field)}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Документы: резюме и прочие файлы (`attachments`). */}
            <section className={card}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-[15px] font-semibold">
                  {t("candidate.page.docs")}{" "}
                  <span className="font-normal text-fg-subtle">{(resume ? 1 : 0) + attachments.length}</span>
                </h3>
              </div>
              {(resume || attachments.length > 0) && (
                <div className="mb-2.5 flex flex-col gap-1.5">
                  {resume && (
                    <Doc url={resume} label={bySlug.get("resume") ? label(bySlug.get("resume")!) : ""} onRemove={canEdit ? () => candidate.edit("resume", null) : undefined} />
                  )}
                  {attachments.map((url, i) => (
                    <Doc
                      key={url}
                      url={url}
                      onRemove={canEdit ? () => candidate.edit("attachments", attachments.filter((_, j) => j !== i)) : undefined}
                    />
                  ))}
                </div>
              )}
              {canEdit && attachmentsField && (
                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    addFiles([...event.dataTransfer.files]);
                  }}
                  className="flex cursor-pointer flex-col items-center gap-0.75 rounded-[9px] print:hidden border-[1.5px] border-dashed border-border-strong p-4.5 text-center text-[13px] text-fg-muted transition-colors hover:border-accent hover:bg-accent-subtle"
                >
                  <Icon as={PaperclipIcon} size={20} className="text-fg-subtle" />
                  <span>{upload.isPending ? t("richText.uploading") : t("candidate.page.drop")}</span>
                  <small className="text-[11.5px] text-fg-subtle">{t("candidate.page.dropHint")}</small>
                  <input
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      addFiles([...(event.target.files ?? [])]);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* `.cd-step`: этапы воронки вакансии кружками и действия. */}
            <section className={card}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold">{t("candidate.page.funnel")}</h3>
                <span className="flex-1" />
                {steps[at] && (
                  <span className="text-sm text-fg-subtle">
                    {t("candidate.page.current")}: <b className="font-semibold text-fg">{steps[at].name}</b>
                  </span>
                )}
              </div>

              {steps.length ? (
                <div className="flex items-start overflow-x-auto px-0.5 pt-1.5 pb-3">
                  {steps.map((step, i) => (
                    <div key={step.id} className="flex items-start">
                      {i > 0 && (
                        <i className={`mt-4.25 h-0.5 w-6.5 shrink-0 rounded-full ${i <= at || status === "hired" ? "bg-accent" : "bg-border-strong"}`} />
                      )}
                      <button
                        type="button"
                        title={step.name}
                        onClick={() => openStep(step)}
                        className={`group flex w-26 shrink-0 flex-col items-center gap-1.25 text-center ${stageText(step.color)}`}
                      >
                        <span
                          className={`grid size-8.5 place-items-center rounded-full text-[12.5px] font-bold transition-transform group-hover:scale-105 ${
                            step.done
                              ? `${stageDot(step.color)} text-accent-fg`
                              : "bg-surface text-fg-subtle ring-[1.5px] ring-border-strong ring-inset"
                          } ${step.current ? "ring-4 ring-current/20" : ""}`}
                        >
                          {!step.done ? i + 1 : step.score !== undefined ? Math.round(step.score) : "–"}
                        </span>
                        <small
                          className={`line-clamp-2 max-w-25 text-[11.5px] leading-tight ${
                            step.current ? "font-semibold text-fg" : step.done ? "text-fg-muted" : "text-fg-subtle"
                          }`}
                        >
                          {step.name}
                        </small>
                        {step.done && step.score !== undefined && (
                          <em className="text-[11px] font-semibold text-success not-italic">{step.score}/10</em>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-sm text-fg-subtle">{t("vacancy.page.noStages")}</p>
              )}

              {isActive && canEdit ? (
                <div className="print:hidden">
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {steps.length > 0 && (
                      <Popover
                        className="w-62.5"
                        trigger={({ open: shown, toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-expanded={shown}
                            className="flex h-8.5 w-full items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
                          >
                            {steps[at] && <i className={`size-2 shrink-0 rounded-full ${stageDot(steps[at].color)}`} />}
                            <span className="flex-1 truncate">{steps[at]?.name ?? "—"}</span>
                            <Icon as={ChevronDownIcon} size={14} className="text-fg-subtle" />
                          </button>
                        )}
                      >
                        {(close) =>
                          steps.map((step) => (
                            <PopoverItem
                              key={step.id}
                              icon={<i className={`size-2 rounded-full ${stageDot(step.color)}`} />}
                              onClick={() => {
                                close();
                                if (!step.current) {
                                  candidate.move(step.id);
                                  setOpen(step.id);
                                }
                              }}
                              {...(step.current ? { trailing: <Icon as={CheckIcon} size={14} /> } : {})}
                            >
                              {step.name}
                            </PopoverItem>
                          ))
                        }
                      </Popover>
                    )}
                    {next && (
                      <Button className="h-8.5" onClick={() => openStep({ ...next, done: false })}>
                        {next.name}
                        <Icon as={ArrowRightIcon} size={15} />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-8.5 border-success/40 text-success hover:bg-success-subtle"
                      onClick={() => candidate.finish("hired", { hired_at: todayInput(), start_date: plusDays(todayInput(), START_IN) })}
                    >
                      <Icon as={TrophyIcon} size={15} />
                      {t("candidate.page.hire")}
                    </Button>
                    <ReasonMenu
                      title={t("candidate.page.reason")}
                      reasons={candidate.reasons}
                      onPick={(reason) =>
                        candidate.finish("rejected", { hr_rejection_reasons_id: reason?.id ?? null }, reason?.name)
                      }
                    >
                      {(toggle) => (
                        <Button variant="danger" className="h-8.5" onClick={toggle}>
                          <Icon as={ThumbsDownIcon} size={15} />
                          {t("candidate.page.reject")}
                        </Button>
                      )}
                    </ReasonMenu>
                    <ReasonMenu
                      title={t("candidate.page.reserveReason")}
                      reasons={candidate.reasons}
                      onPick={(reason) =>
                        candidate.finish("reserve", { hr_rejection_reasons_id: reason?.id ?? null }, reason?.name)
                      }
                    >
                      {(toggle) => (
                        <Button variant="secondary" className="h-8.5" onClick={toggle}>
                          <Icon as={ArchiveIcon} size={15} />
                          {t("candidate.page.reserve")}
                        </Button>
                      )}
                    </ReasonMenu>
                  </div>
                </div>
              ) : (
                fin && (
                  <div className={`mt-2.5 flex flex-wrap items-center gap-3 rounded-[10px] px-3.5 py-3 ${CHIP_STYLES[fin.color]}`}>
                    <Icon as={fin.icon} size={22} />
                    <div className="min-w-0">
                      <b className="block font-semibold text-fg">{t(FIN_TITLE[status] ?? "candidate.page.fin.hired")}</b>
                      <small className="text-fg-muted">
                        {status === "hired"
                          ? text(row.start_date) &&
                            t("vacancy.page.startsAt", { date: formatDate(text(row.start_date), "date", locale) })
                          : text(related(row, "hr_rejection_reasons_id").name)}
                      </small>
                    </div>
                    <span className="flex-1" />
                    {status === "hired" &&
                      (candidate.employee ? (
                        <Button variant="secondary" className="print:hidden" onClick={() => onOpenEmployee(candidate.employee)}>
                          <Icon as={UserIcon} size={15} />
                          {t("candidate.page.openEmployee")}
                        </Button>
                      ) : (
                        candidate.canCreateEmployee && (
                          <Button
                            variant="secondary"
                            className="print:hidden"
                            disabled={candidate.creatingEmployee}
                            onClick={() => candidate.createEmployee(onOpenEmployee)}
                          >
                            <Icon as={UserPlusIcon} size={15} />
                            {t("candidate.page.createEmployee")}
                          </Button>
                        )
                      ))}
                    {status !== "hired" && canEdit && (
                      <Button variant="secondary" className="print:hidden" onClick={() => candidate.restore()}>
                        <Icon as={RotateCcwIcon} size={15} />
                        {t("vacancy.page.restore")}
                      </Button>
                    )}
                  </div>
                )
              )}
            </section>

            {/* `.cd-acc`: пройденные этапы — оценка и комментарии. */}
            <section className={card}>
              <h3 className="mb-3 text-[15px] font-semibold">
                {t("candidate.page.evaluation")}{" "}
                <span className="font-normal text-fg-subtle">
                  · {t("candidate.page.ofStages", { done: done.length, total: steps.length })}
                </span>
              </h3>
              <div className="flex flex-col gap-2">
                {done.map((step) => {
                  const notes = candidate.evaluations.filter(
                    (e) => text(e.hr_recruiting_stages_id) === step.id && text(e.comment),
                  );
                  const mine = candidate.evaluations.find(
                    (e) =>
                      text(e.hr_recruiting_stages_id) === step.id &&
                      typeof e.score === "number" &&
                      text(e.core_users_id) === (candidate.me ?? ""),
                  )?.score as number | undefined;
                  const isOpen = opened === step.id;
                  return (
                    <div
                      key={step.id}
                      ref={(node) => {
                        if (node) stepRefs.current.set(step.id, node);
                        else stepRefs.current.delete(step.id);
                      }}
                      className={`rounded-[10px] ring-inset ${
                        step.current && isActive ? "ring-[1.5px] ring-accent/45" : isOpen ? "ring-1 ring-border-strong" : "ring-1 ring-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? "-" : step.id)}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                      >
                        <i className={`size-2.25 shrink-0 rounded-full ${stageDot(step.color)}`} />
                        <div className="min-w-0">
                          <b className="text-sm font-semibold">
                            {step.name}
                            {step.current && isActive && (
                              <span className="ml-1.5 rounded-[4px] bg-accent-subtle px-1.5 py-0.5 align-[1px] text-[10.5px] font-bold tracking-[0.04em] text-accent-text uppercase">
                                {t("candidate.page.currentBadge")}
                              </span>
                            )}
                          </b>
                          {step.since && (
                            <small className="block text-xs text-fg-subtle">
                              {t("candidate.page.since", { date: formatDate(step.since, "date", locale) })}
                            </small>
                          )}
                        </div>
                        <span className="flex-1" />
                        <span className="inline-flex items-center gap-0.75 text-xs text-fg-subtle">
                          <Icon as={MessageSquareIcon} size={13} />
                          {notes.length}
                        </span>
                        <Score value={step.score === undefined ? undefined : Math.round(step.score)} />
                        <Icon as={ChevronDownIcon} size={16} className={`text-fg-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isOpen && (
                        <div className="border-t border-border px-4 pt-1 pb-4">
                          {candidate.canEvaluate && (
                            <div className="print:hidden">
                              <label className="mt-3 mb-2 block text-[13px] text-fg-muted">{t("candidate.page.stageScore")}</label>
                              <div className="flex flex-wrap gap-1.5">
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => candidate.score(step.id, n)}
                                    className={`size-9.5 rounded-lg font-semibold tabular-nums transition-colors ${
                                      mine === n
                                        ? CHIP_STYLES[n >= 8 ? "green" : n >= 6 ? "yellow" : "red"]
                                        : "ring-1 ring-border-strong ring-inset hover:bg-surface-hover"
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <label className="mt-3 mb-2 block text-[13px] text-fg-muted">{t("candidate.page.comments")}</label>
                          {notes.map((note) => {
                            const author = text(related(note, "core_users_id").full_name);
                            return (
                              <div key={text(note.guid)} className="flex gap-2.5 py-2">
                                <Avatar name={author || "?"} photo={firstText(related(note, "core_users_id").photo) || undefined} />
                                <div className="min-w-0 flex-1">
                                  <b className="text-[13px] font-semibold">{author || "—"}</b>
                                  <small className="ml-1.5 text-xs text-fg-subtle">
                                    {formatDate(text(note.created_at), "date", locale)}
                                  </small>
                                  <Suspense fallback={null}>
                                    <RichText value={text(note.comment)} readOnly />
                                  </Suspense>
                                </div>
                              </div>
                            );
                          })}
                          {candidate.canEvaluate && (
                            <CommentBox placeholder={t("candidate.page.commentHint")} onSend={(html) => candidate.comment(step.id, html)} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!done.length && <span className="text-sm text-fg-subtle">{t("vacancy.page.noneYet")}</span>}
              </div>
            </section>

            {/* `.cd-hist`: переходы по воронке, свёрнуто. */}
            <section className={`${card} p-0!`}>
              <button
                type="button"
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex w-full items-center gap-2 px-4.5 py-3.5 text-left"
              >
                <Icon as={HistoryIcon} size={15} className="text-fg-subtle" />
                <h3 className="text-[15px] font-semibold">
                  {t("candidate.page.history")}{" "}
                  <span className="font-normal text-fg-subtle">· {candidate.history.length + 1}</span>
                </h3>
                <span className="flex-1" />
                <Icon as={ChevronDownIcon} size={15} className={`text-fg-subtle transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              {historyOpen && (
                <ol className="flex flex-col gap-3 px-4.5 pb-4">
                  {candidate.history.map((entry) => (
                    <HistoryEntry
                      key={text(entry.guid)}
                      icon={entryIcon(entry)}
                      who={text(related(entry, "core_users_id").full_name)}
                      when={formatDate(text(entry.moved_at), "date", locale) ?? ""}
                    >
                      {entryText(entry, t)}
                      {text(entry.comment) && <span className="text-fg-muted">: {text(entry.comment)}</span>}
                    </HistoryEntry>
                  ))}
                  <HistoryEntry icon={UserPlusIcon} when={formatDate(text(row.applied_at), "date", locale) ?? ""}>
                    {[t("candidate.page.hist.applied"), text(related(row, "hr_candidate_sources_id").name)].filter(Boolean).join(" · ")}
                  </HistoryEntry>
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>

      {transferring && (
        <TransferDialog
          current={text(row.hr_vacancies_id)}
          onPick={(vacancy) => {
            setTransferring(false);
            candidate.transfer(vacancy.id, vacancy.stage, t("candidate.page.transferredFrom", { title: text(vacancy.title) }));
          }}
          onClose={() => setTransferring(false)}
        />
      )}

      {active && bySlug.get(active.slug) && (
        <ActiveCell
          key={active.slug}
          field={bySlug.get(active.slug)!}
          row={row}
          guid={guid}
          tableSlug={CANDIDATES}
          anchor={active.anchor}
          relations={relations}
          locale={locale}
          language={language}
          onEdit={(next) => candidate.edit(active.slug, next)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/** Метки — MULTISELECT без вариантов: ячейка поля их не рисует, поэтому плашками. */
function Tags({ value }: { value: unknown }) {
  const tags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className={`inline-flex h-5 items-center rounded-[4px] px-1.5 text-xs ${CHIP_STYLES.gray}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

/** Цвет значка файла по расширению — `.cd-fi` прототипа. */
const EXT_COLOR: Record<string, ChipColor> = { pdf: "red", zip: "yellow", rar: "yellow", doc: "blue", docx: "blue" };

/** Файл кандидата — `.cd-doc`: расширение плашкой, имя, просмотр и удаление. */
function Doc({ url, label, onRemove }: { url: string; label?: string; onRemove?: (() => void) | undefined }) {
  const { t, i18n } = useTranslation();
  const meta = useFileMeta(url);
  /* Хранилище кладёт файл как «<uuid>_имя»: приставка — его, не человека. */
  const name = decodeURIComponent(url.split("/").pop() ?? url).replace(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_/i, "");
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase().slice(0, 4) : "";
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-border ring-inset">
      <span className={`grid h-9 w-8 shrink-0 place-items-center rounded-[5px] text-[9.5px] font-bold uppercase ${CHIP_STYLES[EXT_COLOR[ext] ?? "gray"]}`}>
        {ext || "file"}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[13px] font-medium">{name}</b>
        <small className="text-[11.5px] text-fg-subtle">
          {[label, meta?.size ? fileSize(meta.size, i18n.language) : "", meta?.modified ? formatDate(meta.modified, "date", i18n.language) : ""]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
      <button
        type="button"
        onClick={() => openPreview([url])}
        aria-label={t("candidate.page.open")}
        className="grid size-7 place-items-center rounded-md text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100"
      >
        <Icon as={EyeIcon} size={14} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("action.delete")}
          className="grid size-7 place-items-center rounded-md text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface-hover hover:text-danger focus-visible:opacity-100 print:hidden"
        >
          <Icon as={Trash2Icon} size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Поле комментария к этапу — `.cd-ed`: редактор с панелью и кнопка
 * отправки. После отправки редактор пересоздаётся пустым (`key`):
 * значение tiptap читает только при создании.
 */
function CommentBox({ placeholder, onSend }: { placeholder: string; onSend: (html: string) => void }) {
  const { t } = useTranslation();
  const [html, setHtml] = useState("");
  const [round, setRound] = useState(0);
  return (
    <div className="relative mt-1 rounded-[9px] ring-1 ring-border-strong ring-inset print:hidden">
      <Suspense fallback={null}>
        <RichText key={round} value="" placeholder={placeholder} onChange={setHtml} />
      </Suspense>
      <Button
        className="absolute right-2.5 bottom-2.5 size-9.5 px-0"
        disabled={!html}
        aria-label={t("candidate.page.send")}
        onClick={() => {
          onSend(html);
          setHtml("");
          setRound(round + 1);
        }}
      >
        <Icon as={SendIcon} size={16} />
      </Button>
    </div>
  );
}

function HistoryEntry({ icon, who, when, children }: { icon: LucideIcon; who?: string; when: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <Icon as={icon} size={14} className="mt-0.75 shrink-0 text-fg-subtle" />
      <div className="min-w-0">
        {children}
        <small className="block text-xs text-fg-subtle">{[when, who].filter(Boolean).join(" · ")}</small>
      </div>
    </li>
  );
}

const entryIcon = (entry: Item): LucideIcon =>
  text(entry.hr_recruiting_stages_id)
    ? text(entry.hr_recruiting_stages_id_2)
      ? ArrowRightIcon
      : RotateCcwIcon
    : entry.status === "hired"
    ? PartyPopperIcon
    : entry.status === "rejected"
      ? XIcon
      : entry.status === "reserve"
        ? ArchiveIcon
        : text(entry.hr_recruiting_stages_id_2)
          ? ArrowRightIcon
          : RotateCcwIcon;

/** Исход словами — по статусу после перехода. */
const OUTCOME: Record<string, TranslationKey> = {
  hired: "candidate.page.hist.hired",
  rejected: "candidate.page.hist.rejected",
  reserve: "candidate.page.hist.reserve",
};

/**
 * Запись истории словами. Пустое «на этап» — выход из воронки, и слова
 * — по статусу (нанят, отказ, резерв). Пустое «с этапа» — вход в
 * воронку: так пишут и новый кандидат, и возврат из отказа. Остальное
 * — переход; статус у переноса вакансии может быть и «резерв».
 */
function entryText(entry: Item, t: TFunction) {
  const outcome = OUTCOME[text(entry.status)];
  if (outcome && !text(entry.hr_recruiting_stages_id)) return t(outcome);
  const stage = text(related(entry, "hr_recruiting_stages_id").name);
  return t(text(entry.hr_recruiting_stages_id_2) ? "candidate.page.hist.moved" : "candidate.page.hist.entered", { stage });
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];

/** «248 КБ», «1,2 МБ» — как у документов в прототипе; единицы — словами языка. */
function fileSize(bytes: number, locale: string) {
  const kb = bytes / 1024;
  const mb = kb >= 1024;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: mb ? "megabyte" : "kilobyte",
    maximumFractionDigits: mb ? 1 : 0,
  }).format(mb ? kb / 1024 : Math.max(1, kb));
}

/**
 * Причина отказа или резерва — меню под кнопкой: активные причины
 * справочника и «Без причины». Одна на обе кнопки: поле у кандидата
 * общее («Причина отказа / резерва»).
 */
function ReasonMenu({
  title,
  reasons,
  onPick,
  children,
}: {
  title: string;
  reasons: Item[];
  onPick: (reason: { id: string; name: string } | null) => void;
  children: (toggle: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Popover trigger={({ toggle }) => children(toggle)}>
      {(close) => (
        <>
          <div className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-fg-muted">{title}</div>
          {reasons.map((reason) => (
            <PopoverItem
              key={text(reason.guid)}
              onClick={() => {
                close();
                onPick({ id: text(reason.guid), name: text(reason.name) });
              }}
            >
              {text(reason.name)}
            </PopoverItem>
          ))}
          <PopoverItem
            icon={<Icon as={XIcon} size={15} />}
            onClick={() => {
              close();
              onPick(null);
            }}
          >
            {t("candidate.page.noReason")}
          </PopoverItem>
        </>
      )}
    </Popover>
  );
}

/** «Перенести на другую вакансию»: поиск и список открытых вакансий. */
function TransferDialog({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (vacancy: { id: string; title: string; stage: string | null }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { choices, loading } = useTransferChoices(true, current);
  const shown = choices.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <h2 className="mb-2.5 font-semibold">{t("candidate.page.transfer")}</h2>
          <label className="flex h-8 items-center gap-2 rounded-md border border-border-strong px-2.5 text-sm focus-within:border-accent">
            <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("candidate.page.transferSearch")}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
            />
          </label>
        </div>
        <div className="overflow-auto p-1.5">
          {loading ? (
            <p className="py-6 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
          ) : shown.length ? (
            shown.map((choice) => (
              <PopoverItem key={choice.id} icon={<Icon as={BriefcaseIcon} size={15} />} onClick={() => onPick(choice)}>
                {choice.title || "—"}
              </PopoverItem>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-fg-subtle">{t("candidate.page.transferNone")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
