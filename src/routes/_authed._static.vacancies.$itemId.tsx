import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BriefcaseIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { VACANCIES, VacancyPage } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его
 * списку. Вкладка — тоже: ссылку на «Кандидатов» вакансии пересылают
 * так же, как на неё саму.
 */
const searchSchema = z.object({
  menu: z.string().catch(""),
  tab: z.enum(["funnel", "cands", "info", "edit"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_static/vacancies/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: VacancyRoute,
});

/** Крошки — как у прототипа: «Вакансии / Название». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(VACANCIES, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: BriefcaseIcon,
      label: menu?.label || t("vacancy.page.back"),
      ...(menuId
        ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) }
        : {}),
    },
    { label: itemTitle(item, "title") || "…" },
  ];
}

function VacancyRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu, tab } = Route.useSearch();
  const navigate = useNavigate();
  const { current: language } = useDataLanguages();

  return (
    <VacancyPage
      key={itemId}
      guid={itemId}
      tab={tab ?? "funnel"}
      locale={i18n.language}
      language={language}
      onTab={(next) => void navigate({ to: ".", search: { menu, tab: next }, replace: true })}
      onAddCandidate={() => void navigate({ to: "/candidates/new", search: { vac: itemId, menu } })}
    />
  );
}
