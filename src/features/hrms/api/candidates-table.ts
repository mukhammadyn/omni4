import { useMemo } from "react";
import { useItems, type Item } from "@/features/item";
import { related, text } from "./org";
import { VACANCIES } from "./vacancy";
import { ALL, STAGES, useCandidateScores } from "./vacancy-page";

/**
 * Что нужно таблице кандидатов сверх самих строк: оценки, отдел
 * вакансии и следующий этап воронки.
 *
 * Отдел — второй строкой под вакансией. У строки кандидата вакансия
 * приезжает целиком (`hr_vacancies_id_data`), но у неё самой отдел —
 * голый id: связи второго уровня get-list не разворачивает. Поэтому
 * вакансии этих строк спрашиваются отдельно, с их связями.
 *
 * Следующий этап — по воронке этапа (`hr_recruiting_pipelines_id`)
 * и `sort_order`: этапы у каждой воронки свои (SYSTEM-TABLES-AUDIT),
 * и «дальше» значит «дальше в той же воронке». Этапов в проекте
 * десятки, они грузятся целиком один раз.
 */
export function useCandidatesTable(rows: Item[]) {
  const ids = useMemo(() => rows.map((row) => text(row.guid)).filter(Boolean), [rows]);
  const scores = useCandidateScores(ids);

  const vacancyIds = useMemo(
    () => [...new Set(rows.map((row) => text(row.hr_vacancies_id)).filter(Boolean))],
    [rows],
  );
  const vacancies = useItems(vacancyIds.length ? VACANCIES : undefined, {
    ...ALL,
    filters: { guid: { op: "is", values: vacancyIds } },
  });
  const departments = useMemo(
    () =>
      new Map(
        vacancies.page.rows.map((row) => [text(row.guid), text(related(row, "departments_id").name)]),
      ),
    [vacancies.page.rows],
  );

  const stages = useItems(rows.length ? STAGES : undefined, { ...ALL, relations: false });
  const nextStage = useMemo(() => nextStages(stages.page.rows), [stages.page.rows]);

  return { scores, departments, nextStage };
}

/** Этап → следующий этап той же воронки. У последнего следующего нет. */
export function nextStages(stages: Item[]): Map<string, string> {
  const byPipeline = new Map<string, Item[]>();
  for (const stage of stages) {
    const pipeline = text(stage.hr_recruiting_pipelines_id);
    byPipeline.set(pipeline, [...(byPipeline.get(pipeline) ?? []), stage]);
  }

  const next = new Map<string, string>();
  for (const list of byPipeline.values()) {
    list.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    list.forEach((stage, at) => {
      const after = list[at + 1];
      if (after) next.set(text(stage.guid), text(after.guid));
    });
  }
  return next;
}
