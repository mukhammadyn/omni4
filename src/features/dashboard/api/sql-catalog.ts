import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import type { DatasetTable } from "../model/datasets";
import { queryCapability } from "../model/query-capability";

/** Normalize the safe SQL schema returned by the dashboard capability endpoint. */
export function sqlCatalog(value: unknown): DatasetTable[] {
  if (!value || typeof value !== "object") return [];
  const tables = (value as Record<string, unknown>)["tables"];
  if (!Array.isArray(tables)) return [];
  return tables.flatMap((raw): DatasetTable[] => {
    if (!raw || typeof raw !== "object") return [];
    const table = raw as Record<string, unknown>;
    if (typeof table["slug"] !== "string" || !Array.isArray(table["fields"])) return [];
    const fields = table["fields"].flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const field = raw as Record<string, unknown>;
      if (typeof field["key"] !== "string" || typeof field["type"] !== "string") return [];
      const type = ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(field["type"]) ? "NUMBER"
        : field["type"] === "uuid" ? "UUID"
        : field["type"] === "bool" ? "CHECKBOX"
        : ["date", "timestamp", "timestamptz"].includes(field["type"]) ? "DATE_TIME" : "SINGLE_LINE";
      return [{ slug: field["key"], label: field["key"], type }];
    });
    return [{ slug: table["slug"], label: table["slug"], fields }];
  });
}

export function useSqlCatalog(menuId: string, enabled = true) {
  const session = useSession();
  const scope = JSON.stringify([session.getProjectId(), session.getEnvironmentId(), session.getUserId(), session.getVersion(), menuId]);
  const query = useQuery({
    queryKey: keys.dashboardSql(scope),
    queryFn: ({ signal }) => api.get<unknown>("/v2/dashboard/query/capabilities", { params: { menu_id: menuId }, signal, timeout: 6500 }),
    enabled: Boolean(enabled && menuId && session.getAccess()), staleTime: 0, retry: false,
  });
  const gate = queryCapability(query.data, session.getProjectId(), session.getEnvironmentId(), menuId);
  return { ...gate, tables: gate.enabled && !query.error ? sqlCatalog(query.data) : [], checking: query.isPending, error: query.error };
}
