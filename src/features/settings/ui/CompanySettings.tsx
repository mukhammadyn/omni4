import { useTranslation } from "react-i18next";
import { useGlobalRight } from "@/features/auth";
import { CommitInput } from "@/shared/ui/commit-input";
import { useProject, useUpdateProject } from "../api/project";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { ImagePicker } from "./ImagePicker";
import { SectionHeader, SettingRow } from "./parts";
import { RecordFields } from "./RecordSettings";

/**
 * Профиль компании — `#s-profile` прототипа: логотип и название,
 * реквизиты, ниже окружения.
 *
 * Собран из трёх источников, и это не случайность, а то, где что
 * хранится: логотип и название — у проекта ucode (их же показывает
 * шапка сайдбара), реквизиты — у юрлица «Основное» из Ядра (их
 * подставляют счета и договоры), окружения — у проекта ucode.
 *
 * Всё правится на месте и уезжает сразу: название — по уходу из поля,
 * логотип — по выбору файла, реквизиты — как поле карточки. Кнопки
 * «Сохранить» нет ни у одного блока — иначе одни строки сохранялись
 * бы сразу, а другие ждали кнопку.
 *
 * Права — по блокам: проект правит `project_settings_button`, окружения
 * — `environments_button`, реквизиты — права роли на таблицу юрлиц.
 */
export function CompanySettings() {
  const { t } = useTranslation();
  const canProject = useGlobalRight("project_settings_button");
  const canEnvironments = useGlobalRight("environments_button");
  const { project } = useProject();
  // Языков здесь не правят — справочник им не нужен.
  const update = useUpdateProject(NO_LANGUAGES);

  return (
    <>
      <SectionHeader title={t("core.company")} hint={t("core.companyHint")} />

      {canProject && project && (
        <>
          <SettingRow label={t("settings.logo")} hint={t("settings.logoHint")}>
            <ImagePicker
              value={project.logo}
              letter={(project.title || project.id).slice(0, 1).toUpperCase()}
              label={t("settings.logo")}
              onChange={(logo) => update.mutate({ project, draft: { logo } })}
            />
          </SettingRow>

          <SettingRow label={t("settings.projectName")} hint={t("settings.projectNameHint")}>
            <CommitInput
              value={project.title}
              label={t("settings.projectName")}
              onCommit={(title) => update.mutate({ project, draft: { title } })}
            />
          </SettingRow>
        </>
      )}

      <RecordFields
        table="legal_entities"
        pick="is_default"
        fields={[
          "name",
          "inn",
          "tax_regime",
          "legal_address",
          "director_name",
          "bank_name",
          "bank_account",
          "bank_mfo",
        ]}
      />

      {/* `.dx-h3` прототипа: блок того же раздела, а не свой раздел. */}
      {canEnvironments && (
        <div className="mt-7">
          <EnvironmentSettings />
        </div>
      )}
    </>
  );
}

const NO_LANGUAGES: never[] = [];
