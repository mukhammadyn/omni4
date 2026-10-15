import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { GraduationCapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TrainingForm } from "@/features/hrms";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Новый тренинг — training.html?new=1 прототипа. Пункт меню — в поиске:
 * крошка и «назад» ведут к его списку.
 */
const searchSchema = z.object({ menu: z.string().catch("") });

export const Route = createFileRoute("/_authed/_static/trainings/new")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: NewTrainingRoute,
});

function useCrumbs() {
  const { t } = useTranslation();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const navigate = useNavigate();

  return [
    {
      icon: GraduationCapIcon,
      label: menu?.label || t("training.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: t("training.form.new") },
  ];
}

function NewTrainingRoute() {
  const { i18n } = useTranslation();
  const { menu } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 max-md:px-3">
        <TrainingForm
          guid=""
          locale={i18n.language}
          language={language}
          onSaved={(guid) => void navigate({ to: "/trainings/$itemId", params: { itemId: guid }, search: { menu } })}
          onClose={() => router.history.back()}
        />
      </div>
    </div>
  );
}
