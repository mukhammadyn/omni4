import { useQueries } from "@tanstack/react-query";
import { toRequestBody, type ItemsResponseDto } from "@/features/item";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { SAMPLE } from "../model/dashboard";

/** Отбор строк справочника: в таблице `table` поле `via` — одно из `values`. */
export type ViaLookup = { key: string; table: string; via: string; values: string[] };

/**
 * Фильтр через справочник (ADR-0013): сначала guid строк справочника,
 * например сотрудников филиала, потом виджет отбирает свои строки
 * по ссылке на них. Один запрос сверху на фильтр; одинаковые делят кэш.
 *
 * ponytail: до SAMPLE строк справочника — филиал больше чем
 * с тысячей сотрудников отберётся не весь.
 *
 * Результат по ключу фильтра; ключа нет — ещё грузится.
 */
export function useViaGuids(lookups: ViaLookup[], cacheScope?: string) {
  return useQueries({
    queries: lookups.map((lookup) => {
      const body = toRequestBody({
        limit: SAMPLE,
        page: 1,
        filters: { [lookup.via]: { op: "is", values: lookup.values } },
        relations: false,
      });
      return {
        queryKey: keys.items.list(lookup.table, { ...body, ...(cacheScope ? { cacheScope } : {}) }),
        queryFn: () => api.post<ItemsResponseDto>(`/v2/object/get-list/${lookup.table}`, { data: body }),
        staleTime: 60_000,
      };
    }),
    combine: (results) => {
      const guids: Record<string, string[]> = {};
      results.forEach((result, index) => {
        const lookup = lookups[index];
        if (!lookup || !result.data) return;
        guids[lookup.key] = (result.data.data?.response ?? []).map((row) => String(row["guid"] ?? "")).filter(Boolean);
      });
      return { guids, loading: results.some((result) => result.isLoading), error: results.find((result) => result.error)?.error ?? null, truncated: results.some((result) => (result.data?.data?.count ?? 0) > SAMPLE), refetches: results.map((result) => result.refetch) };
    },
  });
}
