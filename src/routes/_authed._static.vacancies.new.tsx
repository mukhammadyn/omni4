import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { BriefcaseIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NewVacancy } from "@/features/hrms";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Новая вакансия — vacancy.html?new=1 прототипа. Пункт меню — в поиске:
 * крошка и «назад» ведут к его списку.
 */
const searchSchema = z.object({ menu: z.string().catch("") });

export const Route = createFileRoute("/_authed/_static/vacancies/new")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: NewVacancyRoute,
});

function useCrumbs() {
  const { t } = useTranslation();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const navigate = useNavigate();

  return [
    {
      icon: BriefcaseIcon,
      label: menu?.label || t("vacancy.page.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: t("vacancy.form.new") },
  ];
}

function NewVacancyRoute() {
  const { i18n } = useTranslation();
  const { menu } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 max-md:px-3">
        <NewVacancy
          locale={i18n.language}
          language={language}
          onCreated={(guid) => void navigate({ to: "/vacancies/$itemId", params: { itemId: guid }, search: { menu } })}
          onCancel={() => router.history.back()}
        />
      </div>
    </div>
  );
}
