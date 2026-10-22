import { useMemo } from "react";
import { useCreateItem, useDeleteItems, useUpdateItem } from "@/features/item";
import { firstText, text } from "./org";
import { useAll } from "./timesheet";
import { VACANCIES } from "./vacancy";
import { ACTIVE, CANDIDATES, STAGES } from "./vacancy-page";

/**
 * «Воронки рекрутинга» — дерево `ot` прототипа (settings.html#hr-rec-pipe):
 * воронка (`hr_recruiting_pipelines`) и её этапы (`hr_recruiting_stages`)
 * одной таблицей. Каскадного удаления в ucode нет — этапы снимаются руками.
 */
const PIPELINES = "hr_recruiting_pipelines";

export const CONTAINERS = ["new", "in_progress", "done"] as const;
export type Container = (typeof CONTAINERS)[number];

export type Stage = {
  id: string;
  pipelineId: string;
  name: string;
  color: string;
  container: Container | "";
  sla: number | null;
  notify: boolean;
  order: number;
  /** Кандидатов «в работе» сейчас на этапе. */
  candidates: number;
  /** Кандидатов на этапе в любом статусе: нанятые и отклонённые тоже стоят на своём последнем этапе. */
  linked: number;
};
export type Pipeline = {
  id: string;
  name: string;
  color: string;
  sla: number | null;
  isDefault: boolean;
  active: boolean;
  stages: Stage[];
  /** Вакансий на воронке — с ними её не удалить. */
  vacancies: number;
};
export type StageDraft = Pick<Stage, "name" | "color" | "container" | "sla" | "notify">;
export type PipelineDraft = Pick<Pipeline, "name" | "color" | "sla" | "isDefault" | "active">;

const num = (value: unknown) => (typeof value === "number" ? value : null);

export function usePipelines() {
  const pipelines = useAll(PIPELINES, {}, false);
  const stages = useAll(STAGES, {}, false);
  const vacancies = useAll(VACANCIES, {}, false);
  const candidates = useAll(CANDIDATES, {}, false);
  const createPipeline = useCreateItem(PIPELINES);
  const updatePipeline = useUpdateItem(PIPELINES);
  const removePipelines = useDeleteItems(PIPELINES);
  const createStage = useCreateItem(STAGES);
  const updateStage = useUpdateItem(STAGES);
  const removeStages = useDeleteItems(STAGES);

  const list = useMemo(() => {
    const onStage = new Map<string, number>();
    const linked = new Map<string, number>();
    for (const row of candidates.rows) {
      const stage = text(row.hr_recruiting_stages_id);
      if (!stage) continue;
      linked.set(stage, (linked.get(stage) ?? 0) + 1);
      if (firstText(row.status) === ACTIVE) onStage.set(stage, (onStage.get(stage) ?? 0) + 1);
    }
    const all: Stage[] = stages.rows.map((row) => ({
      id: text(row.guid),
      pipelineId: text(row.hr_recruiting_pipelines_id),
      name: text(row.name),
      color: text(row.color),
      container: (CONTAINERS as readonly string[]).includes(firstText(row.container)) ? (firstText(row.container) as Container) : "",
      sla: num(row.sla_days),
      notify: row.notify_candidate === true,
      order: num(row.sort_order) ?? 0,
      candidates: onStage.get(text(row.guid)) ?? 0,
      linked: linked.get(text(row.guid)) ?? 0,
    }));
    return pipelines.rows
      .map((row) => ({
        id: text(row.guid),
        name: text(row.name),
        color: text(row.color),
        sla: num(row.sla_days),
        isDefault: row.is_default === true,
        active: row.is_active !== false,
        stages: all.filter((s) => s.pipelineId === text(row.guid)).sort((a, b) => a.order - b.order),
        vacancies: vacancies.rows.filter((v) => text(v.hr_recruiting_pipelines_id) === text(row.guid)).length,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }, [pipelines.rows, stages.rows, candidates.rows, vacancies.rows]);

  const stageValues = (d: StageDraft) => ({
    name: d.name,
    color: d.color || null,
    container: d.container || null,
    sla_days: d.sla,
    notify_candidate: d.notify,
  });
  const pipelineValues = (d: PipelineDraft) => ({ name: d.name, color: d.color || null, sla_days: d.sla, is_default: d.isDefault, is_active: d.active });
  /** Воронка по умолчанию одна: новая снимает флаг с прежней — после своего сохранения, чтобы сбой не оставил ни одной. */
  const dropOtherDefault = async (id: string) => {
    for (const p of list) if (p.isDefault && p.id !== id) await updatePipeline.mutateAsync({ guid: p.id, values: { is_default: false } });
  };

  return {
    pipelines: list,
    loading: pipelines.loading || stages.loading,
    busy: createStage.isPending || updateStage.isPending || removeStages.isPending || createPipeline.isPending || updatePipeline.isPending,
    savePipeline: async (id: string | null, draft: PipelineDraft) => {
      const guid = id ?? crypto.randomUUID();
      if (id) await updatePipeline.mutateAsync({ guid, values: pipelineValues(draft) });
      else await createPipeline.mutateAsync({ guid, ...pipelineValues(draft) });
      if (draft.isDefault) await dropOtherDefault(guid);
    },
    toggleActive: (p: Pipeline) => updatePipeline.mutateAsync({ guid: p.id, values: { is_active: !p.active } }),
    /** Вместе с этапами; вакансии и кандидаты на этапах — проверяет окно (`vacancies`, `Stage.candidates`). */
    removePipeline: async (p: Pipeline) => {
      if (p.stages.length) await removeStages.mutateAsync(p.stages.map((s) => s.id));
      await removePipelines.mutateAsync([p.id]);
    },
    saveStage: (pipeline: Pipeline, id: string | null, draft: StageDraft) =>
      id
        ? updateStage.mutateAsync({ guid: id, values: stageValues(draft) })
        : createStage.mutateAsync({
            guid: crypto.randomUUID(),
            hr_recruiting_pipelines_id: pipeline.id,
            sort_order: (pipeline.stages.at(-1)?.order ?? -1) + 1,
            ...stageValues(draft),
          }),
    toggleNotify: (s: Stage) => updateStage.mutateAsync({ guid: s.id, values: { notify_candidate: !s.notify } }),
    /**
     * Сдвиг этапа на шаг. Воронка перенумеровывается 0…n целиком: у этапов,
     * заведённых без `sort_order`, порядки совпадают, и обмен двух соседей
     * их не развёл бы. Пишутся только изменившиеся.
     */
    moveStage: async (pipeline: Pipeline, stage: Stage, by: -1 | 1) => {
      const next = [...pipeline.stages];
      const at = next.indexOf(stage);
      if (!next[at + by]) return;
      [next[at], next[at + by]] = [next[at + by]!, stage];
      for (const [i, s] of next.entries()) if (s.order !== i) await updateStage.mutateAsync({ guid: s.id, values: { sort_order: i } });
    },
    removeStage: (s: Stage) => removeStages.mutateAsync([s.id]),
  };
}
