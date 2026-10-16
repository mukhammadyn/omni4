import { execSql } from "@/features/settings";
import { legacyQueryResult, prepareDashboardSql } from "../model/legacy-sql";

export type QueryExecutionInput = {
  menu_id: string;
  sql: string;
  parameters: { name: string; type: "text" | "number" | "date" | "boolean"; value: string }[];
  limit: number;
};

/** Reuse the existing SQL console; its existing server permissions apply unchanged. */
export async function executeDashboardQuery(input: QueryExecutionInput, signal?: AbortSignal) {
  const request = prepareDashboardSql(input.sql, input.parameters, input.limit);
  const result = await execSql(request.sql, { signal, timeout: 15000, skipAuthRefresh: true, params: request.params });
  return legacyQueryResult(result, input.limit);
}
