import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalRight } from "@/features/auth";
import { useUi } from "@/shared/lib/ui-store";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Tabs } from "@/shared/ui/tabs";
import { useIconCollections, useProject, useUpdateProject } from "../api/project";
import { GroupTitle, SectionHeader, SettingRow } from "./parts";

/**
 * Брендинг — `#s-brand` прототипа: тема и то, как выглядят пункты меню.
 *
 * Тема — личная: у нас она живёт в браузере человека (ui-store), общей
 * темы пространства бэкенд не хранит. Подсказка говорит это прямо,
 * иначе админ решит, что сменил тему всем.
 *
 * Акцентного цвета и компактного режима прототипа нет: хранить их негде,
 * а переключатель, который ничего не меняет у других, — обещание.
 */
export function BrandSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useUi();
  const canProject = useGlobalRight("project_settings_button");
  const { project } = useProject();
  const update = useUpdateProject(NO_LANGUAGES);

  return (
    <>
      <SectionHeader title={t("core.brand")} hint={t("core.brandHint")} />

      <SettingRow label={t("sidebar.theme")} hint={t("core.themeHint")}>
        <Tabs
          variant="segment"
          tabs={[
            { id: "light", label: t("theme.light") },
            { id: "dark", label: t("theme.dark") },
            { id: "system", label: t("theme.system") },
          ]}
          activeId={theme}
          onSelect={(next) => setTheme(next as typeof theme)}
        />
      </SettingRow>

      {/* Наборы уезжают сразу, по флажку: в отличие от языков данных,
          снятый набор ничего не ломает — уже выбранные иконки остаются. */}
      {canProject && project && (
        <IconCategories
          value={project.iconCategories}
          onChange={(iconCategories) => update.mutate({ project, draft: { iconCategories } })}
        />
      )}
    </>
  );
}

const NO_LANGUAGES: never[] = [];

/**
 * Наборы значков, из которых выбирают иконку пункта меню.
 *
 * Список приходит не от бэкенда, а прямо из iconify
 * (api.iconify.design/collections) — оттуда же берутся и сами значки.
 * Так это устроено и в старой админке: свой справочник наборов ucode
 * не держит.
 *
 * Значение — `<префикс>#<имя набора>`: префикс нужен запросу значков,
 * имя — человеку в списке. Формат не наш, его читает старая админка,
 * и менять его значит разойтись с ней на одних и тех же данных.
 *
 * Запрос уходит один раз на открытие настроек и живёт в кэше сутки:
 * набор коллекций iconify меняется несколько раз в год.
 */
function IconCategories({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const { collections, isLoading } = useIconCollections();
  const [query, setQuery] = useState("");

  const chosen = new Set(value);
  const shown = collections
    .filter((item) => chosen.has(item.value) || matches(item.label, query))
    .slice(0, 200);

  return (
    <>
      <GroupTitle title={t("settings.iconCategories")} hint={t("settings.iconCategoriesHint")} />
      <div className="flex flex-col gap-2 pt-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.searchIconCategory")}
          aria-label={t("settings.searchIconCategory")}
        />

        <div className="grid h-56 auto-rows-min gap-1 overflow-y-auto rounded-md border border-border p-2">
          {isLoading && <p className="p-1 text-xs text-fg-subtle">{t("common.loading")}</p>}

          {shown.map((item) => (
            <label
              key={item.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-hover"
            >
              <Checkbox
                checked={chosen.has(item.value)}
                onChange={() =>
                  onChange(
                    chosen.has(item.value)
                      ? value.filter((current) => current !== item.value)
                      : [...value, item.value],
                  )
                }
              />
              <span className="min-w-0 truncate text-sm text-fg">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function matches(label: string, query: string): boolean {
  return !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase());
}
