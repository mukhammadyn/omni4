import { lazy, Suspense, useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlarmClockIcon,
  AwardIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  Columns3Icon,
  HouseIcon,
  InfoIcon,
  ListChecksIcon,
  MapPinIcon,
  MegaphoneIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  UserCheckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar, Cell, type Item } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { firstText, related, text } from "../api/org";
import { VACANCIES } from "../api/vacancy";
import { CANDIDATES, useVacancy, type StageColumn } from "../api/vacancy-page";
import { daysBetween, daysOpen } from "../model/vacancy-dates";
import { Card, Meta, SideProp } from "./page-parts";
import { VacancyForm } from "./VacancyForm";
import { DeadlineBadge, Score, num, salaryText, stageDot, stageText } from "./vacancy-parts";

/* HTML описания — тем же редактором, только для чтения; грузится отдельно. */
const RichText = lazy(() => import("@/shared/ui/rich-text").then((m) => ({ default: m.RichText })));

export type VacancyTab = "funnel" | "cands" | "info" | "edit";

/*
 * Карточки «Информации» сбоку — `vi-side` прототипа. Поля — слагами
 * схемы ERP; чего в схеме нет или роли не видно, того и в карточке нет.
 */
const SIDE: { icon: LucideIcon; title: TranslationKey; slugs: string[] }[] = [
  { icon: BriefcaseIcon, title: "vacancy.page.card.position", slugs: ["title", "positions_id", "level", "headcount"] },
  { icon: UsersIcon, title: "vacancy.page.card.team", slugs: ["employees_id", "employees_id_2"] },
  {
    icon: WalletIcon,
    title: "vacancy.page.card.terms",
    slugs: ["locations_id", "work_format", "employment_type", "salary_from", "salary_to", "currency", "show_salary"],
  },
  {
    icon: CalendarIcon,
    title: "vacancy.page.card.dates",
    slugs: ["opened_at", "deadline", "desired_start_date", "closed_at"],
  },
  { icon: AwardIcon, title: "vacancy.page.card.reqs", slugs: ["experience", "languages", "skills"] },
  { icon: MegaphoneIcon, title: "vacancy.page.card.pub", slugs: ["channels", "is_published"] },
];

/** Тексты объявления — левая колонка «Информации». */
const TEXTS = ["description", "duties", "requirements", "conditions"];

/**
 * Страница вакансии — `vacancy.html` прототипа: шапка с ходом найма
 * и вкладки «Воронка» (кандидаты по этапам, перетаскиванием), «Кандидаты»
 * (таблица) и «Информация» (поля вакансии).
 *
 * «Редактировать» — отдельная форма по секциям, как `edit()` прототипа
 * (VacancyForm): вкладка `edit`, без шапки.
 */
