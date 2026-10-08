import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalRight } from "@/features/auth";
import { useDataLanguages } from "@/features/workspace";
import { LOCALE_NAMES, LOCALES, setLocale, type Locale } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dropdown } from "@/shared/ui/dropdown";
import { Input } from "@/shared/ui/input";
import { LanguageTabs } from "@/shared/ui/language-tabs";
import {
  useLanguageOptions,
  useProject,
  useUpdateProject,
  type LanguageOption,
} from "../api/project";
import { CURRENCY_RATES } from "./directories";
import { DirectorySettings } from "./DirectorySettings";
import { GroupTitle, SectionHeader, SettingRow } from "./parts";
import { RecordFields } from "./RecordSettings";

/**
 * Локализация — `#s-locale` прототипа: язык интерфейса, формат даты,
 * валюта, НДС. Ниже — языки данных проекта и курсы валют.
 *
 * Формат даты, валюта и НДС — из `org_settings` Ядра: это истина
 * компании, её читают функции расчёта. У проекта ucode валюта своя,
 * но с экрана убрана — два поля об одном расходились бы молча
 * (docs/STATUS.md). Часового пояса здесь нет: он личный и живёт
 * в «Профиле» (ADR-0014).
 *
 * Язык интерфейса — личный: он у каждого свой и на сервер не уезжает.
 * Стоит здесь, потому что здесь его ищут; тот же выбор — в меню
 * пространства.
 */
export function LocaleSettings() {
  const { t, i18n } = useTranslation();
  const canProject = useGlobalRight("project_settings_button");
  const current = (LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : LOCALES[0];

  return (
    <>
      <SectionHeader title={t("core.locale")} hint={t("core.localeHint")} />

      <SettingRow label={t("core.interfaceLanguage")} hint={t("core.interfaceLanguageHint")}>
        <div className="w-full">
          <Dropdown
            value={current}
            ariaLabel={t("core.interfaceLanguage")}
            items={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
            onChange={(code) => setLocale(code as Locale)}
          />
        </div>
      </SettingRow>

      <RecordFields
        table="org_settings"
        fields={["date_format", "base_currency", "vat_percent"]}
      />

      {canProject && <DataLanguages />}

      <DirectorySettings directory={CURRENCY_RATES} embedded />
    </>
  );
}

/**
 * Языки данных проекта — [[Data Language]]: на них размечены подписи
 * полей, имена view и мультиязычные колонки.
 *
 * Единственный блок раздела с кнопкой «Сохранить», и это намеренно:
 * убрать язык значит осиротить все подписи с его кодом, и случайный
 * щелчок по флажку не должен уезжать сразу.
 *
 * Рядом — выбор языка, на котором данные ПОКАЗАНЫ: он личный и в проект
 * не уезжает, но стоит рядом с набором, иначе его ищут в двух местах.
 */
function DataLanguages() {
  const { t } = useTranslation();
  const { project } = useProject();
  const { languages } = useLanguageOptions();
  const update = useUpdateProject(languages);
  const { languages: dataLanguages, current, setCurrent } = useDataLanguages();

  const [selected, setSelected] = useState<string[]>([]);
  /* Языков в справочнике под две сотни — без поиска это стена флажков. */
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (project) setSelected(project.languageIds);
  }, [project]);

  if (!project) return null;

  const changed =
    selected.length !== project.languageIds.length ||
    selected.some((id) => !project.languageIds.includes(id));

  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));

  return (
    <>
      {dataLanguages.length > 1 && (
        <SettingRow label={t("settings.shownLanguage")} hint={t("settings.shownLanguageHint")}>
          <LanguageTabs languages={dataLanguages} value={current} onChange={setCurrent} />
        </SettingRow>
      )}

      <GroupTitle title={t("settings.dataLanguages")} hint={t("settings.dataLanguagesHint")} />
      <div className="flex flex-col gap-2 pt-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.searchLanguage")}
          aria-label={t("settings.searchLanguage")}
        />

        {/* Выбранные всегда сверху и всегда видны: иначе поиск прячет
            то, что человек только что отметил. */}
        <div className="grid h-56 auto-rows-min gap-1 overflow-y-auto rounded-md border border-border p-2">
          {matching(languages, selected, query).map((language) => (
            <label
              key={language.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-hover"
            >
              <Checkbox checked={selected.includes(language.id)} onChange={() => toggle(language.id)} />
              <span className="min-w-0 truncate text-sm text-fg">
                {language.native_name || language.name}
              </span>
              <span className="ml-auto shrink-0 text-2xs text-fg-subtle">{language.short_name}</span>
            </label>
          ))}
        </div>

        {changed && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelected(project.languageIds)}>
              {t("action.cancel")}
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() => update.mutate({ project, draft: { languageIds: selected } })}
            >
              {t("action.save")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Языки, подходящие под поиск. Отмеченные показываются всегда и первыми:
 * список из двух сотен строк иначе прячет собственный выбор.
 */
function matching(
  languages: LanguageOption[],
  selected: string[],
  query: string,
): LanguageOption[] {
  const needle = query.trim().toLowerCase();

  const chosen = languages.filter((language) => selected.includes(language.id));
  const rest = languages.filter(
    (language) =>
      !selected.includes(language.id) &&
      (!needle ||
        language.name.toLowerCase().includes(needle) ||
        language.native_name.toLowerCase().includes(needle) ||
        language.short_name.toLowerCase().includes(needle)),
  );

  return [...chosen, ...(needle ? rest : rest.slice(0, VISIBLE_LANGUAGES))];
}

/**
 * Сколько языков показать без поиска. Полный справочник — 184 строки,
 * и прокручивать их до нужного дольше, чем набрать две буквы.
 */
const VISIBLE_LANGUAGES = 30;
