import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TimerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TIMESHEETS, TimesheetDocPage, useEmployeesMenuId } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Пункт меню, из которого открыли, — в поиске: «назад» ведёт к его списку. */
const searchSchema = z.object({
  menu: z.string().catch(""),
  /** Вкладка: пусто — «Обзор», `grid` — «Табель по дням». */
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_static/timesheets/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: TimesheetRoute,
});

/** Крошки — как у прототипа: «Табели / Табель · Сентябрь 2026 · АУП». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(TIMESHEETS, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: TimerIcon,
      label: menu?.label || t("timesheets.list"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: itemTitle(item, "title") || "…" },
  ];
}

function TimesheetRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu, tab } = Route.useSearch();
  const navigate = useNavigate();
  const { current: language } = useDataLanguages();
  const employeesMenu = useEmployeesMenuId();

  return (
    <TimesheetDocPage
      key={itemId}
      guid={itemId}
      locale={i18n.language}
      language={language}
      tab={tab}
      onOpen={(next) => void navigate({ to: "/timesheets/$itemId", params: { itemId: next }, search: { menu, tab } })}
      onTab={(next) => void navigate({ to: ".", search: { menu, tab: next }, replace: true })}
      onOpenEmployee={(guid) =>
        void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu: employeesMenu ?? "", tab: "attendance" } })
      }
    />
  );
}
