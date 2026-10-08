import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AwardIcon,
  BriefcaseIcon,
  CheckIcon,
  FileUpIcon,
  MessageSquareIcon,
  UserIcon,
  UserPlusIcon,
} from "lucide-react";
import { relationDataKey, uploadFolder, useUploadFiles, type Item } from "@/features/item";
import { localized, type Field } from "@/features/table";
import type { TranslationKey } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useNewCandidate } from "../api/candidate-new";
import { text } from "../api/org";
import { CANDIDATES } from "../api/vacancy-page";
import { blank, formError, FormBar, FormField, FormItem, FormSection, Pills } from "./record-form";

/*
 * Секции — `form()` candidate.html, в его порядке. «Первый комментарий»
 * ложится в `notes`: отдельной таблицы комментариев в схеме нет.
 * Вакансия, этап и источник — свои (ниже), остальное — полями схемы.
 */
const SECTIONS: { icon: typeof UserIcon; title: TranslationKey; hint: TranslationKey; slugs: string[] }[] = [
  {
    icon: UserIcon,
    title: "candidate.new.personal",
    hint: "candidate.new.personalHint",
    slugs: ["last_name", "first_name", "phone", "email", "telegram_username", "city"],
  },
  { icon: AwardIcon, title: "candidate.new.profile", hint: "candidate.new.profileHint", slugs: ["level", "experience", "salary_expectation", "currency", "tags"] },
  { icon: MessageSquareIcon, title: "candidate.new.comment", hint: "candidate.new.commentHint", slugs: ["notes"] },
];

/** Без них кандидата не завести — как в прототипе: фамилия, имя, телефон. */
const REQUIRED = new Set(["last_name", "first_name", "phone"]);

const PLACEHOLDER: Record<string, TranslationKey> = {
  last_name: "candidate.new.lastNameHint",
  first_name: "candidate.new.firstNameHint",
  phone: "candidate.new.phoneHint",
  email: "candidate.new.emailHint",
  telegram_username: "candidate.new.telegramHint",
  experience: "candidate.new.experienceHint",
  tags: "candidate.new.tagsHint",
  notes: "candidate.new.notesHint",
};

/** Черновик нового кандидата: guid свой — по нему пишется история этапов. */
const fresh = (vacancy: string): Item => ({
  guid: crypto.randomUUID(),
  hr_vacancies_id: vacancy || null,
  level: "middle",
  currency: "UZS",
});

/**
 * «Новый кандидат» — `form()` candidate.html: резюме, личные данные,
 * вакансия и этап, профиль, первый комментарий. Кандидат встаёт на
 * выбранный этап воронки вакансии; «Сохранить и добавить ещё» —
 * очищает форму, оставив вакансию.
 *
 * Резюме прикрепляется к полю `resume`, но не разбирается: распознавания
 * в бэкенде нет, а прототип его только изображает.
 */
