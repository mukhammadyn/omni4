import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { BriefcaseIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NewCandidate, VACANCIES } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Новый кандидат — candidate.html?new=1&vac=… прототипа. Открывают
 * со страницы вакансии (вакансия подставлена) или «Создать» в меню
 * «Кандидаты» (вакансию выбирают в форме). Вакансия и пункт меню —
 * в поиске: с них пришли, туда и возвращаемся.
 */
const searchSchema = z.object({
  vac: z.string().catch(""),
  menu: z.string().catch(""),
});

export const Route = createFileRoute("/_authed/_static/candidates/new")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: NewCandidateRoute,
});

/**
 * Крошки: откуда пришли, туда и ведёт первая. Со страницы вакансии —
 * «Вакансия / Новый кандидат», из меню «Кандидаты» — «Кандидаты / …».
 */
function useCrumbs() {
  const { t } = useTranslation();
  const { vac, menu } = Route.useSearch();
  const { item } = useItem(VACANCIES, vac, Boolean(vac));
  const list = useMenu(menu);
  const navigate = useNavigate();

  return [
    ...(vac
      ? [
          {
            icon: BriefcaseIcon,
            label: itemTitle(item, "title") || "…",
            onClick: () => void navigate({ to: "/vacancies/$itemId", params: { itemId: vac }, search: { menu } }),
          },
        ]
      : menu
        ? [
            {
              icon: UsersIcon,
              label: list?.label || "…",
              onClick: () => void navigate({ to: "/m/$menuId", params: { menuId: menu } }),
            },
          ]
        : []),
    { label: t("candidate.new.title") },
  ];
}

function NewCandidateRoute() {
  const { i18n } = useTranslation();
  const { vac, menu } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 max-md:px-3">
        <NewCandidate
          vacancy={vac}
          locale={i18n.language}
          language={language}
          /* Страницы кандидата нет: пришли из меню — обратно к списку,
             с вакансии — в её воронку, где новый уже стоит. */
          onCreated={(vacancy) =>
            void (!vac && menu
              ? navigate({ to: "/m/$menuId", params: { menuId: menu } })
              : navigate({ to: "/vacancies/$itemId", params: { itemId: vacancy }, search: { menu, tab: "funnel" } }))
          }
          onCancel={() => router.history.back()}
        />
      </div>
    </div>
  );
}
