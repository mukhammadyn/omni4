import { api, ApiError } from "@/shared/api/client";
import { toQueryResult } from "../model/query-result";

export type QueryExecutionInput = {
  menu_id: string;
  sql: string;
  parameters: { name: string; type: "text" | "number" | "date" | "boolean"; value: string }[];
  limit: number;
};

/** For the advanced dataset runner only. No basic editor activation or admin SQL fallback. */
export async function executeDashboardQuery(input: QueryExecutionInput, signal?: AbortSignal) {
  try { return toQueryResult(await api.post<unknown>("/v2/dashboard/query", input, { ...(signal ? { signal } : {}), timeout: 6500 })); }
  catch (error) {
    if (error instanceof ApiError && error.body && typeof error.body === "object") {
      const detail = (error.body as Record<string, unknown>)["error"];
      if (detail && typeof detail === "object" && typeof (detail as Record<string, unknown>)["message"] === "string") throw new Error((detail as Record<string, unknown>)["message"] as string, { cause: error });
    }
    throw error;
  }
}
