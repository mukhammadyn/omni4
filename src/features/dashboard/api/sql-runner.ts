import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "@/shared/lib/i18n";
import { api, ApiError } from "@/shared/api/client";
import { useSession } from "@/shared/api/use-session";
import type { DatasetParameter } from "../model/datasets";
import type { QueryResult } from "../model/query-result";
import { queryCapability } from "../model/query-capability";
import { executeDashboardQuery } from "./query-execution";

type Gate = { context: string; loading: boolean; enabled: boolean; limit: number; error: string | null };
type Output = { context: string; signature: string; result: QueryResult | null; busy: boolean; error: string | null };

export function useSqlRunner(menuId: string, sql: string, parameters: DatasetParameter[], values: Record<string, string>, limit: number) {
  const session = useSession();
  const context = JSON.stringify([session.getProjectId(), session.getEnvironmentId(), session.getUserId(), session.getProfile()?.role, session.getPermissions(), menuId, session.getVersion()]);
  const signature = JSON.stringify([sql, parameters, values, limit]);
  const latest = useRef({ context, signature }); latest.current = { context, signature };
  const controller = useRef<AbortController | null>(null);
  const [gate, setGate] = useState<Gate>({ context: "", loading: true, enabled: false, limit: 1000, error: null });
  const [output, setOutput] = useState<Output>({ context: "", signature: "", result: null, busy: false, error: null });
  useEffect(() => {
    const abort = new AbortController(); controller.current?.abort();
    setGate({ context, loading: true, enabled: false, limit: 1000, error: null });
    void api.get<unknown>("/v2/dashboard/query/capabilities", { params: { menu_id: menuId }, signal: abort.signal, timeout: 6500 }).then((caps) => {
      if (abort.signal.aborted || latest.current.context !== context) return;
      const capability = queryCapability(caps, session.getProjectId(), session.getEnvironmentId(), menuId);
      setGate({ context, loading: false, enabled: capability.enabled, limit: capability.limit, error: null });
    }).catch((error: unknown) => { if (!abort.signal.aborted) setGate({ context, loading: false, enabled: false, limit: 1000, error: error instanceof ApiError && [404, 501].includes(error.status) ? null : queryFailure(error) }); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [context, menuId, session]);
  useEffect(() => { controller.current?.abort(); }, [signature]);
  const current = output.context === context && output.signature === signature;
  // Serialized query inputs keep saved-widget autorun stable across result renders.
  const run = useCallback(async () => {
    if (gate.context !== context || !gate.enabled || gate.loading) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setOutput({ context, signature, result: null, busy: true, error: null });
    try {
      const result = await executeDashboardQuery({ menu_id: menuId, sql, limit, parameters: parameters.map((parameter) => ({ name: parameter.name, type: parameter.type, value: Object.hasOwn(values, parameter.name) ? values[parameter.name] ?? "" : "" })) }, abort.signal);
      if (!abort.signal.aborted && latest.current.context === context && latest.current.signature === signature) setOutput({ context, signature, result, busy: false, error: null });
    } catch (error) { if (!abort.signal.aborted && latest.current.context === context && latest.current.signature === signature) setOutput({ context, signature, result: null, busy: false, error: queryFailure(error) }); }
  }, [context, signature, gate.context, gate.enabled, gate.loading, menuId]);
  const cancel = () => { controller.current?.abort(); setOutput({ context, signature, result: null, busy: false, error: null }); };
  return { scopeKey: context, checking: gate.context !== context || gate.loading, enabled: gate.context === context && gate.enabled, maxRows: gate.limit, gateError: gate.context === context ? gate.error : null, result: current ? output.result : null, busy: current && output.busy, error: current ? output.error : null, run, cancel };
}

function queryFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return i18n.language.startsWith("ru") ? "Сессия истекла или отозвана. Войдите снова и выполните запрос." : i18n.language.startsWith("uz") ? "Seans tugagan yoki bekor qilingan. Qayta kiring va so‘rovni bajaring." : "Your session expired or was revoked. Sign in again and run the query.";
    const body = error.body;
    if (typeof body === "string") return body;
    if (body && typeof body === "object") {
      const detail = (body as Record<string, unknown>)["error"];
      if (detail && typeof detail === "object" && typeof (detail as Record<string, unknown>)["message"] === "string") return (detail as Record<string, unknown>)["message"] as string;
    }
  }
  return error instanceof Error ? error.message : "Dashboard query failed";
}
