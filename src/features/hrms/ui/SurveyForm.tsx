import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BracesIcon, CheckIcon, CircleDotIcon, FileTextIcon, ListChecksIcon, UsersIcon } from "lucide-react";
import type { Item } from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { text } from "../api/org";
import { SURVEYS, useSaveSurvey, useSurveyDraftSource, type SurveyParticipant } from "../api/survey";
import { parseDefinition, questions, SURVEY_STATUS, type Definition } from "../model/survey";
import { SURVEY_TEMPLATES } from "../model/survey-templates";
import { Dropdown } from "@/shared/ui/dropdown";
import { blank, formError, FormBar, FormField, FormItem, FormSection, Switch } from "./record-form";
import { EmployeePicker } from "./ShiftDialog";

/* Конструктор — отдельным чанком (ADR-0015). */
const SurveyCreator = lazy(() => import("./SurveyCreator"));

/** Статус — во всю строку, как `.svf-st` прототипа. */
const FULL = new Set(["status"]);

/**
 * Форма опроса — `editShell()` прототипа (survey.html): «Основное»,
 * «Сотрудники», «Вопросы» в конструкторе SurveyJS. `guid` пуст — новый
 * опрос; `template` — ключ шаблона, с которым он открыт.
 * Всё уходит по «Сохранить» (useSaveSurvey).
 */
