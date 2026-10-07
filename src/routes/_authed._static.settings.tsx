import { Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();

  return [
    /* «Настройки» — к первому доступному разделу. Группа разделов
       своего экрана не имеет — она подпись. */
    {
      icon: SettingsIcon,
      label: t("workspace.settings"),
      onClick: () => void navigate({ to: "/settings", search: {} }),
    },
    ...(tab ? [{ label: t(tab.labelKey) }] : []),
    ...(active ? [{ label: t(active.labelKey) }] : []),
  ];
}

function SettingsRoute() {
  const { t } = useTranslation();

  /* Страница грузится своим чанком (features/settings/index.ts):
     первый заход ждёт его, дальше — из кэша браузера. */
  return (
    <Suspense fallback={<p className="p-6 text-sm text-fg-subtle">{t("common.loading")}</p>}>
      <SettingsPage section={Route.useSearch().section} />
    </Suspense>
  );
}
