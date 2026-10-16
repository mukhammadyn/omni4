import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { readSqlSchema, type SchemaMap } from "@/features/settings";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import type { DatasetTable } from "../model/datasets";

/** Suggestions reuse SQL-console metadata; they do not grant or enforce data access. */
export function sqlCatalog(schema: SchemaMap | undefined, language = "en"): DatasetTable[] {
  const tableName = language.startsWith("ru") ? "Таблица" : language.startsWith("uz") ? "Jadval" : "Table", fieldName = language.startsWith("ru") ? "Поле" : language.startsWith("uz") ? "Maydon" : "Field";
  return (schema?.tables ?? []).filter((table) => table.group !== "platform").map((table, index) => ({
    slug: table.slug, label: table.label?.trim() && table.label !== table.slug ? table.label : `${tableName} ${index + 1}`,
    fields: table.fields.filter((field) => !["PASSWORD", "BUTTON", "FORMULA", "FILE", "PHOTO"].includes(field.type)).map((field) => {
      const relation = schema?.links.find((link) => link.from === table.slug && link.field === field.slug);
      return { slug: field.slug, label: field.label?.trim() && field.label !== field.slug ? field.label : `${fieldName} ${table.fields.indexOf(field) + 1}`, type: field.type, ...(relation ? { target: relation.to, joinable: relation.type === "Many2One" } : {}) };
    }),
  }));
}

export function useSqlCatalog(menuId: string, enabled = true) {
  const session = useSession(), { i18n } = useTranslation();
  const scope = JSON.stringify([session.getProjectId(), session.getEnvironmentId(), session.getUserId(), session.getVersion(), menuId]);
  const query = useQuery({
    queryKey: keys.dashboardSql(scope),
    queryFn: ({ signal }) => readSqlSchema({ signal, timeout: 15000, skipAuthRefresh: true }),
    enabled: Boolean(enabled && menuId && session.getAccess() && session.getProjectId() && session.getEnvironmentId()), staleTime: 0, retry: false,
  });
  const tables = useMemo(() => query.error ? [] : sqlCatalog(query.data, i18n.language), [query.data, query.error, i18n.language]);
  return { tables, checking: query.isPending, error: query.error };
}
