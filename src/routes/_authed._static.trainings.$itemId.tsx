import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GraduationCapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TRAININGS, TrainingForm, TrainingPage, useEmployeesMenuId } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его списку. */
const searchSchema = z.object({
  menu: z.string().catch(""),
  /** Форма правки — `training.html?edit=1` прототипа. */
  edit: z.boolean().optional().catch(undefined),
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
  const { menu, edit } = Route.useSearch();
  const navigate = useNavigate();
  const { current: language } = useDataLanguages();
  const employeesMenu = useEmployeesMenuId();
  const view = () => void navigate({ to: ".", search: { menu }, replace: true });

  if (edit)
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-6 max-md:px-3">
          <TrainingForm key={itemId} guid={itemId} locale={i18n.language} language={language} onSaved={view} onClose={view} />
        </div>
      </div>
    );

  return (
    <TrainingPage
      key={itemId}
      guid={itemId}
      locale={i18n.language}
      language={language}
      onEdit={() => void navigate({ to: ".", search: { menu, edit: true }, replace: true })}
      onOpenEmployee={(guid) => void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu: employeesMenu ?? "" } })}
    />
  );
}
