import { useMemo } from "react";
import { useTablePermissions } from "@/features/auth";
import { MAX_LIMIT, useCreateItem, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { stageHistoryRow } from "../model/stage-history";
import { EMPLOYEES } from "./employee";
import { text } from "./org";
import { VACANCIES } from "./vacancy";

export const CANDIDATES = "hr_candidates";
const STAGES = "hr_recruiting_stages";
const HISTORY = "hr_candidate_stage_history";
const EVALUATIONS = "hr_candidate_evaluations";
export const ALL = { limit: MAX_LIMIT, page: 1 };

/** Статус кандидата «в работе» — он и стоит в колонках воронки. */
export const ACTIVE = "active";

export type StageColumn = { id: string; name: string; color: string; candidates: Item[] };

/** Этапы воронки по порядку. */
const byStageOrder = (a: Item, b: Item) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);

/** Этапы воронки по порядку: колонки «Воронки» и список в форме вакансии. */
export function usePipelineStages(pipeline: string) {
  const query = useItems(pipeline ? STAGES : undefined, {
    ...ALL,
    filters: { hr_recruiting_pipelines_id: { op: "is", values: [pipeline] } },
  });
  const stages = useMemo(() => [...query.page.rows].sort(byStageOrder), [query.page.rows]);
  return { stages, isLoading: query.isLoading };
}

/**
 * Запись в историю этапов кандидата. Пишется только после ответа:
 * отказ сервера не должен оставить переход, которого не было.
 */
function useStageLog() {
  const createHistory = useCreateItem(HISTORY);
  return (candidate: string, vacancy: string, from: string | null, to: string | null, status: string) =>
    createHistory.mutate(
      stageHistoryRow({
        candidate,
        vacancy,
        from,
        to,
        status,
        by: session.getObjectIds()[EMPLOYEES],
        at: new Date().toISOString(),
      }),
    );
}

/**
 * Новый кандидат — в воронку: «в работе», с откликом сегодня и записью
 * о входе на этап. guid — свой (или из черновика), чтобы записать
 * историю, не дожидаясь, что вернёт сервер.
 */
export function useCreateCandidate() {
  const create = useCreateItem(CANDIDATES);
  const log = useStageLog();
  return {
    pending: create.isPending,
    create: (values: Item, onDone: (guid: string) => void) => {
      const id = text(values.guid) || crypto.randomUUID();
      const stage = text(values.hr_recruiting_stages_id) || null;
      create.mutate(
        {
          ...values,
          guid: id,
          status: ACTIVE,
          applied_at: todayInput(),
          stage_changed_at: new Date().toISOString(),
        },
        {
          onSuccess: () => {
            log(id, text(values.hr_vacancies_id), null, stage, ACTIVE);
            onDone(id);
          },
        },
      );
    },
  };
}

/**
 * Всё, что нужно странице вакансии (vacancy.html прототипа): запись,
 * схемы вакансии и кандидата, этапы её воронки, кандидаты, права и правка.
 *
 * Этапы — воронки самой вакансии (`hr_recruiting_pipelines_id`), по
 * `sort_order`: у каждой вакансии своя копия этапов (SYSTEM-TABLES-AUDIT).
 */
export function useVacancy(guid: string) {
  const record = useItem(VACANCIES, guid, true);
  const { schema, isLoading: schemaLoading } = useTableSchema(VACANCIES);
  const { schema: candidateSchema } = useTableSchema(CANDIDATES);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(VACANCIES);
  const updateCandidate = useUpdateItem(CANDIDATES);
  const stageLog = useStageLog();
  const log = (candidate: string, from: string | null, to: string | null, status: string) =>
    stageLog(candidate, guid, from, to, status);

  /**
   * Смена этапа или статуса кандидата — и запись о ней в истории.
   * Запись — только после ответа: отказ сервера не должен оставить
   * в истории переход, которого не было.
   */
  const transition = (candidate: Item, values: Item, from: string | null, to: string | null, status: string) =>
    updateCandidate.mutate(
      { guid: text(candidate.guid), values },
      { onSuccess: () => log(text(candidate.guid), from, to, status) },
    );

  const candidates = useItems(CANDIDATES, {
    ...ALL,
    filters: { hr_vacancies_id: { op: "is", values: [guid] } },
  });
  const { stages, isLoading: stagesLoading } = usePipelineStages(text(record.item?.hr_recruiting_pipelines_id));

  const all = candidates.page.rows;

  /*
   * Средняя оценка — по `hr_candidate_evaluations`, а не из поля `score`:
   * оно FORMULA без настроек (`table_from` пуст) и не считается вовсе,
   * а настроенное не досчитывало бы (docs/backend-notes.md, «Поле FORMULA»).
   */
  const ids = useMemo(() => all.map((c) => text(c.guid)).filter(Boolean), [all]);
  const evaluations = useItems(ids.length ? EVALUATIONS : undefined, {
    ...ALL,
    filters: { hr_candidates_id: { op: "is", values: ids } },
  });
  const scores = useMemo(() => {
    const sums = new Map<string, { sum: number; n: number }>();
    for (const e of evaluations.page.rows) {
      if (typeof e.score !== "number") continue;
      const id = text(e.hr_candidates_id);
      const acc = sums.get(id) ?? { sum: 0, n: 0 };
      sums.set(id, { sum: acc.sum + e.score, n: acc.n + 1 });
    }
    return new Map([...sums].map(([id, { sum, n }]) => [id, Math.round((sum / n) * 10) / 10]));
  }, [evaluations.page.rows]);
  const columns = useMemo<StageColumn[]>(
    () =>
      stages.map((stage) => ({
          id: text(stage.guid),
          name: text(stage.name),
          color: text(stage.color),
          candidates: all.filter(
            (c) => c.status === ACTIVE && text(c.hr_recruiting_stages_id) === text(stage.guid),
          ),
        })),
    [stages, all],
  );

  return {
    row: record.item,
    isLoading: record.isLoading || schemaLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    candidateFields: candidateSchema.fields,
    candidates: all,
    /** Средняя оценка кандидата из 10; нет оценок — нет ключа. */
    scores,
    candidatesLoading: candidates.isLoading || stagesLoading,
    columns,
    /** Нанятые, отказы и резерв — «Завершённые» прототипа. */
    finished: all.filter((c) => c.status !== ACTIVE),
    can: permissionOf(VACANCIES),
    canMove: permissionOf(CANDIDATES).update,
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
    /** Форма «Редактировать»: все правки — одним запросом. */
    save: (values: Item) => update.mutate({ guid, values }),
    /** Кандидата — на другой этап; с этого момента «на этапе 0 дн.». */
    moveCandidate: (candidate: Item, stage: string) =>
      transition(
        candidate,
        { hr_recruiting_stages_id: stage, stage_changed_at: new Date().toISOString() },
        text(candidate.hr_recruiting_stages_id) || null,
        stage,
        ACTIVE,
      ),
    canAdd: permissionOf(CANDIDATES).write,
    /** Вернуть в воронку из отказа или резерва — `data-rs` прототипа: вход на его этап. */
    restoreCandidate: (candidate: Item) =>
      transition(
        candidate,
        { status: ACTIVE },
        null,
        text(candidate.hr_recruiting_stages_id) || null,
        ACTIVE,
      ),
  };
}
