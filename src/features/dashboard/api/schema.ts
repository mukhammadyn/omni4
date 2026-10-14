import { useQueries, useQuery } from "@tanstack/react-query";
import { useTablePermission, useTablePermissions } from "@/features/auth";
import { applyRights, fieldRights, type Layout } from "@/features/item";
import { toField, useTableSchema, type FieldsResponseDto } from "@/features/table";
import { api } from "@/shared/api/client";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";

/** Role layout is the existing supported source of field rights (ADR-0013). */
export function useDashboardSchema(slug: string | undefined, menuId: string) {
  const can = useTablePermission(slug);
  const permissionOf = useTablePermissions();
  const session = useSession();
  const env = session.getEnvironmentId() ?? "";
  const account = JSON.stringify([session.getProjectId(), session.getUserId(), session.getProfile()?.role, session.getPermissions()]);
  const layout = useQuery({
    queryKey: keys.layouts.dashboard(env, slug ?? "", menuId, account),
    queryFn: () => api.get<Layout>(`/v2/collections/${slug}/layout/${menuId}`),
    enabled: Boolean(slug && menuId && can.read),
    staleTime: 5 * 60_000,
  });
  const rights = fieldRights(layout.data);
  const source = useTableSchema(can.read ? slug : undefined, undefined, { field: (field) => layout.isSuccess && !rights.hidden.has(field.slug), table: (table) => permissionOf(table).read });
  const fields = applyRights(source.schema.fields, rights).filter((field) => {
    if (field.type === "PASSWORD" || field.type === "BUTTON") return false;
    const related = source.schema.relations.find((relation) => relation.id === field.relationId);
    return !related?.toSlug || permissionOf(related.toSlug).read;
  });
  const relationIds = new Set(fields.map((field) => field.relationId));
  const relatedTables = [...new Set(source.schema.relations.filter((relation) => relationIds.has(relation.id)).map((relation) => relation.toSlug))].filter(Boolean);
  const related = useQueries({ queries: relatedTables.map((table) => ({
    queryKey: keys.layouts.dashboard(env, table, menuId, account),
    queryFn: () => api.get<Layout>(`/v2/collections/${table}/layout/${menuId}`),
    enabled: Boolean(menuId && can.read && layout.isSuccess), staleTime: 5 * 60_000,
  })) });
  const relatedHidden = Object.fromEntries(relatedTables.map((table, index) => [table, fieldRights(related[index]?.data).hidden]));
  const relatedSchemas = useQueries({ queries: relatedTables.map((table) => ({
    queryKey: keys.tables.fields(table), queryFn: () => api.get<FieldsResponseDto>(`/v2/fields/${table}`),
    enabled: Boolean(menuId && can.read && layout.isSuccess), staleTime: 5 * 60_000,
  })) });
  const relatedFields = Object.fromEntries(relatedTables.map((table, index) => [table, (relatedSchemas[index]?.data?.fields ?? []).map(toField).filter((field) => field.type !== "PASSWORD" && !relatedHidden[table]?.has(field.slug))]));
  const relations = source.schema.relations.filter((relation) => permissionOf(relation.toSlug).read).map((relation) => ({ ...relation, viewFields: relation.viewFields.filter((field) => field.type !== "PASSWORD" && !relatedHidden[relation.toSlug]?.has(field.slug)) }));
  const relatedError = [...related, ...relatedSchemas].find((result) => result.error)?.error;
  return {
    schema: { ...source.schema, fields, relations }, can, relatedHidden, relatedFields,
    ready: !slug || Boolean(can.read && menuId && layout.isSuccess && !source.isLoading && !source.error && [...related, ...relatedSchemas].every((result) => result.isSuccess)),
    loading: Boolean(slug && can.read && (source.isLoading || layout.isLoading || [...related, ...relatedSchemas].some((result) => result.isLoading))),
    error: source.error ?? (layout.error instanceof Error ? layout.error.message : relatedError instanceof Error ? relatedError.message : null),
    denied: !can.read,
    retry: () => { source.refetch(); void layout.refetch(); [...related, ...relatedSchemas].forEach((result) => void result.refetch()); },
  };
}
