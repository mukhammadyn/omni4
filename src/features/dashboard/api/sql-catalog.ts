import { useQuery } from "@tanstack/react-query";
import { readSqlSchema, type SchemaMap } from "@/features/settings";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import type { DatasetTable } from "../model/datasets";

/** Suggestions reuse SQL-console metadata; they do not grant or enforce data access. */
export function sqlCatalog(schema: SchemaMap | undefined): DatasetTable[] {
  return (schema?.tables ?? []).filter((table) => table.group !== "platform").map((table) => ({
    slug: table.slug, label: table.label,
    fields: table.fields.filter((field) => !["PASSWORD", "BUTTON", "FORMULA", "FILE", "PHOTO"].includes(field.type)).map((field) => {
      const relation = schema?.links.find((link) => link.from === table.slug && link.field === field.slug);
      return { slug: field.slug, label: field.slug, type: field.type, ...(relation ? { target: relation.to, joinable: relation.type === "Many2One" } : {}) };
    }),
  }));
}

export function useSqlCatalog(menuId: string, enabled = true) {
  const session = useSession();
  const scope = JSON.stringify([session.getProjectId(), session.getEnvironmentId(), session.getUserId(), session.getVersion(), menuId]);
  const query = useQuery({
    queryKey: keys.dashboardSql(scope),
    queryFn: ({ signal }) => readSqlSchema({ signal, timeout: 15000, skipAuthRefresh: true }),
    enabled: Boolean(enabled && menuId && session.getAccess() && session.getProjectId() && session.getEnvironmentId()), staleTime: 0, retry: false,
  });
  return { tables: query.error ? [] : sqlCatalog(query.data), checking: query.isPending, error: query.error };
}
