import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeftIcon,
  AwardIcon,
  CalendarIcon,
  CheckIcon,
  CircleDotIcon,
  FileTextIcon,
  LightbulbIcon,
  ListChecksIcon,
  MegaphoneIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import type { Item } from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import type { TranslationKey } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { VACANCIES } from "../api/vacancy";
import { text } from "../api/org";
import { usePipelineStages } from "../api/vacancy-page";
import { blank, formError, FormBar, FormField, FormSection } from "./record-form";
import { stageDot } from "./vacancy-parts";

/*
 * Секции формы — `SECS` прототипа, в его порядке: что ищем → кто
 * нанимает → на каких условиях → к какому сроку. Поля — слагами схемы;
 * чего в схеме нет (интервьюеры, тег), того и в форме нет.
 */
type Section = { id: string; icon: LucideIcon; title: TranslationKey; hint: TranslationKey; slugs: string[] };
const SECTIONS: Section[] = [
  {
    id: "base",
    icon: FileTextIcon,
    title: "vacancy.form.base",
    hint: "vacancy.form.baseHint",
    slugs: ["title", "departments_id", "positions_id", "level", "headcount", "priority", "status"],
  },
  { id: "team", icon: UsersIcon, title: "vacancy.page.card.team", hint: "vacancy.form.teamHint", slugs: ["employees_id", "employees_id_2"] },
  {
    id: "terms",
    icon: WalletIcon,
    title: "vacancy.page.card.terms",
    hint: "vacancy.form.termsHint",
    slugs: ["locations_id", "work_format", "employment_type", "salary_from", "salary_to", "currency", "show_salary"],
  },
  {
    id: "dates",
    icon: CalendarIcon,
    title: "vacancy.page.card.dates",
    hint: "vacancy.form.datesHint",
    slugs: ["opened_at", "deadline", "desired_start_date", "closed_at"],
  },
  { id: "reqs", icon: AwardIcon, title: "vacancy.page.card.reqs", hint: "vacancy.form.reqsHint", slugs: ["experience", "languages", "skills"] },
  { id: "stages", icon: ListChecksIcon, title: "vacancy.page.stages", hint: "vacancy.form.stagesHint", slugs: ["hr_recruiting_pipelines_id"] },
  {
    id: "desc",
    icon: AlignLeftIcon,
    title: "vacancy.form.desc",
    hint: "vacancy.form.descHint",
    slugs: ["description", "duties", "requirements", "conditions"],
  },
  { id: "pub", icon: MegaphoneIcon, title: "vacancy.page.card.pub", hint: "vacancy.form.pubHint", slugs: ["channels", "is_published"] },
];

/** Поля, которые прототип ставит на всю ширину сам (`FF(…, 'full')`):
    название и опыт — подписи вариантов опыта в половину не влезают. */
const FULL = new Set(["title", "experience"]);

/**
 * «Редактировать» вакансии — `edit()` прототипа: форма по секциям
 * с оглавлением слева и полосой «Отменить / Сохранить» внизу.
 *
 * Правки копятся в черновике и уходят одним запросом по «Сохранить».
 *
 * `creating` — новая вакансия (vacancy.html?new=1): та же форма,
 * но уходят все заполненные поля, а не только тронутые, и кнопка —
 * «Создать вакансию».
 */
