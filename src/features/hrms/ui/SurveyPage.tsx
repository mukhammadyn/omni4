import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BellIcon,
  BracesIcon,
  CalendarIcon,
  ChartColumnIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClipboardListIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ListChecksIcon,
  LockIcon,
  PencilIcon,
  PercentIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  TagIcon,
  Trash2Icon,
  UserCheckIcon,
  UserIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar, Cell, useDeleteItems, type Item } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { firstText, related, text, useOrgDirectory } from "../api/org";
import { SURVEYS, useAssignSurvey, useDuplicateSurvey, useSurvey, type SurveyParticipant } from "../api/survey";
import {
  fill,
  parseAnswers,
  parseDefinition,
  PARTICIPANT,
  questions,
  questionStats,
  responsesCsv,
  type Answers,
  type Bar,
  type QuestionStat,
} from "../model/survey";
import { Card, Meta } from "./page-parts";
import { EmployeePicker } from "./ShiftDialog";
import { StatusButton } from "./VacancyPage";

/* Форма SurveyJS — отдельным чанком (ADR-0015), только когда её открыли. */
const SurveyRunner = lazy(() => import("./SurveyRunner"));

type Filter = "all" | "done" | "todo";
type Person = SurveyParticipant & { name: string; photo: string; department: string; done: boolean; at: string; answers: Answers | null };

