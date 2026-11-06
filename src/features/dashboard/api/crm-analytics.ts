import { useEffect } from "react";
import type { DatasetParameter } from "../model/datasets";
import type { FilterValues } from "../model/filters";
import { dashboardSqlValues } from "../model/sql-controls";
import type { CrmRow, CrmView } from "../model/crm-analytics";
import { useSqlRunner } from "./sql-runner";

export const CRM_PARAMETERS: DatasetParameter[] = [
  { name: "crm_from", type: "date", required: true, dashboardControl: "period_start", controlGroup: "crm-period", defaultPeriod: "all", dynamicDefault: "year_start" },
  { name: "crm_to", type: "date", required: true, dashboardControl: "period_end", controlGroup: "crm-period", defaultPeriod: "all", dynamicDefault: "today" },
  { name: "crm_branch", type: "text", required: false, dashboardControl: "select", defaultValue: "" },
];
const owner = (alias: string) => ` LEFT JOIN core_users u ON u.guid=${alias}.core_users_id AND u.deleted_at IS NULL LEFT JOIN hr_employees e ON e.guid=u.hr_employees_id AND e.deleted_at IS NULL`;
const branch = `CASE WHEN :crm_branch='' THEN true WHEN :crm_branch='__none__' THEN e.hr_locations_id IS NULL ELSE e.hr_locations_id::text=:crm_branch END`;
const scope = (alias: string, field: string) => `${alias}.deleted_at IS NULL AND ${alias}.${field}>=:crm_from::date AND ${alias}.${field}::date<=:crm_to::date AND ${branch}`;
export const CRM_QUERIES = {
  deals: `SELECT d.guid::text AS guid,d.title,d.created_at,d.amount,d.currency,d.is_lost,d.stage_due_at,d.crm_pipelines_id::text AS pipeline_id,d.crm_stages_id::text AS stage_id,s.name AS stage_name,s.color AS stage_color,s.container,p.name AS pipeline_name,d.crm_sources_id::text AS source_id,src.name AS source_name,src.channel,d.core_users_id::text AS owner_id,u.full_name AS owner_name FROM crm_deals d LEFT JOIN crm_stages s ON s.guid=d.crm_stages_id AND s.deleted_at IS NULL LEFT JOIN crm_pipelines p ON p.guid=d.crm_pipelines_id AND p.deleted_at IS NULL LEFT JOIN crm_sources src ON src.guid=d.crm_sources_id AND src.deleted_at IS NULL ${owner("d")} WHERE ${scope("d", "created_at")}`,
  stages: `SELECT s.guid::text AS guid,s.name,s.color,s.sort_order,s.crm_pipelines_id::text AS pipeline_id,p.name AS pipeline_name,p.sort_order AS pipeline_order FROM crm_stages s LEFT JOIN crm_pipelines p ON p.guid=s.crm_pipelines_id AND p.deleted_at IS NULL WHERE s.deleted_at IS NULL ORDER BY p.sort_order,s.sort_order,s.guid`,
  history: `SELECT h.guid::text AS guid,h.moved_at,h.crm_deals_id::text AS deal_id,h.crm_stages_id_2::text AS from_id,h.crm_stages_id::text AS to_id FROM crm_deal_stage_history h JOIN crm_deals d ON d.guid=h.crm_deals_id ${owner("d")} WHERE h.deleted_at IS NULL AND ${scope("d", "created_at")}`,
  tasks: `SELECT t.guid::text AS guid,t.title,t.description,t.created_at,t.due_date,t.status,t.priority,t.completed_at,t.crm_deals_id::text AS deal_id,t.core_users_id::text AS owner_id,u.full_name AS owner_name,d.title AS object_name FROM crm_tasks t LEFT JOIN crm_deals d ON d.guid=t.crm_deals_id AND d.deleted_at IS NULL ${owner("t")} WHERE ${scope("t", "created_at")}`,
  calls: `SELECT c.guid::text AS guid,c.started_at,c.direction,c.status,c.duration_seconds,c.client_phone,c.crm_deals_id::text AS deal_id,c.core_users_id::text AS owner_id,u.full_name AS owner_name FROM crm_calls c ${owner("c")} WHERE ${scope("c", "started_at")}`,
} as const;

function useRows(menuId: string, sql: string, values: FilterValues) {
  const runner = useSqlRunner(menuId, sql, CRM_PARAMETERS, dashboardSqlValues(CRM_PARAMETERS, values), 1000, "guid");
  const { run, enabled } = runner;
  useEffect(() => { if (enabled) void run(); }, [run, enabled]);
  return { rows: (runner.result?.rows ?? []).map(row => Object.hasOwn(row, "owner_id") && !row.owner_id ? { ...row, owner_id: "__none__" } : row) as CrmRow[], busy: !runner.result && !runner.error, error: runner.error ?? (runner.result?.truncated ? "More than 20,000 records. Narrow the date or branch filter to view a complete report." : null), retry: run };
}
/** Hook counts stay fixed; changing report unmounts its source component. */
export function useCrmRows(menuId: string, view: CrmView, values: FilterValues) {
  return useRows(menuId, CRM_QUERIES[view === "funnel" ? "deals" : view], values);
}
export const useCrmStages = (menuId: string) => useRows(menuId, CRM_QUERIES.stages, {});
export const useCrmHistory = (menuId: string, values: FilterValues) => useRows(menuId, CRM_QUERIES.history, values);
