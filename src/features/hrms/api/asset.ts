import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { PEOPLE, useItem, useItems, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { ASSET, MOVE, movesToLog, targetOf, type Move } from "../model/asset";
import { text } from "./org";
import { ALL } from "./vacancy-page";

export const ASSETS = "hr_assets";
export const ASSET_MOVEMENTS = "hr_asset_movements";

const byDateDesc = (a: Item, b: Item) =>
  `${text(b.date)}${text(b.created_at)}`.localeCompare(`${text(a.date)}${text(a.created_at)}`);

/** Вещь, её схема, журнал (новые сверху), права — страница `property.html`. */
export function useAsset(guid: string) {
  const record = useItem(ASSETS, guid, true);
  const { schema, isLoading } = useTableSchema(ASSETS);
  const permissionOf = useTablePermissions();
  const movements = useItems(guid ? ASSET_MOVEMENTS : undefined, {
    ...ALL,
    filters: { hr_assets_id: { op: "is", values: [guid] } },
  });
  return {
    row: record.item,
    isLoading: record.isLoading || isLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    movements: useMemo(() => [...movements.page.rows].sort(byDateDesc), [movements.page.rows]),
    can: permissionOf(ASSETS),
  };
}

/** Строка журнала: кто сделал — своя строка `core_users` (у ADMIN её нет). */
const logRow = (asset: string, action: Move, employee: string, date: string, comment: string) => ({
  guid: crypto.randomUUID(),
  hr_assets_id: asset,
  action,
  date,
  hr_employees_id: employee || null,
  core_users_id: session.getObjectIds()[PEOPLE] ?? null,
  comment: comment || null,
});

async function log(rows: ReturnType<typeof logRow>[]) {
  for (const row of rows) await api.post<unknown>(`/v2/items/${ASSET_MOVEMENTS}`, { data: row });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => Promise.all([ASSETS, ASSET_MOVEMENTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })));
}

export type AssetMove = { guid: string; holder: string; move: Move; employee?: string; date?: string; comment?: string };

/**
 * Движение — `move_property` из udevs-hrms-reports: журнал и новое
 * состояние вещи. Владелец остаётся только у «Выдано».
 *
 * ponytail: две записи с клиента, без транзакции и блокировки строки;
 * сначала журнал — сбой оставит лишнюю запись истории, а не вещь
 * без следа. Заменить облачной функцией, когда она будет в omni4.
 */
export function useMoveAsset() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ guid, holder, move, employee = "", date = todayInput(), comment = "" }: AssetMove) => {
      await log(
        movesToLog(move, holder).map((entry) =>
          logRow(guid, entry.action, entry.action === MOVE.issued ? employee : entry.employee, date, entry.action === move ? comment : ""),
        ),
      );
      await api.put<unknown>(`/v2/items/${ASSETS}`, {
        data: { guid, status: targetOf(move) ?? ASSET.inStock, hr_employees_id: move === MOVE.issued ? employee : null },
      });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

export type AssetSave = {
  /** Пусто — новая вещь. */
  guid: string;
  /** Поля: у новой — все заполненные, у правки — только изменённые. */
  values: Item;
  /** Новой вещи — сразу выдать этому сотруднику. */
  employee?: string;
};

/**
 * «Создать» и «Сохранить» формы. Новая — «На складе» с поступлением
 * в журнал (и выдачей, если выбран сотрудник); правка — «Изменено».
 * Возвращает guid.
 */
export function useSaveAsset() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ guid, values, employee = "" }: AssetSave) => {
      const today = todayInput();
      if (guid) {
        await api.put<unknown>(`/v2/items/${ASSETS}`, { data: { ...values, guid } });
        await log([logRow(guid, MOVE.changed, "", today, "")]);
        return guid;
      }
      const created = crypto.randomUUID();
      await api.post<unknown>(`/v2/items/${ASSETS}`, {
        data: { ...values, guid: created, status: employee ? ASSET.assigned : ASSET.inStock, hr_employees_id: employee || null },
      });
      await log([logRow(created, MOVE.received, "", today, ""), ...(employee ? [logRow(created, MOVE.issued, employee, today, "")] : [])]);
      return created;
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

/** Поля, которые копия не наследует: серийный номер у каждой вещи свой. */
const NOT_COPIED = new Set(["guid", "serial_number", "inventory_number", "hr_employees_id", "status", "created_at", "updated_at"]);

/** «Дублировать» — копия на склад, как в прототипе. Возвращает guid копии. */
export function useDuplicateAsset() {
  const save = useSaveAsset();
  return useMutation({
    mutationFn: (row: Item) =>
      save.mutateAsync({
        guid: "",
        values: Object.fromEntries(Object.entries(row).filter(([key, value]) => !NOT_COPIED.has(key) && !key.endsWith("_data") && value !== null)),
      }),
  });
}

/** Имущество сотрудника и выдачи ему — вкладка «Имущество». */
export function useEmployeeAssets(employeeId: string) {
  const assets = useItems(employeeId ? ASSETS : undefined, {
    ...ALL,
    filters: { hr_employees_id: { op: "is", values: [employeeId] } },
  });
  const issues = useItems(employeeId ? ASSET_MOVEMENTS : undefined, {
    ...ALL,
    relations: false,
    filters: { hr_employees_id: { op: "is", values: [employeeId] }, action: { op: "is", values: [MOVE.issued] } },
  });
  return { assets: assets.page.rows, issues: issues.page.rows, isLoading: assets.isLoading || issues.isLoading };
}

/** Вещи на складе — выбор в «Выдать имущество» у сотрудника. */
export function useStockAssets(enabled: boolean) {
  return useItems(enabled ? ASSETS : undefined, { ...ALL, relations: false, filters: { status: { op: "is", values: [ASSET.inStock] } } }).page.rows;
}

type Query = Parameters<typeof useItems>[1];

/**
 * Все вещи под отбором и поиском таблицы — для «Общей стоимости»:
 * считается по всему списку, а не по странице.
 *
 * ponytail: весь список одним запросом, потолок — MAX_LIMIT строк (ALL).
 * Вещей станет больше — считать на сервере облачной функцией.
 */
export function useAssetsForTotal(filters: Query["filters"], search: Query["search"], enabled: boolean) {
  return useItems(enabled ? ASSETS : undefined, { ...ALL, relations: false, ...(filters ? { filters } : {}), ...(search ? { search } : {}) }).page.rows;
}
