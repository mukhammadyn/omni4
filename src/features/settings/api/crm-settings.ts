import { useMemo } from "react";
import { MAX_LIMIT, useCreateItem, useDeleteItems, useItemCounts, useItems, useUpdateItem, type Filters, type Item } from "@/features/item";

/**
 * Настройки CRM по прототипу (settings.html#pipelines, #sources, #lost,
 * #ai-calls): свои экраны поверх справочников `crm_*`, а не общая таблица.
 */
const PIPELINES = "crm_pipelines";
const STAGES = "crm_stages";
const SOURCES = "crm_sources";
const LOST = "crm_lost_reasons";
const DEALS = "crm_deals";
const CALL_QUALITY = "crm_call_quality_versions";

export const CONTAINERS = ["new", "in_progress", "done"] as const;
export type Container = (typeof CONTAINERS)[number];

const text = (value: unknown) => (typeof value === "string" ? value : "");
const first = (value: unknown) => text(Array.isArray(value) ? value[0] : value);
const num = (value: unknown) => (typeof value === "number" ? value : null);
const order = (row: Item) => num(row.sort_order) ?? Number.MAX_SAFE_INTEGER;

function useRows(table: string, filters: Filters = {}) {
  const query = useItems(table, { limit: MAX_LIMIT, page: 1, filters, relations: false });
  return { rows: query.page.rows, loading: query.isLoading };
}

/**
 * Перенумеровать список 0…n и записать только изменившиеся строки:
 * у строк, заведённых без `sort_order`, порядки совпадают.
 */
async function renumber<T extends { id: string; order: number }>(
  list: T[],
  write: (id: string, values: Item) => Promise<unknown>,
  extra?: (item: T, index: number) => Item | null,
) {
  for (const [i, item] of list.entries()) {
    const more = extra?.(item, i) ?? null;
    if (item.order !== i || more) await write(item.id, { sort_order: i, ...more });
  }
}

/** Переставить элемент `from` на место `to` — для перетаскивания. */
export function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Этапы группа за группой; внутри группы — в порядке списка. */
const grouped = (stages: Stage[]) => CONTAINERS.flatMap((c) => stages.filter((s) => s.container === c));

export type Stage = { id: string; name: string; color: string; container: Container; probability: number | null; termDays: number | null; order: number };
export type Pipeline = { id: string; name: string; active: boolean; isDefault: boolean; order: number; stages: Stage[] };

export function useCrmPipelines() {
  const pipelines = useRows(PIPELINES);
  const stages = useRows(STAGES);
  const createPipeline = useCreateItem(PIPELINES);
  const updatePipeline = useUpdateItem(PIPELINES);
  const removePipelines = useDeleteItems(PIPELINES);
  const createStage = useCreateItem(STAGES);
  const updateStage = useUpdateItem(STAGES);
  const removeStages = useDeleteItems(STAGES);
  const writeStage = (guid: string, values: Item) => updateStage.mutateAsync({ guid, values });

  const list = useMemo<Pipeline[]>(() => {
    const all = stages.rows
      .map((row) => ({
        id: text(row.guid),
        pipelineId: text(row.crm_pipelines_id),
        name: text(row.name),
        color: text(row.color),
        // Этап без группы — «В процессе»: туда его и кладёт первое перетаскивание.
        container: ((CONTAINERS as readonly string[]).includes(first(row.container)) ? first(row.container) : "in_progress") as Container,
        probability: num(row.probability),
        termDays: num(row.term_days),
        order: order(row),
      }))
      .sort((a, b) => a.order - b.order);
    return pipelines.rows
      .map((row) => ({
        id: text(row.guid),
        name: text(row.name),
        active: row.is_active !== false,
        isDefault: row.is_default === true,
        order: order(row),
        stages: all.filter((s) => s.pipelineId === text(row.guid)),
      }))
      .sort((a, b) => a.order - b.order);
  }, [pipelines.rows, stages.rows]);

  return {
    pipelines: list,
    loading: pipelines.loading || stages.loading,
    addPipeline: async (name: string) => {
      const guid = crypto.randomUUID();
      await createPipeline.mutateAsync({ guid, name, is_active: true, sort_order: (list.at(-1)?.order ?? -1) + 1 });
      return guid;
    },
    renamePipeline: (p: Pipeline, name: string) => updatePipeline.mutateAsync({ guid: p.id, values: { name } }),
    toggleActive: (p: Pipeline) => updatePipeline.mutateAsync({ guid: p.id, values: { is_active: !p.active } }),
    /** Каскадного удаления в ucode нет — этапы снимаются руками. Сделки на воронке проверяет окно. */
    removePipeline: async (p: Pipeline) => {
      if (p.stages.length) await removeStages.mutateAsync(p.stages.map((s) => s.id));
      await removePipelines.mutateAsync([p.id]);
    },
    /** В конец своей группы; воронка перенумеровывается, чтобы на доске этапы шли группа за группой. */
    addStage: async (p: Pipeline, container: Container, name: string) => {
      const stage: Stage = { id: crypto.randomUUID(), name, color: "", container, probability: null, termDays: null, order: Math.max(-1, ...p.stages.map((s) => s.order)) + 1 };
      await createStage.mutateAsync({ guid: stage.id, crm_pipelines_id: p.id, name, container, is_active: true, sort_order: stage.order });
      await renumber(grouped([...p.stages, stage]), writeStage);
    },
    updateStage: (s: Stage, values: Item) => writeStage(s.id, values),
    removeStage: (s: Stage) => removeStages.mutateAsync([s.id]),
    /**
     * Перетаскивание: этап `stage` встаёт в группу `container` перед `before`
     * (или в её конец). Воронка перенумеровывается целиком, группа за группой.
     */
    dropStage: (p: Pipeline, stage: Stage, container: Container, before: Stage | null) => {
      const rest = p.stages.filter((s) => s.id !== stage.id);
      const moved = { ...stage, container };
      const own = rest.filter((s) => s.container === container);
      const at = before ? own.findIndex((s) => s.id === before.id) : -1;
      const target = at < 0 ? [...own, moved] : [...own.slice(0, at), moved, ...own.slice(at)];
      const groups = grouped([...rest.filter((s) => s.container !== container), ...target]);
      return renumber(groups, writeStage, (s) => (s.id === stage.id && stage.container !== container ? { container } : null));
    },
  };
}

