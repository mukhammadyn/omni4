import { Fragment } from "react";
import { Link, Outlet, createFileRoute, useMatches } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CopilotButton } from "@/features/copilot";
import { useWorkspaceTitle } from "@/features/settings";
import { SidebarToggleButton, TopbarActions, WorkspaceTile } from "@/features/sidebar";
import { Icon } from "@/shared/ui/icon";

/**
 * Статичные страницы — экраны приложения, а не пункты меню проекта:
 * настройки, дальше — свои экраны модулей. Layout без пути (`_static`):
 * адрес страницы от него не меняется, `/settings` остаётся `/settings`.
 *
 * Здесь — всё общее: появление страницы и верхняя полоса (`.topbar`
 * прототипа: кнопка сайдбара, крошки, помощник, действия рабочего
 * места). Страница объявляет только свои крошки и тело:
 *
 *   createFileRoute("/_authed/_static/<имя>")({
 *     staticData: { useCrumbs: () => [{ icon: XIcon, label: t("…") }] },
 *     component: …,
 *   })
 *
 * Пункт меню (`/m/$menuId`) сюда не входит: его полоса зависит от
 * данных пункта (число записей, загрузка) и у микрофронтенда прячется.
 */
export const Route = createFileRoute("/_authed/_static")({ component: StaticLayout });

/** Звено крошек после имени проекта. Кликабельных нет: путь — не меню. */
export type Crumb = { label: string; icon?: LucideIcon };

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * Крошки страницы. Хук, а не массив: подписи переводятся и бывают
     * от состояния (открытый раздел настроек). Зовётся в своём
     * компоненте с `key` по маршруту — смена страницы не меняет
     * порядок хуков.
     */
    useCrumbs?: () => Crumb[];
  }
}

function StaticLayout() {
  const { t } = useTranslation();
  const workspace = useWorkspaceTitle();
  const leaf = useMatches({ select: (matches) => matches[matches.length - 1] });
  const useCrumbs = leaf?.staticData.useCrumbs;

  return (
    /* key — чтобы появление проигрывалось на каждую страницу, а не один
       раз за жизнь layout: он между страницами остаётся тем же. */
    <div key={leaf?.routeId} className="animate-page flex h-full flex-col">
      <header className="flex h-header shrink-0 items-center gap-2 px-3">
        <SidebarToggleButton />
        <nav
          aria-label={t("topbar.breadcrumbs")}
          className="flex min-w-0 flex-1 items-center gap-0.5 text-sm"
        >
          <Link
            to="/"
            className="flex min-w-0 shrink items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-fg transition-colors hover:bg-surface-hover"
          >
            <WorkspaceTile
              title={workspace.title}
              image={workspace.logo}
              brand={workspace.brand}
              size="sm"
            />
            <span className="truncate">{workspace.title}</span>
          </Link>
          {useCrumbs && <Crumbs key={leaf.routeId} useCrumbs={useCrumbs} />}
        </nav>

        <CopilotButton />
        <TopbarActions />
      </header>

      <Outlet />
    </div>
  );
}

function Crumbs({ useCrumbs }: { useCrumbs: () => Crumb[] }) {
  return useCrumbs().map((crumb, index) => (
    <Fragment key={index}>
      <span className="text-fg-subtle">/</span>
      {/* Последнее звено сжимается первым: длинное имя раздела
          не должно выдавливать «Настройки» за край. */}
      <span className="flex min-w-0 shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-fg last:shrink">
        {crumb.icon && <Icon as={crumb.icon} className="shrink-0" />}
        <span className="truncate">{crumb.label}</span>
      </span>
    </Fragment>
  ));
}
