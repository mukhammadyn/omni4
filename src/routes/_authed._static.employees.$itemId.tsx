import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { EMPLOYEES, EmployeePage } from "@/features/hrms";
import { itemTitle, useItem } from "@/features/item";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/**
 * Пункт меню, из которого открыли, — в поиске: вкладки страницы — это
 * вкладки связей ЕГО view (features/hrms, useEmployee), и «назад» ведёт
 * туда же. Вкладка — тоже в поиске: ссылку на «Документы» сотрудника
 * пересылают так же, как на него самого.
 */
const searchSchema = z.object({
  menu: z.string().catch(""),
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_static/employees/$itemId")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: EmployeeRoute,
});

/** Крошки — как у прототипа: «Сотрудники / Имя Фамилия». */
function useCrumbs() {
  const { t } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const { item } = useItem(EMPLOYEES, itemId, true);
  const navigate = useNavigate();

  return [
    {
      icon: UsersIcon,
      label: menu?.label || t("employee.back"),
      /* Без пункта меню в адресе списка, к которому вести, нет. */
      ...(menuId
        ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) }
        : {}),
    },
    { label: itemTitle(item, "full_name") || "…" },
  ];
}

function EmployeeRoute() {
  const { i18n } = useTranslation();
  const { itemId } = Route.useParams();
  const { menu, tab } = Route.useSearch();
  const navigate = useNavigate();
  const { languages, current: language, setCurrent: setLanguage } = useDataLanguages();

  return (
    <EmployeePage
      key={itemId}
      menuId={menu}
      guid={itemId}
      tabId={tab}
      locale={i18n.language}
      language={language}
      languages={languages}
      onLanguage={setLanguage}
      onTab={(next) => void navigate({ to: ".", search: { menu, tab: next }, replace: true })}
      onOpenEmployee={(guid) =>
        void navigate({ to: "/employees/$itemId", params: { itemId: guid }, search: { menu } })
      }
      onBack={() => void navigate({ to: "/m/$menuId", params: { menuId: menu } })}
      onOrgChart={(view) =>
        void navigate({ to: "/m/$menuId", params: { menuId: menu }, search: { view } })
      }
    />
  );
}
