import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { SurveyForm } from "@/features/hrms";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Новый опрос — survey.html?new=1 прототипа; `tpl` — шаблон из вкладки
 * «Шаблоны». Пункт меню — в поиске: крошка и «назад» ведут к его списку.
 */
const searchSchema = z.object({ menu: z.string().catch(""), tpl: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/_authed/_static/surveys/new")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: NewSurveyRoute,
});

function useCrumbs() {
  const { t } = useTranslation();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const navigate = useNavigate();

  return [
    {
      icon: ClipboardListIcon,
      label: menu?.label || t("survey.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: t("survey.form.new") },
  ];
}

function NewSurveyRoute() {
  const { i18n } = useTranslation();
  const { menu, tpl } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 max-md:px-3">
        <SurveyForm
          key={tpl ?? ""}
          guid=""
          template={tpl ?? ""}
          locale={i18n.language}
          language={language}
          onSaved={(guid) => void navigate({ to: "/surveys/$itemId", params: { itemId: guid }, search: { menu }, replace: true })}
          onClose={() => router.history.back()}
        />
      </div>
    </div>
  );
}
