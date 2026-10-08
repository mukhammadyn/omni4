import { useMemo } from "react";
import { useTablePermissions } from "@/features/auth";
import { useItem, useItems } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { text } from "./org";
import { VACANCIES } from "./vacancy";
import { ALL, CANDIDATES, useCreateCandidate, usePipelineStages } from "./vacancy-page";

const SOURCES = "hr_candidate_sources";

/**
 * Всё для формы нового кандидата (candidate.html `form()` прототипа):
 * схема кандидата, выбранная вакансия, этапы её воронки — на какой
 * поставить — и источники откликов.
 */
export function useNewCandidate(vacancy: string) {
  const { schema, isLoading } = useTableSchema(CANDIDATES);
  const permissionOf = useTablePermissions();
  const record = useItem(VACANCIES, vacancy, Boolean(vacancy));
  const pipeline = text(record.item?.hr_recruiting_pipelines_id);
  const { stages } = usePipelineStages(pipeline);
  const sources = useItems(SOURCES, ALL);
  const create = useCreateCandidate();

  return {
    fields: schema.fields,
    relations: useMemo(() => new Map(schema.relations.map((r) => [r.id, r])), [schema.relations]),
    isLoading,
    vacancy: record.item,
    stages,
    sources: sources.page.rows,
    canAdd: permissionOf(CANDIDATES).write,
    ...create,
  };
}
