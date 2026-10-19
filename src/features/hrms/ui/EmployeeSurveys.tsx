import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartColumnIcon, ClipboardListIcon, EyeOffIcon, PlayIcon } from "lucide-react";
import type { Item } from "@/features/item";
import { localized, optionOf, useTableSchema } from "@/features/table";
import { formatDate } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { related, text } from "../api/org";
import { SURVEYS, useEmployeeSurveys, useSubmitSurvey } from "../api/survey";
import { fill, parseAnswers, parseDefinition, PARTICIPANT, questions, SURVEY_STATUS, type Answers, type Definition } from "../model/survey";
import { Card } from "./page-parts";

const SurveyRunner = lazy(() => import("./SurveyRunner"));

const STATUS_COLOR: Record<string, ChipColor> = {
  [PARTICIPANT.pending]: "yellow",
  [PARTICIPANT.completed]: "green",
  [PARTICIPANT.skipped]: "gray",
};

type Running = { title: string; definition: Definition; answers?: Answers; participant?: Item };

/**
 * «Опросы» сотрудника — `surveysTab()` прототипа (employee.html#surveys):
 * участие, ожидающие, список назначений. `own` — открыта своя карточка:
 * тогда «Пройти» (`svModal()`), иначе HR за сотрудника не отвечает.
 * Ответы анонимного опроса видит только сам сотрудник.
 */
export function EmployeeSurveys({
  employeeId,
  own,
  locale,
  language,
  onOpenSurvey,
}: {
  employeeId: string;
  own: boolean;
  locale: string;
  language: string;
  onOpenSurvey: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const { participants, responses, isLoading } = useEmployeeSurveys(employeeId);
  const { schema } = useTableSchema(SURVEYS);
  const submit = useSubmitSurvey();
  const [running, setRunning] = useState<Running | null>(null);
  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const typeField = schema.fields.find((f) => f.slug === "type");
  const typeLabel = (value: string) => {
    const found = typeField && optionOf(typeField, value);
    return found ? localized(found.labels, language, found.label || found.value) : value;
  };
  const answerOf = new Map(responses.map((r) => [text(r.hr_surveys_id), r]));
  const counts = fill(participants.map((p) => p.status));
  const pending = participants.filter((p) => p.status !== PARTICIPANT.completed && related(p, "hr_surveys_id").status === SURVEY_STATUS.active);
  const date = (value: unknown) => formatDate(text(value), "date", locale) ?? "";

  return (
    <Card icon={ClipboardListIcon} title={t("survey.take.title")} count={participants.length}>
      <p className="mb-3 text-[13px] text-fg-subtle">
        {participants.length ? t("survey.take.summary", { done: counts.done, total: counts.total, percent: counts.percent }) : t("survey.take.none")}
      </p>
      {pending.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-sm">
          <span>📝</span>
          <span>
            {t("survey.take.waiting")} <b>{pending.map((p) => text(related(p, "hr_surveys_id").title)).join(", ")}</b>
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {participants.map((p) => {
          const survey = related(p, "hr_surveys_id");
          const definition = parseDefinition(survey.definition);
          const anonymous = survey.is_anonymous === true;
          const done = p.status === PARTICIPANT.completed;
          const response = answerOf.get(text(p.hr_surveys_id));
          const title = text(survey.title) || "—";
          const from = date(survey.date_from);
          const to = date(survey.date_to);
          const meta = [
            typeLabel(text(survey.type)),
            t("survey.questionCount", { count: questions(definition).length }),
            from && (to && to !== from ? `${from} – ${to}` : from),
          ].filter(Boolean);
          return (
            <div key={text(p.guid)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${CHIP_STYLES.blue}`}>
                <Icon as={ClipboardListIcon} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onOpenSurvey(text(p.hr_surveys_id))} className="truncate text-sm font-semibold hover:underline">
                    {title}
                  </button>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES[STATUS_COLOR[text(p.status)] ?? "gray"]}`}>
                    {t(`survey.take.status.${done ? "completed" : p.status === PARTICIPANT.skipped ? "skipped" : "pending"}`)}
                  </span>
                  {anonymous && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-1.5 py-0.5 text-xs text-fg-muted">
                      <Icon as={EyeOffIcon} size={12} />
                      {t("survey.anonymous")}
                    </span>
                  )}
                </div>
                <small className="text-xs text-fg-subtle">
                  {meta.join(" · ")}
                  {done && p.completed_at ? ` · ${t("survey.take.completedAt", { date: date(p.completed_at) })}` : ""}
                </small>
              </div>
              {own && !done && survey.status === SURVEY_STATUS.active ? (
                <Button size="sm" onClick={() => setRunning({ title, definition, participant: p })}>
                  <Icon as={PlayIcon} size={14} />
                  {t("survey.take.start")}
                </Button>
              ) : done && response && (own || !anonymous) ? (
                <Button size="sm" variant="secondary" onClick={() => setRunning({ title, definition, answers: parseAnswers(response.answers) })}>
                  <Icon as={ChartColumnIcon} size={14} />
                  {t("survey.take.results")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {running && (
        <Suspense fallback={null}>
          <SurveyRunner
            title={running.title}
            definition={running.definition}
            {...(running.answers ? { answers: running.answers } : {})}
            {...(running.participant
              ? { onSubmit: (answers: Answers) => submit.mutateAsync({ participant: running.participant!, answers }) }
              : {})}
            locale={locale}
            onClose={() => setRunning(null)}
          />
        </Suspense>
      )}
    </Card>
  );
}