export function SurveyForm({
  guid,
  template = "",
  locale,
  language,
  onSaved,
  onClose,
}: {
  guid: string;
  template?: string;
  locale: string;
  language: string;
  onSaved: (guid: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const source = useSurveyDraftSource(guid);
  const relations = useMemo(() => new Map(source.relations.map((r) => [r.id, r])), [source.relations]);
  if (source.isLoading || (guid && !source.row)) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const preset = SURVEY_TEMPLATES.find((tpl) => tpl.key === template);
  const row: Item = source.row ?? {
    guid: "",
    title: preset && preset.key !== "blank" ? preset.title : "",
    type: preset?.type ?? "survey",
    status: SURVEY_STATUS.draft,
    is_anonymous: false,
  };
  return (
    <Editor
      guid={guid}
      row={row}
      definition={source.row ? parseDefinition(source.row.definition) : (preset?.definition ?? { pages: [{ name: "p1", elements: [] }] })}
      fields={source.fields}
      relations={relations}
      participants={source.participants}
      locale={locale}
      language={language}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

function Editor({
  guid,
  row,
  definition,
  fields,
  relations,
  participants,
  locale,
  language,
  onSaved,
  onClose,
}: {
  guid: string;
  row: Item;
  definition: Definition;
  fields: Field[];
  relations: Map<string, Relation>;
  participants: SurveyParticipant[];
  locale: string;
  language: string;
  onSaved: (guid: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const creating = !guid;
  const [draft, setDraft] = useState<Item>(row);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [employeeIds, setEmployeeIds] = useState(() => participants.map((p) => p.employeeId));
  /* Импорт подменяет вопросы целиком: конструктор пересоздаётся с новыми
     (`key`), а не получает их присваиванием — см. SurveyCreator. */
  const [questionsSource, setQuestionsSource] = useState({ definition, version: 0 });
  const readQuestions = useRef<() => Definition>(() => definition);
  const saveSurvey = useSaveSurvey();
  const bySlug = useMemo(() => new Map(fields.map((f) => [f.slug, f])), [fields]);
  const typeField = bySlug.get("type");
  const anonymousField = bySlug.get("is_anonymous");

  const set = (slug: string, value: unknown, extra: Item = {}) => {
    setDraft((cur) => ({ ...cur, [slug]: value, ...extra }));
    setChanged((cur) => new Set(cur).add(slug));
  };
  const field = (slug: string) => {
    const f = bySlug.get(slug);
    return (
      f && (
        <FormField
          key={f.id}
          field={f}
          row={draft}
          tableSlug={SURVEYS}
          relations={relations}
          locale={locale}
          language={language}
          creating={creating}
          required={slug === "title"}
          wide={FULL.has(slug)}
          {...(slug === "title" ? { placeholder: t("survey.form.titlePlaceholder") } : {})}
          onChange={(value, extra) => set(slug, value, extra)}
        />
      )
    );
  };

  /** «Импорт SurveyJS JSON» прототипа: файл с JSON опроса. */
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const imported = parseDefinition(await file.text());
    if (!questions(imported).length) return toast.error(t("survey.form.importInvalid"));
    setQuestionsSource((cur) => ({ definition: imported, version: cur.version + 1 }));
    toast.success(t("survey.form.imported", { count: questions(imported).length }));
  };

  const save = () => {
    const title = bySlug.get("title");
    if (title && blank(draft.title)) return toast.error(`${localized(title.labels, language, title.label)}: ${t("cell.required")}`);
    const problem = formError(creating ? fields : fields.filter((f) => changed.has(f.slug)), draft, language, t);
    if (problem) return toast.error(problem);
    /* Конец раньше начала — опрос одного дня, как `sfSave` прототипа. */
    const to = text(draft.date_to) && text(draft.date_from) && text(draft.date_to) < text(draft.date_from) ? { date_to: draft.date_from } : {};
    const values = creating
      ? Object.fromEntries(fields.filter((f) => f.slug !== "definition" && !blank(draft[f.slug])).map((f) => [f.slug, draft[f.slug]]))
      : Object.fromEntries([...changed].map((slug) => [slug, draft[slug]]));
    const questions = readQuestions.current();
    saveSurvey.mutate(
      {
        guid,
        values: { ...values, ...to },
        /* Заголовок формы, которую видит сотрудник, — название опроса, если своего нет. */
        definition: { ...questions, title: questions.title || text(draft.title) },
        participants,
        employeeIds,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <>
      <div className="mx-auto max-w-[1100px] pt-5 pb-24">
        <h1 className="mb-1 text-[22px] font-semibold">{t(creating ? "survey.form.new" : "survey.form.title")}</h1>
        <p className="mb-4 text-sm text-fg-muted">{t("survey.form.subtitle")}</p>

        <FormSection icon={FileTextIcon} title={t("survey.form.base")} hint={t("survey.form.baseHint")}>
          {field("title")}
          {typeField && (
            <FormItem label={localized(typeField.labels, language, typeField.label)}>
              <Dropdown
                value={text(draft.type)}
                items={[...typeField.options.values()].map((o) => ({ value: o.value, label: localized(o.labels, language, o.label || o.value) }))}
                onChange={(value) => set("type", value)}
              />
            </FormItem>
          )}
          {field("status")}
          {field("date_from")}
          {field("date_to")}
          {anonymousField && (
            <FormItem wide>
              <Switch
                on={draft.is_anonymous === true}
                label={localized(anonymousField.labels, language, anonymousField.label)}
                hint={t("survey.form.anonymousHint")}
                onToggle={() => set("is_anonymous", draft.is_anonymous !== true)}
              />
            </FormItem>
          )}
        </FormSection>

        <FormSection icon={UsersIcon} title={`${t("survey.form.participants")} · ${employeeIds.length}`} hint={t("survey.form.participantsHint")}>
          <FormItem wide>
            <EmployeePicker value={employeeIds} onChange={setEmployeeIds} />
          </FormItem>
        </FormSection>

        <FormSection icon={ListChecksIcon} title={t("survey.questions")} hint={t("survey.form.questionsHint")}>
          <FormItem wide>
            <label className="flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[13px] text-fg-muted ring-1 ring-border-strong ring-inset transition-colors hover:bg-surface-hover hover:text-fg">
              <Icon as={BracesIcon} size={14} />
              {t("survey.form.import")}
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  void importJson(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <Suspense fallback={<p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>}>
              <SurveyCreator
                key={questionsSource.version}
                definition={questionsSource.definition}
                locale={locale}
                onReady={(read) => {
                  readQuestions.current = read;
                }}
              />
            </Suspense>
          </FormItem>
        </FormSection>
      </div>

      <FormBar
        note={
          <>
            <Icon as={CircleDotIcon} size={12} />
            {t(creating ? "survey.form.new" : "survey.form.title")}
          </>
        }
      >
        <Button variant="secondary" onClick={onClose}>
          {t("action.cancel")}
        </Button>
        <Button onClick={save} disabled={saveSurvey.isPending}>
          <Icon as={CheckIcon} size={15} />
          {t("action.save")}
        </Button>
      </FormBar>
    </>
  );
}