export function VacancyPage({
  guid,
  tab,
  locale,
  language,
  onTab,
  onAddCandidate,
}: {
  guid: string;
  tab: VacancyTab;
  locale: string;
  language: string;
  onTab: (tab: VacancyTab) => void;
  /** «+ Кандидат» — страница нового кандидата с этой вакансией. */
  onAddCandidate: () => void;
}) {
  const { t } = useTranslation();
  const vacancy = useVacancy(guid);
  /* Поиск кандидатов — в строке вкладок, как `.vt-search` прототипа. */
  const [query, setQuery] = useState("");
  const bySlug = useMemo(() => new Map(vacancy.fields.map((f) => [f.slug, f])), [vacancy.fields]);
  const relations = useMemo(() => new Map(vacancy.relations.map((r) => [r.id, r])), [vacancy.relations]);

  const row = vacancy.row;
  if (!row) {
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">
        {vacancy.isLoading ? t("common.loading") : (vacancy.error ?? t("vacancy.page.notFound"))}
      </p>
    );
  }

  const today = todayInput();
  const label = (field: Field) => localized(field.labels, language, field.label);
  const option = (slug: string) => {
    const field = bySlug.get(slug);
    const found = field && optionOf(field, text(row[slug]));
    return found ? localized(found.labels, language, found.label || found.value) : text(row[slug]);
  };
  const cell = (field: Field, values: Item = row) => (
    <Cell field={field} row={values} tableSlug={VACANCIES} relations={relations} locale={locale} language={language} wrap />
  );
  const value = (field: Field) => <div className="flex min-h-7 min-w-0 items-center">{cell(field)}</div>;
  const fieldsOf = (slugs: string[]) =>
    slugs.map((slug) => bySlug.get(slug)).filter((field): field is Field => Boolean(field));

  const status = bySlug.get("status");
  const priority = bySlug.get("priority");
  const hired = vacancy.candidates.filter((c) => c.status === "hired").length;
  const headcount = num(row.headcount) ?? 0;
  const opened = daysOpen(text(row.opened_at), text(row.closed_at), today);
  const team = [
    { slug: "employees_id", role: t("vacancy.page.recruiter") },
    { slug: "employees_id_2", role: t("vacancy.page.manager") },
  ]
    .map(({ slug, role }) => ({ role, person: related(row, slug) }))
    .filter(({ person }) => text(person.full_name));

  /* Свой key: иначе React переиспользует прокручиваемый узел, и форма
     с вкладкой открываются на чужой прокрутке. */
  /* Без права на правку форма не открывается и по ссылке `?tab=edit`. */
  if (tab === "edit" && vacancy.can.update)
    return (
      <div key="edit" className="min-h-0 flex-1 overflow-auto">
        <div className="px-6 max-md:px-3">
          <VacancyForm
            row={row}
            fields={vacancy.fields}
            relations={relations}
            locale={locale}
            language={language}
            onSave={(values) => {
              vacancy.save(values);
              onTab("info");
            }}
            onClose={() => onTab("info")}
          />
        </div>
      </div>
    );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pb-20 max-md:px-3">
        {/* `.vc-head` прототипа. */}
        <header className="flex flex-wrap items-start gap-3.5 pt-5 pb-5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${CHIP_STYLES.blue}`}>
            <Icon as={BriefcaseIcon} size={20} />
          </span>

          <div className="min-w-60 flex-1">
            <h1 className="mb-1 flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold tracking-[-0.01em]">
              {text(row.title) || "—"}
              {priority && text(row.priority) && <span className="flex text-sm font-normal">{cell(priority)}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted">
              <Meta icon={NetworkIcon} text={text(related(row, "departments_id").name)} />
              <Meta icon={MapPinIcon} text={text(related(row, "locations_id").name)} />
              <Meta icon={HouseIcon} text={option("work_format")} />
              <Meta icon={CalendarIcon} text={opened === null ? "" : t("vacancy.openFor", { count: opened })} />
              <Meta icon={WalletIcon} text={salaryText(row, locale, t) ?? t("vacancy.salaryNegotiable")} />
            </div>

            {/* `.vc-prog`: ход найма, дедлайн, команда. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px]">
              <span
                className={`inline-flex items-center gap-1.5 text-success ${headcount && hired >= headcount ? "font-semibold" : "font-medium"}`}
              >
                <Icon as={UserCheckIcon} size={14} />
                {t("vacancy.hiredOf", { hired, total: headcount })}
              </span>
              <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-hover">
                <i
                  className="block h-full rounded-full bg-success"
                  style={{ width: `${headcount ? Math.min(100, (hired / headcount) * 100) : 0}%` }}
                />
              </span>
              {text(row.deadline) && (
                <span className="inline-flex items-center gap-1.5 text-fg-subtle">
                  <Icon as={AlarmClockIcon} size={14} />
                  {t("vacancy.page.deadline", { date: formatDate(text(row.deadline), "date", locale) })}
                  <DeadlineBadge row={row} today={today} short />
                </span>
              )}
              {team.map(({ role, person }) => (
                <span key={role} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                  <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} size="sm" />
                  {role}: <b className="font-medium text-fg">{text(person.full_name)}</b>
                </span>
              ))}
            </div>
          </div>

          {/* `.vc-act`: статус выбором, «Редактировать», «+ Кандидат». */}
          <div className="flex items-center gap-2">
            {status && vacancy.can.update && (
              <Popover
                align="end"
                trigger={({ open, toggle }) => <StatusButton field={status} value={text(row.status)} language={language} open={open} onClick={toggle} />}
              >
                {(close) =>
                  [...status.options.values()].map((opt) => (
                    <PopoverItem
                      key={opt.value}
                      onClick={() => {
                        vacancy.edit("status", opt.value);
                        close();
                      }}
                      {...(opt.value === text(row.status)
                        ? { trailing: <Icon as={CheckIcon} size={14} className="shrink-0" /> }
                        : {})}
                    >
                      {cell(status, { status: opt.value })}
                    </PopoverItem>
                  ))
                }
              </Popover>
            )}
            {vacancy.can.update && (
              <Button variant="secondary" onClick={() => onTab("edit")}>
                <Icon as={PencilIcon} size={15} />
                {t("vacancy.page.edit")}
              </Button>
            )}
            {vacancy.canAdd && (
              <Button onClick={onAddCandidate}>
                <Icon as={PlusIcon} size={15} />
                {t("vacancy.page.addCandidate")}
              </Button>
            )}
          </div>
        </header>

        <div className="mb-4 flex items-center gap-3 border-b border-border">
          <Tabs
            activeId={tab}
            onSelect={(id) => onTab(id as VacancyTab)}
            tabs={[
              { id: "funnel", label: t("vacancy.page.tab.funnel"), icon: Columns3Icon },
              {
                id: "cands",
                label: `${t("vacancy.page.tab.cands")} · ${vacancy.candidates.length}`,
                icon: UsersIcon,
              },
              { id: "info", label: t("vacancy.page.tab.info"), icon: InfoIcon },
            ]}
          />
          {tab === "cands" && (
            <label className="ml-auto flex h-7.5 w-64 items-center gap-2 rounded-md border border-border-strong px-2.5 text-sm transition-colors focus-within:border-accent">
              <Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("vacancy.page.search")}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
              />
            </label>
          )}
        </div>

        {tab === "funnel" ? (
          <Funnel
            scores={vacancy.scores}
            columns={vacancy.columns}
            finished={vacancy.finished}
            candidateFields={vacancy.candidateFields}
            loading={vacancy.candidatesLoading}
            canMove={vacancy.canMove}
            locale={locale}
            language={language}
            today={today}
            onMove={vacancy.moveCandidate}
            onRestore={vacancy.restoreCandidate}
          />
        ) : tab === "cands" ? (
          <Candidates
            query={query}
            scores={vacancy.scores}
            candidates={vacancy.candidates}
            columns={vacancy.columns}
            candidateFields={vacancy.candidateFields}
            locale={locale}
            language={language}
          />
        ) : (
          /* `.vi-grid`: тексты слева, свойства справа; узко — столбиком. */
          <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              {fieldsOf(TEXTS).map((field) => (
                <Card key={field.id} icon={InfoIcon} title={label(field)}>
                  {text(row[field.slug]) ? (
                    <Suspense fallback={null}>
                      <RichText value={text(row[field.slug])} readOnly />
                    </Suspense>
                  ) : (
                    <span className="text-sm text-fg-subtle">—</span>
                  )}
                </Card>
              ))}
              <Card icon={ListChecksIcon} title={t("vacancy.page.stages")}>
                {bySlug.get("hr_recruiting_pipelines_id") && (
                  <div className="mb-2">{value(bySlug.get("hr_recruiting_pipelines_id")!)}</div>
                )}
                <ol className="flex flex-col gap-1.5 text-sm">
                  {vacancy.columns.map((column, at) => (
                    <li key={column.id} className="flex items-center gap-2">
                      <span className="w-4 text-right text-xs text-fg-subtle tabular-nums">{at + 1}</span>
                      <i className={`size-2 rounded-full ${stageDot(column.color)}`} />
                      {column.name}
                      {column.candidates.length > 0 && (
                        <span className="text-xs text-fg-subtle">{column.candidates.length}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <aside>
              {SIDE.map((card) => {
                const fields = fieldsOf(card.slugs);
                if (!fields.length) return null;
                return (
                  <Card key={card.title} icon={card.icon} title={t(card.title)}>
                    <div className="flex flex-col gap-3 pt-1">
                      {fields.map((field) => (
                        <SideProp key={field.id} label={label(field)}>
                          {value(field)}
                        </SideProp>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </aside>
          </div>
        )}
      </div>

    </div>
  );
}

const NO_RELATIONS = new Map();

/** Чип варианта поля кандидата (уровень, статус) — та же ячейка, что в таблице. */
function CandidateCell({
  fields,
  slug,
  row,
  locale,
  language,
}: {
  fields: Field[];
  slug: string;
  row: Item;
  locale: string;
  language: string;
}) {
  const field = fields.find((f) => f.slug === slug);
  if (!field || !text(row[slug])) return null;
  return (
    <Cell field={field} row={row} tableSlug={CANDIDATES} relations={NO_RELATIONS} locale={locale} language={language} />
  );
}

/**
 * «Воронка» — `funnel()` прототипа: колонка на этап, в ней активные
 * кандидаты; перетаскивание меняет этап. Ниже — «Завершённые»: нанятые,
 * отказы и резерв, с возвратом в воронку.
 */
function Funnel({
  scores,
  columns,
  finished,
  candidateFields,
  loading,
  canMove,
  locale,
  language,
  today,
  onMove,
  onRestore,
}: {
  scores: Map<string, number>;
  columns: StageColumn[];
  finished: Item[];
  candidateFields: Field[];
  loading: boolean;
  canMove: boolean;
  locale: string;
  language: string;
  today: string;
  onMove: (candidate: Item, stage: string) => void;
  onRestore: (candidate: Item) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  if (loading) return <p className="py-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;
  if (!columns.length) return <p className="py-8 text-center text-sm text-fg-subtle">{t("vacancy.page.noStages")}</p>;

  const drop = (stage: string) => (event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/plain");
    const from = columns.find((c) => c.candidates.some((x) => text(x.guid) === id));
    const candidate = from?.candidates.find((x) => text(x.guid) === id);
    if (candidate && from && from.id !== stage) onMove(candidate, stage);
  };
  const levelOf = (c: Item) => optionLabel(candidateFields, "level", c, language);
  /* Метки — MULTISELECT без списка вариантов: ячейка поля их не рисует,
     поэтому плашками здесь, как `.tag.gray` прототипа. */
  const tagsOf = (c: Item) => (Array.isArray(c.tags) ? c.tags.filter((tag): tag is string => typeof tag === "string") : []);

  return (
    <>
      {/* `.fn-board`: колонки по 272px, не влезли — прокрутка вбок. */}
      <div className="flex gap-3 overflow-x-auto pb-2.5">
        {columns.map((column) => (
          <section
            key={column.id}
            onDragOver={(event) => {
              if (!canMove) return;
              event.preventDefault();
              setOver(column.id);
            }}
            onDragLeave={() => setOver((cur) => (cur === column.id ? null : cur))}
            onDrop={drop(column.id)}
            className={`flex min-h-95 w-68 shrink-0 flex-col gap-2 rounded-xl bg-surface-soft p-2.5 ring-inset transition-shadow ${
              over === column.id ? "ring-2 ring-accent" : "ring-1 ring-border"
            }`}
          >
            <div className="flex items-start gap-[7px] px-0.5 pt-0.5 pb-1 text-[13.5px]">
              <i className={`mt-1.5 size-2 shrink-0 rounded-full ${stageDot(column.color)}`} />
              <b className={`min-w-0 flex-1 leading-[1.35] font-semibold ${stageText(column.color)}`}>
                {column.name}
              </b>
              <span className="grid h-5.5 min-w-5.5 shrink-0 place-items-center rounded-md px-1 text-xs text-fg-muted tabular-nums ring-1 ring-border-strong ring-inset">
                {column.candidates.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {column.candidates.length ? (
                column.candidates.map((c) => (
                  <article
                    key={text(c.guid)}
                    draggable={canMove}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", text(c.guid));
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(text(c.guid));
                    }}
                    onDragEnd={() => setDragging(null)}
                    /* `.fn-card`: лёгкая тень и рамка; при наведении — тень карточки. */
                    className={`flex gap-2.5 rounded-[9px] bg-surface px-[11px] py-2.5 ring-1 ring-border ring-inset transition-shadow hover:shadow-card hover:ring-border-strong ${
                      canMove ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragging === text(c.guid) ? "opacity-40" : ""}`}
                  >
                    <Avatar name={text(c.full_name)} photo={firstText(c.photo) || undefined} size="lg" />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold">{text(c.full_name) || "—"}</b>
                      <small className="text-xs text-fg-subtle">
                        {[levelOf(c), daysOnStage(c, today)].filter(Boolean).join(" · ")}
                      </small>
                      {(scores.has(text(c.guid)) || tagsOf(c).length > 0) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-[5px]">
                          {scores.has(text(c.guid)) && <Score value={scores.get(text(c.guid))} />}
                          {tagsOf(c).map((tag) => (
                            <span key={tag} className={`inline-flex h-5 items-center rounded-[4px] px-1.5 text-xs ${CHIP_STYLES.gray}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className="grid min-h-30 flex-1 place-items-center rounded-[9px] border-[1.5px] border-dashed border-border-strong text-[13px] text-fg-subtle">
                  {t("vacancy.page.empty")}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* `.fn-done`: завершённые — карточками в сетку, свёрнуто-развёрнуто. */}
      <section className="mt-3.5 rounded-xl ring-1 ring-border ring-inset">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm"
        >
          <b className="font-semibold">{t("vacancy.page.finished", { count: finished.length })}</b>
          <span className="text-fg-subtle">{t("vacancy.page.finishedHint")}</span>
          <Icon
            as={ChevronDownIcon}
            size={15}
            className={`ml-auto text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2.5 px-4 pb-4">
            {finished.length ? (
              finished.map((c) => (
                <div
                  key={text(c.guid)}
                  className="flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 ring-1 ring-border ring-inset transition-colors hover:bg-surface-hover"
                >
                  <Avatar name={text(c.full_name)} photo={firstText(c.photo) || undefined} size="lg" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold">{text(c.full_name) || "—"}</b>
                    <span className="mt-0.5 flex items-start gap-1.5 text-xs text-fg-subtle">
                      <span className="shrink-0">
                        <CandidateCell fields={candidateFields} slug="status" row={c} locale={locale} language={language} />
                      </span>
                      <span className="line-clamp-2 pt-0.5">
                        {c.status === "hired"
                          ? text(c.start_date) &&
                            t("vacancy.page.startsAt", { date: formatDate(text(c.start_date), "date", locale) })
                          : text(related(c, "hr_rejection_reasons_id").name)}
                      </span>
                    </span>
                  </div>
                  <Score value={scores.get(text(c.guid))} />
                  {c.status !== "hired" && canMove && (
                    <button
                      type="button"
                      onClick={() => onRestore(c)}
                      title={t("vacancy.page.restore")}
                      aria-label={t("vacancy.page.restore")}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <Icon as={RotateCcwIcon} size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <span className="text-sm text-fg-subtle">{t("vacancy.page.noneYet")}</span>
            )}
          </div>
        )}
      </section>
    </>
  );

  function daysOnStage(c: Item, now: string): string {
    const days = daysBetween(text(c.stage_changed_at), now);
    return days === null ? "" : t("vacancy.page.onStage", { count: Math.max(0, days) });
  }
}

/** Подпись варианта поля кандидата словами — «Middle · на этапе 5 дн.». */
function optionLabel(fields: Field[], slug: string, row: Item, language: string) {
  const field = fields.find((f) => f.slug === slug);
  const found = field && optionOf(field, text(row[slug]));
  return found ? localized(found.labels, language, found.label || found.value) : text(row[slug]);
}

/**
 * Статус вакансии кнопкой его цвета — `.vc-stbtn` прототипа: точка,
 * подпись, стрелка. Цвет — из варианта, через палитру чипов.
 */
function StatusButton({
  field,
  value,
  language,
  open,
  onClick,
}: {
  field: Field;
  value: string;
  language: string;
  open: boolean;
  onClick: () => void;
}) {
  const option = optionOf(field, value);
  const color = option?.color ? hexToChipColor(option.color) : "gray";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex h-(--spacing-control) items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 ${CHIP_STYLES[color]}`}
    >
      <i className="size-1.5 rounded-full bg-current opacity-80" />
      {option ? localized(option.labels, language, option.label || option.value) : value || "—"}
      <Icon as={ChevronDownIcon} size={14} className="opacity-70" />
    </button>
  );
}

/** «Кандидаты» — `cands()` прототипа: таблица с поиском по имени. */
function Candidates({
  query,
  scores,
  candidates,
  columns,
  candidateFields,
  locale,
  language,
}: {
  query: string;
  scores: Map<string, number>;
  candidates: Item[];
  columns: StageColumn[];
  candidateFields: Field[];
  locale: string;
  language: string;
}) {
  const { t } = useTranslation();
  const shown = candidates.filter((c) => text(c.full_name).toLowerCase().includes(query.trim().toLowerCase()));
  const stageOf = (c: Item) => columns.find((s) => s.id === text(c.hr_recruiting_stages_id));
  const money = new Intl.NumberFormat(locale);
  const th = "h-row border-b border-border px-2 text-left text-xs font-normal text-fg-muted";
  const td = "h-11 border-b border-border px-2";

  return (
    <div>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={th}>{t("vacancy.page.col.candidate")}</th>
            <th className={th}>{t("vacancy.page.col.stage")}</th>
            <th className={th}>{t("vacancy.page.col.score")}</th>
            <th className={th}>{t("vacancy.page.col.source")}</th>
            <th className={`${th} text-right`}>{t("vacancy.page.col.salary")}</th>
            <th className={th}>{t("vacancy.page.col.applied")}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => {
            const stage = stageOf(c);
            const salary = num(c.salary_expectation);
            return (
              <tr key={text(c.guid)} className="hover:[&>td]:bg-surface-hover">
                <td className={td}>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={text(c.full_name)} photo={firstText(c.photo) || undefined} />
                    <b className="font-medium">{text(c.full_name) || "—"}</b>
                    <CandidateCell fields={candidateFields} slug="level" row={c} locale={locale} language={language} />
                  </span>
                </td>
                <td className={td}>
                  {c.status === "active" && stage ? (
                    <span className="inline-flex items-center gap-1.5">
                      <i className={`size-2 rounded-full ${stageDot(stage.color)}`} />
                      {stage.name}
                    </span>
                  ) : (
                    <CandidateCell fields={candidateFields} slug="status" row={c} locale={locale} language={language} />
                  )}
                </td>
                <td className={td}>
                  <Score value={scores.get(text(c.guid))} />
                </td>
                <td className={`${td} text-fg-muted`}>{text(related(c, "hr_candidate_sources_id").name)}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {salary === null ? "" : `${money.format(salary)} ${text(c.currency)}`}
                </td>
                <td className={`${td} text-fg-muted`}>{formatDate(text(c.applied_at), "date", locale)}</td>
              </tr>
            );
          })}
          {!shown.length && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-fg-subtle">
                {t("vacancy.page.noCandidates")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
