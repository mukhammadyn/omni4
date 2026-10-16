import { execSql } from "@/features/settings";
import { legacyQueryResult, numericProjection, prepareDashboardSql, restoreNumericSchema } from "../model/legacy-sql";

export type QueryExecutionInput = {
  menu_id: string;
  sql: string;
  parameters: { name: string; type: "text" | "number" | "date" | "boolean"; value: string }[];
  limit: number;
};

/** Reuse the existing SQL console; its existing server permissions apply unchanged. */
export async function executeDashboardQuery(input: QueryExecutionInput, signal?: AbortSignal) {
  const request = prepareDashboardSql(input.sql, input.parameters, input.limit);
  const deadline = Date.now() + 15000;
  const read = (sql: string) => {
    signal?.throwIfAborted();
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw new Error("SQL preview timed out");
    return execSql(sql, { signal, timeout, skipAuthRefresh: true, params: request.params });
  };
  const schema = await read(`SELECT * FROM (\n${request.sql}\n) AS "dashboard_types" LIMIT 0`);
  const projection = numericProjection(request.sql, schema);
  const result = await read(projection.sql);
  return legacyQueryResult(restoreNumericSchema(schema, result, projection.exactColumns), input.limit);
}
