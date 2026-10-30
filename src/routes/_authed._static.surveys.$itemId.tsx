import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { SURVEYS, SurveyForm, SurveyPage, useEmployeesMenuId } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его списку. */
const searchSchema = z.object({
  menu: z.string().catch(""),
  /** Форма правки — `survey.html?edit=1` прототипа. */
  edit: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_static/surveys/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: SurveyRoute,
});

/** Крошки — как у прототипа: «Опросы / Название». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(SURVEYS, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: ClipboardListIcon,
      label: menu?.label || t("survey.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: itemTitle(item, "title") || "…" },
  ];
}

function SurveyRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu, edit } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();
  const employeesMenu = useEmployeesMenuId();
  const view = () => void navigate({ to: ".", search: { menu }, replace: true });

  if (edit)
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-6 max-md:px-3">
          <SurveyForm key={itemId} guid={itemId} locale={i18n.language} language={language} onSaved={view} onClose={view} />
        </div>
      </div>
    );

  return (
    <SurveyPage
      key={itemId}
      guid={itemId}
      locale={i18n.language}
      language={language}
      onEdit={() => void navigate({ to: ".", search: { menu, edit: true }, replace: true })}
      onDeleted={() => (menu ? void navigate({ to: "/m/$menuId", params: { menuId: menu } }) : router.history.back())}
      onOpenEmployee={(guid) => void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu: employeesMenu ?? "" } })}
    />
  );
}
