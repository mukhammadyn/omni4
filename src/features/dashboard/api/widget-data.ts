import { useEffect } from "react";
import { useItems, type Filters, type Sort } from "@/features/item";
import { useTablePermissions } from "@/features/auth";
import { session } from "@/shared/api/session";
import { SAMPLE, type Widget } from "../model/dashboard";
import { currencyField } from "../model/currency";
import { NOBODY, mergeFilters, unanswered, widgetFilters, type DashFilter, type FilterValues } from "../model/filters";
import { useDashboardSchema } from "./schema";
import { planWidgetReads, resolveWidgetIdentities } from "../model/widget-source";
import { widgetFieldSlugs } from "../model/widget-advanced";
import { resolveDataset, type Dataset } from "../model/datasets";
import { calculatedProjection } from "../model/calculated-fields";
import { presentFields } from "../model/field-presentation";
import { useViaGuids } from "./via";

/** One read path for the editor preview and persisted card. */
export function useWidgetData(input: Widget, filters: DashFilter[], values: FilterValues, menuId: string, viewer: Filters = {}, page = 1, sorts?: Sort[], datasets: Dataset[] = [], selection: Filters = {}, picked: Filters = {}) {
  const resolved = input.type === "heading" ? { widget: { ...input, tableSlug: "", filters: {}, answers: {} }, dataset: undefined, error: null } : resolveDataset({ ...input, filters: {} }, datasets);
  const widget = { ...resolved.widget, filters: input.type === "heading" ? {} : input.filters };
  const mandatory = resolved.dataset?.source.kind === "table" ? resolved.dataset.source.filters : {};
  const slug = widget.tableSlug || undefined;
  const access = useDashboardSchema(slug, menuId);
  const permitted = resolved.dataset?.source.kind === "table" ? new Set(resolved.dataset.source.fields) : null;
  const projection = calculatedProjection(access.schema.fields.filter((f) => !permitted || permitted.has(f.slug)), input.calculatedFields);
  const schema = { ...access.schema, fields: presentFields(projection.fields, input.fieldPresentation) };
  const output = resolved.dataset?.source.kind === "table" ? new Set([...resolved.dataset.source.fields, ...projection.fields.filter((f) => input.calculatedFields?.some((d) => d.slug === f.slug)).map((f) => f.slug)]) : null;
  const restricted = output && (input.type === "records" ? input.columns ?? [] : widgetFieldSlugs(input)).some((slug) => !output.has(slug));
  const me = (table: string) => session.getObjectIds()[table] ?? NOBODY;
  const cacheScope = JSON.stringify([session.getProjectId(), session.getEnvironmentId(), session.getUserId(), session.getProfile()?.role, session.getPermissions()]);
  const permissionOf = useTablePermissions();
  const plan = planWidgetReads(widget, viewer, filters, values, schema.fields, schema.relations, access.relatedFields, (table) => permissionOf(table).read, session.getObjectIds(), sorts, [mandatory, selection, picked]);
  let own: Filters = {}, ownConflict = false;
  try { own = mergeFilters(resolveWidgetIdentities(mandatory, schema.fields, schema.relations, session.getObjectIds()), resolveWidgetIdentities(widget.filters, schema.fields, schema.relations, session.getObjectIds()), resolveWidgetIdentities(viewer, schema.fields, schema.relations, session.getObjectIds()), resolveWidgetIdentities(selection, schema.fields, schema.relations, session.getObjectIds()), resolveWidgetIdentities(picked, schema.fields, schema.relations, session.getObjectIds())); } catch { ownConflict = true; }
  const lookups = access.ready && !plan.forbidden && !ownConflict ? plan.lookups : [];
  const via = useViaGuids(lookups, cacheScope);
  let query: Filters = {}, previousQuery: Filters = {}, conflict: string | null = null;
  try {
    if (ownConflict) throw new Error("dashboard.filterConflict");
    const timestamps = new Set(schema.fields.filter((field) => field.type === "DATE_TIME").map((field) => field.slug));
    query = widgetFilters(own, widget.answers, filters, values, via.guids, me, false, timestamps);
    previousQuery = widgetFilters(own, widget.answers, filters, values, via.guids, me, true, timestamps);
  } catch { conflict = "dashboard.filterConflict"; }
  const currency = currencyField(widget, schema.fields);
  const currencySlug = currency.slug;
  const records = widget.type === "records";
  const forbidden = access.ready && (plan.forbidden || Boolean(currencySlug && !schema.fields.some((field) => field.slug === currencySlug)));
  const waiting = lookups.some((lookup) => !(lookup.key in via.guids));
  const computed = new Set(input.calculatedFields?.map((f) => f.slug));
  const unsupportedComputedQuery = Object.keys(own).some((slug) => computed.has(slug)) || (records && (sorts ?? input.sorts ?? []).some((s) => computed.has(s.field)));
  const error = (unsupportedComputedQuery ? "dashboard.datasetFieldUnavailable" : null) ?? resolved.error ?? (restricted || (currencySlug && output && !output.has(currencySlug)) ? "dashboard.datasetFieldUnavailable" : null) ?? conflict ?? (access.ready && currency.required ? "dashboard.currencyRequired" : via.error ? "dashboard.referenceFailed" : via.truncated ? "dashboard.referenceTruncated" : access.error);
  const enabled = access.ready && !forbidden && !waiting && !error && !access.denied;
  const effectiveSorts = sorts ?? widget.sorts ?? [];
  const order = [...effectiveSorts];
  if (records && !order.some((s) => s.field === "guid")) order.push({ field: "guid", direction: "desc" });
  const items = useItems(enabled ? slug : undefined, { limit: records ? widget.pageSize ?? 20 : SAMPLE, page: records ? page : 1, filters: query, sorts: records ? order : [] }, cacheScope);
  const compares = !records && widget.type !== "ratio" && widget.type !== "pivot" && widget.kind === "stat" && Boolean(widget.answers["period"]?.field && values["period"]?.length);
  const previous = useItems(enabled && compares ? slug : undefined, { limit: SAMPLE, page: 1, filters: previousQuery }, cacheScope);
  useEffect(() => {
    if (!enabled || ![900000, 3600000, 86400000].includes(widget.refreshInterval ?? 0)) return;
    const timer = setInterval(() => { items.refetch(); if (compares) previous.refetch(); }, widget.refreshInterval);
    return () => clearInterval(timer);
  }, [enabled, slug, widget.refreshInterval, items.refetch, previous.refetch, compares]);
  return {
    ...access, sqlMenuId: menuId, schema: { ...schema, fields: output ? schema.fields.filter((field) => output.has(field.slug)) : schema.fields }, dataset: resolved.dataset, query, currencySlug, forbidden, effectiveSorts,
    rows: projection.rows(items.page.rows), count: items.page.count,
    previous: compares ? projection.rows(previous.page.rows) : undefined,
    exact: { value: items.page.count, previous: compares ? previous.page.count : undefined },
    loading: access.loading || (waiting && !via.error) || items.isLoading || items.isPlaceholderData || (compares && previous.isLoading),
    refreshing: items.isFetching || (compares && previous.isFetching),
    error: error ?? items.error ?? (compares ? previous.error : null),
    updatedAt: items.updatedAt, refetch: () => { access.retry(); via.refetches.forEach((refetch) => void refetch()); if (enabled) { items.refetch(); if (compares) previous.refetch(); } },
    unanswered: unanswered(filters, widget.answers, values),
  };
}