/** Строка простого справочника: источники и причины проигрыша. */
export type Entry = { id: string; name: string; color: string; active: boolean; order: number };

function useEntries(table: string) {
  const data = useRows(table);
  const create = useCreateItem(table);
  const update = useUpdateItem(table);
  const remove = useDeleteItems(table);
  const write = (guid: string, values: Item) => update.mutateAsync({ guid, values });
  const list = useMemo<Entry[]>(
    () =>
      data.rows
        .map((row) => ({ id: text(row.guid), name: text(row.name), color: text(row.color), active: row.is_active !== false, order: order(row) }))
        .sort((a, b) => a.order - b.order),
    [data.rows],
  );
  return {
    entries: list,
    loading: data.loading,
    add: (name: string, color: string) =>
      create.mutateAsync({ guid: crypto.randomUUID(), name, color, is_active: true, sort_order: list.length }).then(() => undefined),
    update: (e: Entry, values: Item) => write(e.id, values),
    remove: (e: Entry) => remove.mutateAsync([e.id]),
    reorder: (from: number, to: number) => renumber(move(list, from, to), write),
  };
}

export const useCrmSources = () => ({ ...useEntries(SOURCES), field: "crm_sources_id" as const });

/** Причины проигрыша и сколько сделок проиграно по каждой в этом месяце. */
export function useCrmLostReasons() {
  const entries = { ...useEntries(LOST), field: "crm_lost_reasons_id" as const };
  const now = new Date();
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  // Верхняя граница — строго до 1-го следующего месяца: `closed_at` со временем, и `$lte` последнего дня терял бы сам этот день.
  const bounds = { $gte: day(now), $lt: day(new Date(now.getFullYear(), now.getMonth() + 1, 1)) };
  // ponytail: сделки месяца одним списком до 1000 строк; больше — считать на бэкенде группировкой.
  const deals = useRows(DEALS, { closed_at: { op: "between", values: [bounds.$gte, bounds.$lt], bounds } });
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of deals.rows) {
      const id = text(row.crm_lost_reasons_id);
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [deals.rows]);
  return { ...entries, counts };
}

/**
 * Критерий оценки звонка — как его читает оценщик: `id` и `allowed_scores`
 * (шаг 0,5 до максимума) хранятся рядом с тем, что видно на экране.
 */
export type Criterion = { id: string; name: string; max_score: number; instructions: string; allowed_scores?: number[] };
export type CallQualityVersion = { id: string; name: string; active: boolean; auto: boolean; criteria: Criterion[]; violations: string };

const parseCriteria = (value: unknown): Criterion[] => {
  try {
    const list: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(list) ? (list as Criterion[]) : [];
  } catch {
    return [];
  }
};
const scores = (max: number) => Array.from({ length: Math.floor(max * 2) + 1 }, (_, i) => i / 2);

export function useCallQuality() {
  const data = useRows(CALL_QUALITY);
  const update = useUpdateItem(CALL_QUALITY);
  const versions = useMemo<CallQualityVersion[]>(
    () =>
      data.rows.map((row) => ({
        id: text(row.guid),
        name: text(row.name),
        active: row.is_active === true,
        auto: row.auto_evaluate === true,
        criteria: parseCriteria(row.criteria),
        violations: text(row.violation_rules),
      })),
    [data.rows],
  );
  return {
    versions,
    loading: data.loading,
    /** Действующая версия одна: выбор снимает флаг с прежних — после своей записи, чтобы не остаться без действующей. */
    activate: async (v: CallQualityVersion) => {
      await update.mutateAsync({ guid: v.id, values: { is_active: true } });
      for (const other of versions) if (other.active && other.id !== v.id) await update.mutateAsync({ guid: other.id, values: { is_active: false } });
    },
    setAuto: (v: CallQualityVersion, auto: boolean) => update.mutateAsync({ guid: v.id, values: { auto_evaluate: auto } }),
    save: (v: CallQualityVersion, criteria: Criterion[], violations: string) =>
      update.mutateAsync({
        guid: v.id,
        values: {
          criteria: JSON.stringify(criteria.map((c) => ({ ...c, id: c.id || `criterion-${crypto.randomUUID()}`, allowed_scores: scores(c.max_score) }))),
          violation_rules: violations,
        },
      }),
  };
}

/** Сделок на записи — с ними её не удалить: связь в сделке осталась бы на удалённую строку. */
export function useDealCount(field: "crm_pipelines_id" | "crm_stages_id" | "crm_sources_id" | "crm_lost_reasons_id", id: string) {
  return useItemCounts(DEALS, [{ [field]: { op: "any", values: [id] } }], "")[0];
}
