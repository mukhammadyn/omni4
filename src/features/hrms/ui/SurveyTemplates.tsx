import {
  ActivityIcon,
  ArrowRightIcon,
  Building2Icon,
  DoorOpenIcon,
  FilePlusIcon,
  GaugeIcon,
  GraduationCapIcon,
  SproutIcon,
  VoteIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { optionOf, useTableSchema } from "@/features/table";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { SURVEYS } from "../api/survey";
import { parseDefinition, questions } from "../model/survey";
import { SURVEY_TEMPLATES } from "../model/survey-templates";

/** Тип view экрана (FIXED_VIEW_TYPES). */
export const SURVEY_TEMPLATES_VIEW = "SURVEY_TEMPLATES";

/** Значки шаблонов — те же, что в прототипе. */
const ICONS: Record<string, LucideIcon> = {
  blank: FilePlusIcon,
  enps: GaugeIcon,
  pulse: ActivityIcon,
  work: Building2Icon,
  trn: GraduationCapIcon,
  onb: SproutIcon,
  exit: DoorOpenIcon,
  party: VoteIcon,
};

/**
 * «Шаблоны» опросов — `#tpl` прототипа (surveys.html, tplView): карточки
 * шаблонов, «Использовать» открывает форму нового опроса с вопросами
 * шаблона — запись появится по «Сохранить».
 * Сделан под `hr_surveys` (FIXED_VIEW_TYPES).
 */
export function SurveyTemplates({ onUse }: { onUse: (template: string) => void }) {
  const { t } = useTranslation();
  const can = useTablePermissions()(SURVEYS);
  const { schema } = useTableSchema(SURVEYS);
  const typeField = schema.fields.find((field) => field.slug === "type");

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pt-3.5 pb-6">
      <div className="mb-4 flex flex-col gap-0.5">
        <b className="text-[15px]">{t("survey.templates")}</b>
        <span className="text-sm text-fg-subtle">{t("survey.templatesHint")}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {SURVEY_TEMPLATES.map((template) => {
          const count = questions(parseDefinition(template.definition)).length;
          const type = typeField ? optionOf(typeField, template.type)?.label : "";
          return (
            <button
              key={template.key}
              type="button"
              disabled={!can.write}
              onClick={() => onUse(template.key)}
              className="group flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover disabled:cursor-default disabled:opacity-60"
            >
              <span className="mb-1 grid size-9 place-items-center rounded-lg bg-accent-subtle text-accent-text">
                <Icon as={ICONS[template.key] ?? FilePlusIcon} size={18} />
              </span>
              <b className="text-sm">{template.title}</b>
              <small className="text-xs text-fg-muted">{template.description}</small>
              <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {type && <Chip>{type}</Chip>}
                {count > 0 && <span className="whitespace-nowrap text-fg-subtle">{t("survey.questionCount", { count })}</span>}
              </span>
              {can.write && (
                <span className="mt-auto flex justify-end border-t border-border pt-2.5 text-xs text-accent-text">
                  <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {t("survey.use")}
                    <Icon as={ArrowRightIcon} size={13} />
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
