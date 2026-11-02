import { executeDashboardQuery, type QueryExecutionInput } from "./query-execution";
import type { QueryResult } from "../model/query-result";

export const MAX_DASHBOARD_ROWS = 20000;
/** Opt-in bounded loading through the same guarded query, actor, route and abort signal.
 * Stable unique output IDs are required; filters/sorts then operate on the complete result.
 * An explicit inner SQL LIMIT still scopes the dataset and is never rewritten. */
export async function executeDashboardPages(input: QueryExecutionInput, key: string, signal?: AbortSignal, read = executeDashboardQuery): Promise<QueryResult> {
  const rows: QueryResult["rows"] = [], seen = new Set<string>();
  let columns: QueryResult["columns"] | undefined, bytes = 0;
  for (let offset = 0; offset < MAX_DASHBOARD_ROWS; offset += 1000) {
    signal?.throwIfAborted();
    const result = await read({ ...input, limit: 1000, page: { offset, key } }, signal);
    if (!result.columns.some(c => c.key === key)) throw new Error("Complete SQL loading requires an output identifier field");
    if (columns && JSON.stringify(columns) !== JSON.stringify(result.columns)) throw new Error("SQL page schema changed; refresh the report");
    columns = result.columns;
    for (const row of result.rows) {
      const id = row[key];
      if (id === null || id === undefined || id === "" || seen.has(String(id))) throw new Error("SQL pages require unique non-empty identifiers; refresh the report");
      seen.add(String(id));
    }
    bytes += new TextEncoder().encode(JSON.stringify(result.rows)).length;
    if (bytes > 20 * 1024 * 1024) throw new Error("Complete SQL result exceeds 20 MB; narrow its scope");
    rows.push(...result.rows);
    if (!result.truncated) return { columns, rows, limit: MAX_DASHBOARD_ROWS, truncated: false };
    if (result.rows.length !== 1000) throw new Error("Incomplete SQL page; refresh the report");
  }
  return { columns: columns!, rows, limit: MAX_DASHBOARD_ROWS, truncated: true };
}