/** Сохранить текст файлом — «Экспорт CSV» и «Скачать JSON». */
function download(name: string, body: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([body], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Страница опроса — `view()` прототипа (survey.html): шапка со статусом
 * и действиями, KPI (они же отбор), сотрудники с ответами и статистика
 * по вопросам. В анонимном опросе ответы конкретных людей закрыты —
 * только общая статистика.
 */
export function SurveyPage({
  guid,
  locale,
  language,
  onEdit,
  onDeleted,
  onOpenEmployee,
}: {
  guid: string;
  locale: string;
  language: string;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const survey = useSurvey(guid);
  const { departments } = useOrgDirectory();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState<{ title: string; answers?: Answers } | null>(null);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteItems(SURVEYS);
  const duplicate = useDuplicateSurvey();
  const relations = useMemo(() => new Map(survey.relations.map((r) => [r.id, r])), [survey.relations]);
  const bySlug = useMemo(() => new Map(survey.fields.map((f) => [f.slug, f])), [survey.fields]);
  const definition = useMemo(() => parseDefinition(survey.row?.definition), [survey.row?.definition]);

  /* Назначение × ответ: прошёл — по статусу назначения или по ответу. */
  const people = useMemo((): Person[] => {
    const departmentOf = new Map(departments.map((d) => [d.id, d.name]));
    const answerOf = new Map(survey.responses.map((r) => [text(r.hr_employees_id), r]));
    return survey.participants.map((p) => {
      const person = related(p.row, "hr_employees_id");
      const response = answerOf.get(p.employeeId);
      return {
        ...p,
        name: text(person.full_name),
        photo: firstText(person.photo),
        department: departmentOf.get(text(person.hr_departments_id)) ?? "",
        done: p.row.status === PARTICIPANT.completed || Boolean(response),
        at: text(p.row.completed_at) || text(response?.completed_at),
        answers: response ? parseAnswers(response.answers) : null,
      };
    });
  }, [survey.participants, survey.responses, departments]);

  const row = survey.row;
  if (!row)
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">{survey.isLoading ? t("common.loading") : (survey.error ?? t("survey.page.notFound"))}</p>
    );

  const anonymous = row.is_anonymous === true;
  const title = text(row.title) || "—";
  const status = bySlug.get("status");
  const counts = fill(people.map((p) => (p.done ? PARTICIPANT.completed : PARTICIPANT.pending)));
  const answered = survey.responses.map((r) => parseAnswers(r.answers));
  const shown = people.filter(
    (p) => (filter === "all" || (filter === "done") === p.done) && (!query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const date = (value: string) => formatDate(value, "datetime", locale) ?? "";
  const option = (slug: string) => {
    const field = bySlug.get(slug);
    const found = field && optionOf(field, text(row[slug]));
    return found ? localized(found.labels, language, found.label || found.value) : text(row[slug]);
  };
  const from = formatDate(text(row.date_from), "date", locale) ?? "";
  const to = formatDate(text(row.date_to), "date", locale) ?? "";
  const cell = (field: Field, values: Item = row) => (
    <Cell field={field} row={values} tableSlug={SURVEYS} relations={relations} locale={locale} language={language} />
  );
  /* ponytail: бота ещё нет — напоминание пока только обещание; появится бот — здесь его вызов. */
  const remind = () => toast.success(t("survey.page.remindSoon"));

  const exportCsv = () =>
    download(
      `survey-${guid}.csv`,
      responsesCsv(
        definition,
        survey.responses.map((r, at) => {
          const person = people.find((p) => p.employeeId === text(r.hr_employees_id));
          return {
            who: anonymous ? t("survey.page.respondent", { n: at + 1 }) : (person?.name ?? ""),
            at: date(text(r.completed_at)),
            answers: parseAnswers(r.answers),
          };
        }),
        [t("survey.page.employee"), t("survey.page.date")],
      ),
      "text/csv",
    );

  const kpis: { icon: LucideIcon; label: string; n: number; color: ChipColor; filter: Filter }[] = [
    { icon: UsersIcon, label: t("survey.assigned"), n: counts.total, color: "blue", filter: "all" },
    { icon: CircleCheckIcon, label: t("survey.page.done"), n: counts.done, color: "green", filter: "done" },
    { icon: CircleDashedIcon, label: t("survey.page.todo"), n: counts.total - counts.done, color: "gray", filter: "todo" },
  ];
  const todo = people.filter((p) => !p.done).length;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pb-20 max-md:px-3">
        {/* `.vc-head` прототипа. */}
        <header className="flex flex-wrap items-start gap-3.5 pt-5 pb-5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${CHIP_STYLES.blue}`}>
            <Icon as={ClipboardListIcon} size={20} />
          </span>
          <div className="min-w-60 flex-1">
            <h1 className="mb-1 flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold tracking-[-0.01em]">
              {title}
              {status && text(row.status) && <span className="flex text-sm font-normal">{cell(status)}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted">
              <Meta icon={CalendarIcon} text={from ? (to && to !== from ? `${from} — ${to}` : from) : t("survey.page.noPeriod")} />
              <Meta icon={TagIcon} text={option("type")} />
              <Meta icon={anonymous ? LockIcon : UserCheckIcon} text={t(anonymous ? "survey.anonymous" : "survey.page.personal")} />
              <Meta icon={ListChecksIcon} text={t("survey.questionCount", { count: questions(definition).length })} />
              <Meta
                icon={UserIcon}
                text={text(related(row, "core_users_id").full_name) && t("survey.page.author", { name: text(related(row, "core_users_id").full_name) })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && survey.can.update && (
              <Popover
                align="end"
                trigger={({ open, toggle }) => <StatusButton field={status} value={text(row.status)} language={language} open={open} onClick={toggle} />}
              >
                {(close) =>
                  [...status.options.values()].map((opt) => (
                    <PopoverItem
                      key={opt.value}
                      onClick={() => {
                        survey.edit("status", opt.value);
                        close();
                      }}
                      {...(opt.value === text(row.status) ? { trailing: <Icon as={CheckIcon} size={14} className="shrink-0" /> } : {})}
                    >
                      {cell(status, { status: opt.value })}
                    </PopoverItem>
                  ))
                }
              </Popover>
            )}
            <Button variant="secondary" onClick={() => setRunning({ title: t("survey.page.testTitle", { title }) })}>
              <Icon as={PlayIcon} size={15} />
              {t("survey.page.test")}
            </Button>
            {survey.can.update && (
              <Button variant="secondary" onClick={onEdit}>
                <Icon as={PencilIcon} size={15} />
                {t("action.edit")}
              </Button>
            )}
            <Popover
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  aria-label={t("survey.actions")}
                  onClick={toggle}
                  className={`grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg ${open ? "bg-surface-active" : ""}`}
                >
                  <Icon as={EllipsisIcon} size={16} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <PopoverItem
                    icon={<Icon as={BracesIcon} size={16} className="shrink-0 text-fg-muted" />}
                    onClick={() => {
                      close();
                      download(`survey-${guid}.json`, JSON.stringify(definition, null, 2), "application/json");
                    }}
                  >
                    {t("survey.page.downloadJson")}
                  </PopoverItem>
                  {survey.can.write && (
                    <PopoverItem
                      icon={<Icon as={CopyIcon} size={16} className="shrink-0 text-fg-muted" />}
                      onClick={() => {
                        close();
                        duplicate.mutate({ row, suffix: t("survey.copySuffix") }, { onSuccess: () => toast.success(t("survey.page.duplicated")) });
                      }}
                    >
                      {t("survey.duplicate")}
                    </PopoverItem>
                  )}
                  {survey.can.delete && (
                    <>
                      <PopoverSeparator />
                      <PopoverItem
                        danger
                        icon={<Icon as={Trash2Icon} size={16} className="shrink-0" />}
                        onClick={() => {
                          close();
                          setDeleting(true);
                        }}
                      >
                        {t("action.delete")}
                      </PopoverItem>
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>
        </header>

        {/* `.td-kpi`: карточки — они же отбор сотрудников. */}
        <div className="mb-4 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
          {kpis.map((k) => (
            <button
              key={k.filter}
              type="button"
              onClick={() => setFilter(filter === k.filter ? "all" : k.filter)}
              className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-hover ${
                filter === k.filter && k.filter !== "all" ? "border-accent" : "border-border"
              }`}
            >
              <span className={`grid size-10 place-items-center rounded-[10px] ${CHIP_STYLES[k.color]}`}>
                <Icon as={k.icon} size={19} />
              </span>
              <span>
                <b className="block text-2xl leading-tight font-bold tabular-nums">{k.n}</b>
                <small className="text-[13px] text-fg-muted">{k.label}</small>
              </span>
            </button>
          ))}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
            <span className={`grid size-10 place-items-center rounded-[10px] ${CHIP_STYLES.purple}`}>
              <Icon as={PercentIcon} size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-2xl leading-tight font-bold tabular-nums">{counts.percent}%</b>
              <small className="text-[13px] text-fg-muted">{t("survey.fill")}</small>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-[3px] bg-surface-hover">
                <i className="block h-full bg-success" style={{ width: `${counts.percent}%` }} />
              </span>
            </span>
          </div>
        </div>

        <Card icon={UsersIcon} title={t("survey.page.employees")} count={people.length}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-surface-hover p-0.5">
              {(["all", "done", "todo"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`h-7 rounded-[5px] px-2.5 text-[13px] transition-colors ${filter === f ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                >
                  {t(`survey.page.filter.${f}`)}
                </button>
              ))}
            </div>
            <label className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm ring-1 ring-border-strong ring-inset">
              <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("survey.page.search")}
                className="w-36 bg-transparent outline-none placeholder:text-fg-subtle"
              />
            </label>
            <span className="flex-1" />
            {todo > 0 && (
              <Button size="sm" variant="secondary" onClick={remind}>
                <Icon as={BellIcon} size={14} />
                {t("survey.page.remindAll", { count: todo })}
              </Button>
            )}
            {survey.canAssign && (
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
                <Icon as={UserPlusIcon} size={14} />
                {t("survey.page.pick")}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12.5px] text-fg-muted">
                  <th className="px-2.5 py-2 font-medium">{t("survey.page.employee")}</th>
                  <th className="px-2.5 py-2 font-medium">{t("survey.page.department")}</th>
                  <th className="px-2.5 py-2 font-medium">{t("survey.page.status")}</th>
                  <th className="px-2.5 py-2 font-medium">{t("survey.page.date")}</th>
                  <th className="px-2.5 py-2 text-right font-medium">{t("survey.page.answers")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <td className="px-2.5 py-2">
                      <button type="button" onClick={() => onOpenEmployee(p.employeeId)} className="flex items-center gap-2 hover:underline">
                        <Avatar name={p.name} photo={p.photo || undefined} size="sm" />
                        {p.name || "—"}
                      </button>
                    </td>
                    <td className="px-2.5 py-2 text-fg-muted">{p.department || "—"}</td>
                    <td className="px-2.5 py-2">
                      <span className={`inline-flex h-5.5 items-center rounded-full px-2 text-xs ${CHIP_STYLES[p.done ? "green" : "gray"]}`}>
                        {t(p.done ? "survey.page.passed" : "survey.page.notPassed")}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">{p.done && p.at ? date(p.at) : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-2.5 py-2 text-right whitespace-nowrap">
                      {!p.done ? (
                        <button type="button" onClick={remind} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                          <Icon as={BellIcon} size={13} />
                          {t("survey.page.remind")}
                        </button>
                      ) : anonymous ? (
                        <span className="inline-flex items-center gap-1 text-fg-subtle" title={t("survey.page.anonymousHint")}>
                          <Icon as={LockIcon} size={13} />
                          {t("survey.anonymous")}
                        </span>
                      ) : p.answers ? (
                        <button
                          type="button"
                          onClick={() => setRunning({ title: t("survey.page.answersOf", { name: p.name }), answers: p.answers ?? {} })}
                          className="text-accent-text hover:underline"
                        >
                          {t("survey.page.view")}
                        </button>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && (
              <p className="py-6 text-center text-sm text-fg-subtle">{t(people.length ? "survey.page.nobodyFound" : "survey.page.nobody")}</p>
            )}
          </div>
        </Card>

        <Card icon={ChartColumnIcon} title={t("survey.page.stats")}>
          <div className="mb-2 flex items-center gap-2 text-[13px] text-fg-subtle">
            {anonymous && <Icon as={LockIcon} size={13} />}
            {t("survey.page.responses", { count: survey.responses.length })}
            <span className="flex-1" />
            <Button size="sm" variant="secondary" disabled={!survey.responses.length} onClick={exportCsv}>
              <Icon as={DownloadIcon} size={14} />
              {t("survey.page.csv")}
            </Button>
          </div>
          <Stats
            stats={questionStats(definition, answered)}
            total={answered.length}
            anonymous={anonymous}
            whoAt={(at) => people.find((p) => p.employeeId === text(survey.responses[at]?.hr_employees_id))}
          />
        </Card>
      </div>

      {running && (
        <Suspense fallback={null}>
          <SurveyRunner
            title={running.title}
            definition={definition}
            {...(running.answers ? { answers: running.answers } : {})}
            locale={locale}
            onClose={() => setRunning(null)}
          />
        </Suspense>
      )}
      {picking && (
        <PickDialog guid={guid} participants={survey.participants} onClose={() => setPicking(false)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("survey.deleteTitle")}
          description={t("survey.deleteText", { title })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() => remove.mutate([guid], { onSuccess: onDeleted })}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

/** «Выбрать сотрудников»: тот же выбор, что в форме, сразу в назначения. */
function PickDialog({ guid, participants, onClose }: { guid: string; participants: SurveyParticipant[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [ids, setIds] = useState(() => participants.map((p) => p.employeeId));
  const assign = useAssignSurvey(guid);
  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t("survey.page.pick")}</h2>
        <div className="px-4 py-3">
          <EmployeePicker value={ids} onChange={setIds} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={assign.isPending}
            onClick={() =>
              assign.mutate(
                { participants, employeeIds: ids },
                {
                  onSuccess: () => {
                    toast.success(t("survey.page.assignedCount", { count: ids.length }));
                    onClose();
                  },
                },
              )
            }
          >
            {t("action.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const TONE: Record<NonNullable<Bar["tone"]>, string> = { good: "bg-success", mid: "bg-warning", bad: "bg-danger" };

/** «Статистика по вопросам» — `.svy-stats` прототипа. */
function Stats({
  stats,
  total,
  anonymous,
  whoAt,
}: {
  stats: QuestionStat[];
  total: number;
  anonymous: boolean;
  whoAt: (at: number) => Person | undefined;
}) {
  const { t } = useTranslation();
  const [allTexts, setAllTexts] = useState<QuestionStat | null>(null);
  if (!stats.length) return <p className="rounded-lg bg-surface-hover p-3.5 text-sm text-fg-subtle">{t("survey.page.noQuestions")}</p>;
  if (!total) return <p className="rounded-lg bg-surface-hover p-3.5 text-sm text-fg-subtle">{t("survey.page.noAnswers", { count: stats.length })}</p>;

  const label = (q: QuestionStat, bar: Bar, at: number) =>
    q.kind === "nps"
      ? t(["survey.page.promoters", "survey.page.passives", "survey.page.critics"][at] as "survey.page.promoters", { range: bar.label })
      : q.kind === "boolean" && !bar.label
        ? t(at ? "action.no" : "action.yes")
        : bar.label;
  const textRow = (item: { at: number; text: string }) => {
    const who = whoAt(item.at);
    return (
      <div key={item.at} className="flex items-start gap-2 rounded-md bg-surface-hover px-2.5 py-1.5 text-sm">
        {anonymous || !who ? (
          <Icon as={UserRoundIcon} size={16} className="mt-0.5 shrink-0 text-fg-subtle" />
        ) : (
          <Avatar name={who.name} photo={who.photo || undefined} size="sm" />
        )}
        <span className="min-w-0 break-words">{item.text}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {stats.map((q, i) => (
        <div key={q.name} className="rounded-lg border border-border px-3.5 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <b className="text-sm">
              {i + 1}. {q.title}
            </b>
            <span className="flex-1" />
            {q.kind === "nps" && (
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${CHIP_STYLES[(q.nps ?? 0) >= 30 ? "green" : (q.nps ?? 0) >= 0 ? "yellow" : "red"]}`}
              >
                eNPS {(q.nps ?? 0) > 0 ? "+" : ""}
                {q.nps}
              </span>
            )}
            {q.kind === "rating" && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold">
                <Icon as={StarIcon} size={14} className="text-warning" />
                {(q.average ?? 0).toFixed(1)}
                <small className="font-normal text-fg-subtle">{t("survey.page.outOf", { max: q.max })}</small>
              </span>
            )}
            <span className="text-xs text-fg-subtle">{t("survey.page.answered", { n: q.answered, total })}</span>
          </div>
          {q.kind === "text" ? (
            q.texts?.length ? (
              <div className="flex flex-col gap-1.5">
                {q.texts.slice(0, 5).map((item) => textRow(item))}
                {q.texts.length > 5 && (
                  <button type="button" onClick={() => setAllTexts(q)} className="self-start text-[13px] text-accent-text hover:underline">
                    {t("survey.page.showAll", { count: q.texts.length })}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-fg-subtle">{t("survey.page.noText")}</p>
            )
          ) : q.kind === "other" ? (
            <p className="text-sm text-fg-subtle">{t("survey.page.otherType", { type: q.type })}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {q.bars.map((bar, at) => {
                const share = q.answered ? (bar.count / q.answered) * 100 : 0;
                return (
                  <div key={at} className="grid grid-cols-[minmax(0,200px)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-fg-muted" title={label(q, bar, at)}>
                      {label(q, bar, at)}
                    </span>
                    <span className="h-2 overflow-hidden rounded bg-surface-hover">
                      <i className={`block h-full ${bar.tone ? TONE[bar.tone] : "bg-accent-solid"}`} style={{ width: `${share}%` }} />
                    </span>
                    <span className="w-20 text-right tabular-nums">
                      {bar.count} <small className="text-fg-subtle">({Math.round(share)}%)</small>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {allTexts && (
        <Modal onClose={() => setAllTexts(null)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-modal">
            <h2 className="border-b border-border px-4 py-3 font-semibold">{allTexts.title}</h2>
            <div className="flex flex-col gap-1.5 overflow-auto px-4 py-3">{allTexts.texts?.map((item) => textRow(item))}</div>
            <div className="flex justify-end border-t border-border px-4 py-3">
              <Button variant="secondary" onClick={() => setAllTexts(null)}>
                {t("action.close")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
