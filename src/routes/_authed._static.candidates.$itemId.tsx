import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { CANDIDATES, CandidatePage, useEmployeesMenuId } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его списку. */
const searchSchema = z.object({ menu: z.string().catch("") });

export const Route = createFileRoute("/_authed/_static/candidates/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: CandidateRoute,
});

/** Крошки — как у прототипа: «Кандидаты / Имя». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(CANDIDATES, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: UsersIcon,
      label: menu?.label || t("candidate.page.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: itemTitle(item, "full_name") || "…" },
  ];
}

function CandidateRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { current: language } = useDataLanguages();
  /* Страница сотрудника берёт вкладки из своего пункта меню. */
  const employeesMenu = useEmployeesMenuId();

  return (
    <CandidatePage
      key={itemId}
      guid={itemId}
      locale={i18n.language}
      language={language}
      onOpenVacancy={(guid) =>
        void navigate({ to: "/vacancies/$itemId", params: { itemId: guid }, search: { menu: "", tab: "funnel" } })
      }
      onOpenEmployee={(guid) =>
        void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu: employeesMenu ?? "" } })
      }
    />
  );
}