export function NewCandidate({
  vacancy: initial,
  locale,
  language,
  onCreated,
  onCancel,
}: {
  vacancy: string;
  locale: string;
  language: string;
  onCreated: (vacancy: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Item>(() => fresh(initial));
  const vacancyId = text(draft.hr_vacancies_id);
  const form = useNewCandidate(vacancyId);
  const upload = useUploadFiles();
  const bySlug = new Map(form.fields.map((f) => [f.slug, f]));
  const set = (slug: string, value: unknown, extra: Item = {}) => setDraft((cur) => ({ ...cur, [slug]: value, ...extra }));

  /* Подпись вакансии из ссылки — пока связь не выбирали руками. */
  const row: Item =
    draft[relationDataKey("hr_vacancies_id")] || !form.vacancy
      ? draft
      : { ...draft, [relationDataKey("hr_vacancies_id")]: form.vacancy };
  /* Этап — выбранный, если он из воронки этой вакансии; иначе первый. */
  const stage = form.stages.some((s) => s.guid === draft.hr_recruiting_stages_id)
    ? text(draft.hr_recruiting_stages_id)
    : text(form.stages[0]?.guid);
  const source = text(draft.hr_candidate_sources_id) || text(form.sources[0]?.guid);

  /* Функция, а не компонент: компонент, объявленный в рендере, пересоздаётся
     на каждый символ — поле теряет фокус. */
  const field = (slug: string) => {
    const f = bySlug.get(slug);
    if (!f) return null;
    const hint = PLACEHOLDER[f.slug];
    return (
      <FormField
        key={slug}
        field={f}
        row={row}
        tableSlug={CANDIDATES}
        relations={form.relations}
        locale={locale}
        language={language}
        creating
        required={REQUIRED.has(f.slug) || f.slug === "hr_vacancies_id"}
        {...(f.slug === "hr_vacancies_id" ? { wide: true } : {})}
        {...(hint ? { placeholder: t(hint) } : {})}
        onChange={(value, extra) => set(f.slug, value, extra)}
      />
    );
  };

  const save = (more: boolean) => {
    const missing = [...REQUIRED, "hr_vacancies_id"]
      .map((slug) => bySlug.get(slug))
      .find((f): f is Field => Boolean(f) && blank(draft[f!.slug]));
    if (missing) return toast.error(`${localized(missing.labels, language, missing.label)}: ${t("cell.required")}`);
    /* Формат заполненного — телефон, почта — по правилам поля. */
    const problem = formError(form.fields.filter((f) => !blank(draft[f.slug])), draft, language, t);
    if (problem) return toast.error(problem);
    /* Без этапа кандидат «в работе» не встанет ни в одну колонку воронки. */
    if (!stage) return toast.error(t("vacancy.page.noStages"));

    const values = Object.fromEntries(
      form.fields.filter((f) => !blank(draft[f.slug])).map((f) => [f.slug, draft[f.slug]]),
    );
    form.create(
      {
        ...values,
        full_name: `${text(draft.last_name).trim()} ${text(draft.first_name).trim()}`.trim(),
        ...(stage ? { hr_recruiting_stages_id: stage } : {}),
        ...(source ? { hr_candidate_sources_id: source } : {}),
      },
      () => {
        toast.success(t("candidate.new.added"));
        if (more) setDraft({ ...fresh(vacancyId), [relationDataKey("hr_vacancies_id")]: row[relationDataKey("hr_vacancies_id")] });
        else onCreated(vacancyId);
      },
    );
  };

  const resume = bySlug.get("resume");
  const pickResume = (file: File | undefined) => {
    if (!file || !resume) return;
    upload.mutate(
      { files: [file], folder: uploadFolder(resume.attributes) },
      { onSuccess: (urls) => urls[0] && set("resume", urls[0], { resume_name: file.name }) },
    );
  };

  if (form.isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  return (
    <>
      <div className="mx-auto max-w-215 pt-5 pb-24">
        {/* `.cd-nh`: значок, заголовок, подпись. */}
        <header className="mb-4 flex items-center gap-3.5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${CHIP_STYLES.blue}`}>
            <Icon as={UserPlusIcon} size={20} />
          </span>
          <div>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">{t("candidate.new.title")}</h1>
            <p className="text-sm text-fg-subtle">{t("candidate.new.subtitle")}</p>
          </div>
        </header>

        {/* `.cd-cv`: резюме файлом — в поле `resume`. */}
        {resume && (
          <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border-strong px-4.5 py-3.5 transition-colors hover:border-accent hover:bg-surface-hover">
            <Icon as={FileUpIcon} size={20} className="shrink-0 text-accent-text" />
            <div className="min-w-0">
              <b className="block truncate text-sm font-semibold">
                {upload.isPending
                  ? t("richText.uploading")
                  : text(draft.resume_name) || (draft.resume ? t("candidate.new.resumeAttached") : t("candidate.new.resume"))}
              </b>
              <small className="text-xs text-fg-subtle">{t("candidate.new.resumeHint")}</small>
            </div>
            <input
              type="file"
              hidden
              accept=".pdf,.doc,.docx"
              onChange={(event) => {
                pickResume(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        )}

        <FormSection icon={SECTIONS[0]!.icon} title={t(SECTIONS[0]!.title)} hint={t(SECTIONS[0]!.hint)}>
          {SECTIONS[0]!.slugs.map(field)}
        </FormSection>

        <FormSection icon={BriefcaseIcon} title={t("candidate.new.vacancy")} hint={t("candidate.new.vacancyHint")}>
          {field("hr_vacancies_id")}
          <FormItem label={t("candidate.new.stage")} wide>
            {form.stages.length ? (
              <Pills
                options={form.stages.map((s) => ({ value: text(s.guid), label: text(s.name) }))}
                value={[stage]}
                onChange={([next]) => set("hr_recruiting_stages_id", next ?? null)}
              />
            ) : (
              <span className="text-sm text-fg-subtle">{t(vacancyId ? "vacancy.page.noStages" : "candidate.new.pickVacancy")}</span>
            )}
          </FormItem>
          {form.sources.length > 0 && (
            <FormItem label={localized(bySlug.get("hr_candidate_sources_id")?.labels ?? {}, language, bySlug.get("hr_candidate_sources_id")?.label ?? "")} wide>
              <Pills
                options={form.sources.map((s) => ({ value: text(s.guid), label: text(s.name) }))}
                value={[source]}
                onChange={([next]) => set("hr_candidate_sources_id", next ?? null)}
              />
            </FormItem>
          )}
        </FormSection>

        {SECTIONS.slice(1).map((s) => (
          <FormSection key={s.title} icon={s.icon} title={t(s.title)} hint={t(s.hint)}>
            {s.slugs.map(field)}
          </FormSection>
        ))}
      </div>

      <FormBar note={t("candidate.new.note")}>
        <Button variant="secondary" onClick={onCancel}>
          {t("action.cancel")}
        </Button>
        <Button variant="secondary" disabled={form.pending || !form.canAdd} onClick={() => save(true)}>
          {t("candidate.new.saveMore")}
        </Button>
        <Button disabled={form.pending || !form.canAdd} onClick={() => save(false)}>
          <Icon as={CheckIcon} size={15} />
          {t("candidate.new.add")}
        </Button>
      </FormBar>
    </>
  );
}
