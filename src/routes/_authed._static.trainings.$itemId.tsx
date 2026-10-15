import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GraduationCapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TRAININGS, TrainingPage, useEmployeesMenuId } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его списку. */
const searchSchema = z.object({
  menu: z.string().catch(""),
});

export const Route = createFileRoute("/_authed/_static/trainings/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: TrainingRoute,
});

/** Крошки — как у прототипа: «Тренинги / Название». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(TRAININGS, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: GraduationCapIcon,
      label: menu?.label || t("training.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: itemTitle(item, "title") || "…" },
  ];
}

function TrainingRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { current: language } = useDataLanguages();
  const employeesMenu = useEmployeesMenuId();

  return (
    <TrainingPage
      key={itemId}
      guid={itemId}
      locale={i18n.language}
      language={language}
      // ponytail: форма правки — следующий этап; пока «Изменить» никуда не ведёт.
      onEdit={() => {}}
      onOpenEmployee={(guid) => void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu: employeesMenu ?? "" } })}
    />
  );
}