export function VacancyForm({
  row,
  fields,
  relations,
  creating = false,
  pending = false,
  locale,
  language,
  onSave,
  onClose,
}: {
  row: Item;
  fields: Field[];
  relations: Map<string, Relation>;
  creating?: boolean;
  pending?: boolean;
  locale: string;
  language: string;
  onSave: (values: Item) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Item>(row);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const bySlug = new Map(fields.map((f) => [f.slug, f]));
  /* Этапы — выбранной в черновике воронки: сменили — список следом. */
  const { stages: columns } = usePipelineStages(text(draft.hr_recruiting_pipelines_id));

  const set = (slug: string, value: unknown, extra: Item = {}) => {
    setDraft((cur) => ({ ...cur, [slug]: value, ...extra }));
    setChanged((cur) => new Set(cur).add(slug));
  };

  const save = () => {
    /* Название — всегда. Остальное — только тронутое: обязательное,
       пустое и до правки, не держит сохранение чужого поля, иначе
       вакансию со старым пробелом не поправить вовсе. */
    const title = bySlug.get("title");
    if (title && blank(draft.title))
      return toast.error(`${localized(title.labels, language, title.label)}: ${t("cell.required")}`);
    const problem = formError(creating ? fields : fields.filter((f) => changed.has(f.slug)), draft, language, t);
    if (problem) return toast.error(problem);
    if (creating)
      return onSave({
        guid: text(draft.guid),
        ...Object.fromEntries(fields.filter((f) => !blank(draft[f.slug])).map((f) => [f.slug, draft[f.slug]])),
      });
    if (!changed.size) return onClose();
    onSave(Object.fromEntries([...changed].map((slug) => [slug, draft[slug]])));
  };

  const sections = SECTIONS.map((s) => ({
    ...s,
    fields: s.slugs.map((slug) => bySlug.get(slug)).filter((f): f is Field => Boolean(f)),
  })).filter((s) => s.fields.length);
  const current = useCurrentSection(sections.map((s) => s.id).join());

  return (
    <>
      {/* `.vf-wrap`: оглавление 220px и форма до 860px; узко — без оглавления. */}
      <div className="grid justify-center gap-8 pt-3 pb-24 min-[1100px]:grid-cols-[220px_minmax(0,860px)]">
        <nav className="sticky top-4 flex flex-col gap-0.5 self-start max-[1099px]:hidden">
          {sections.map((s, at) => (
            <button
              key={s.id}
              type="button"
              onClick={() => document.getElementById(`vf-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              aria-current={current === s.id ? "location" : undefined}
              className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13.5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg aria-[current=location]:bg-surface-hover aria-[current=location]:font-medium aria-[current=location]:text-fg"
            >
              <span className="grid size-5 place-items-center rounded-full text-[11px] text-fg-subtle ring-1 ring-border-strong ring-inset group-aria-[current=location]:bg-accent-solid group-aria-[current=location]:text-accent-fg group-aria-[current=location]:ring-accent-solid">
                {at + 1}
              </span>
              {t(s.title)}
            </button>
          ))}
          <p className={`mt-3.5 flex gap-2 rounded-lg p-2.5 text-xs leading-[1.45] ${CHIP_STYLES.yellow}`}>
            <Icon as={LightbulbIcon} size={14} className="mt-px shrink-0" />
            {t("vacancy.form.hint")}
          </p>
        </nav>

        <div className="min-w-0">
          {sections.map((s) => (
            <FormSection key={s.id} id={`vf-${s.id}`} icon={s.icon} title={t(s.title)} hint={t(s.hint)}>
              {s.fields.map((field) => (
                <FormField
                  key={field.id}
                  field={field}
                  row={draft}
                  tableSlug={VACANCIES}
                  relations={relations}
                  locale={locale}
                  language={language}
                  creating={creating}
                  required={field.slug === "title"}
                  {...(FULL.has(field.slug) ? { wide: true } : {})}
                  {...(field.slug === "skills" ? { placeholder: t("vacancy.form.tagHint") } : {})}
                  onChange={(value, extra) => set(field.slug, value, extra)}
                />
              ))}
              {s.id === "stages" && columns.length > 0 && (
                /* Этапы — воронки, выбранной у вакансии; правятся в её настройках. */
                <ol className="col-span-full flex flex-col gap-1.5">
                  {columns.map((column, at) => (
                    <li key={text(column.guid)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] ring-1 ring-border ring-inset">
                      <span className="w-4 text-right text-xs text-fg-subtle tabular-nums">{at + 1}</span>
                      <i className={`size-2 rounded-full ${stageDot(text(column.color))}`} />
                      {text(column.name)}
                    </li>
                  ))}
                </ol>
              )}
            </FormSection>
          ))}
        </div>
      </div>

      <FormBar
        note={
          <>
            {t(creating ? "vacancy.form.new" : "vacancy.form.title")} ·
            <Icon as={CircleDotIcon} size={12} />
            {t(changed.size ? "vacancy.form.dirty" : "vacancy.form.clean")}
          </>
        }
      >
        <Button variant="secondary" onClick={onClose}>
          {t("action.cancel")}
        </Button>
        <Button onClick={save} disabled={pending}>
          <Icon as={CheckIcon} size={15} />
          {t(creating ? "vacancy.form.create" : "action.save")}
        </Button>
      </FormBar>
    </>
  );
}

/**
 * Секция, которая сейчас на экране, — для оглавления. Текущая — последняя,
 * чей верх поднялся в верхнюю треть экрана: там взгляд, а у самого края
 * секция уже наполовину уехала; докрутили до конца — последняя:
 * короткая нижняя секция до верха не доедет никогда.
 *
 * Слушается прокрутка любого узла (capture): прокручивает не окно,
 * а контейнер страницы, и искать его снизу вверх — лишняя связность.
 */
function useCurrentSection(ids: string) {
  const [current, setCurrent] = useState("");
  useEffect(() => {
    const list = ids.split(",");
    const update = (event?: Event) => {
      const top = window.innerHeight / 3;
      const box = event?.target instanceof HTMLElement ? event.target : null;
      if (box && box.scrollTop > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 2)
        return setCurrent(list.at(-1) ?? "");
      let found = list[0] ?? "";
      for (const id of list) {
        const el = document.getElementById(`vf-${id}`);
        if (el && el.getBoundingClientRect().top <= top) found = id;
      }
      setCurrent(found);
    };
    update();
    document.addEventListener("scroll", update, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", update, { capture: true });
  }, [ids]);
  return current;
}
