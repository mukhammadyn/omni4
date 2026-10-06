import { createFileRoute } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { SettingsPage, useSettingsSections } from "@/features/settings";

/**
 * Раздел — в поиске, а не в пути: так один маршрут, а ссылка «Настройки»
 * в сайдбаре горит на любом разделе (сравнение без поиска). Без раздела —
 * первый доступный роли.
 */
const searchSchema = z.object({ section: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/_authed/_static/settings")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: SettingsRoute,
});

/** Крошки — как у прототипа: «Настройки / вкладка / раздел». */
function useCrumbs() {
  const { t } = useTranslation();
  const { section } = Route.useSearch();
  const { tab, active } = useSettingsSections(section);

  return [
    { icon: SettingsIcon, label: t("workspace.settings") },
    ...(tab ? [{ label: t(tab.labelKey) }] : []),
    ...(active ? [{ label: t(active.labelKey) }] : []),
  ];
}

function SettingsRoute() {
  return <SettingsPage section={Route.useSearch().section} />;
}
