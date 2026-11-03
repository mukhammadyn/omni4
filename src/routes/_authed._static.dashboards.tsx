import {useCallback} from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { DashboardsPage } from "@/features/dashboard";

/**
 * Дашборды проекта (ADR-0013). Открытый дашборд и модуль, из которого
 * пришли, — в поиске: ссылка на дашборд пересылается как есть.
 */
const searchSchema = z.object({
  manage: z.boolean().optional().catch(undefined),
  d: z.string().optional().catch(undefined),
  module: z.string().optional().catch(undefined),
  /** Общие фильтры по ключу фильтра: «period», слаг таблицы. */
  f: z.record(z.string(), z.array(z.string())).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_static/dashboards")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: DashboardsRoute,
});

function useCrumbs() {
  const { t } = useTranslation();
  return [{ icon: LayoutDashboardIcon, label: t("dashboard.title") }];
}

function DashboardsRoute() {
  const { d, module, f, manage } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const closeManage=useCallback(()=>void navigate({search:prev=>({...prev,manage:undefined}),replace:true}),[navigate]);
  return (
    <DashboardsPage
      manage={Boolean(manage)}
      onManageClose={closeManage}
      dashboardId={d ?? ""}
      moduleId={module ?? ""}
      values={f ?? {}}
      onOpen={(id) => void navigate({ search: (prev) => ({ ...prev, d: id,manage:undefined }) })}
      onValues={(values) =>
        void navigate({ search: (prev) => ({ ...prev, f: Object.keys(values).length ? values : undefined }), replace: true })
      }
    />
  );
}
