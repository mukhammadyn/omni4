/**
 * Воронка вакансии — по её кандидатам, как `funnel()` и `REC.hired()`
 * в прототипе (vacancies.html): своих полей-счётчиков у вакансии нет,
 * а FORMULA их не досчитывает (docs/backend-notes.md, «Поле FORMULA»).
 */

export type Stage = { id: string; name: string; color: string; order: number };

export type Candidate = { vacancyId: string; stageId: string; status: string };

export type Funnel = {
  /** Все кандидаты вакансии, в любом статусе. */
  total: number;
  hired: number;
  /** Активные по этапам, в порядке этапов; пустые этапы пропущены. */
  stages: { stage: Stage; count: number }[];
};

/** Статусы кандидата — варианты PICK_LIST `hr_candidates.status`. */
const ACTIVE = "active";
const HIRED = "hired";

export const EMPTY_FUNNEL: Funnel = { total: 0, hired: 0, stages: [] };

export function funnels(candidates: Candidate[], stages: Stage[]): Map<string, Funnel> {
  const byStage = new Map(stages.map((stage) => [stage.id, stage]));
  const counts = new Map<string, { total: number; hired: number; active: Map<string, number> }>();

  for (const candidate of candidates) {
    let entry = counts.get(candidate.vacancyId);
    if (!entry) counts.set(candidate.vacancyId, (entry = { total: 0, hired: 0, active: new Map() }));

    entry.total += 1;
    if (candidate.status === HIRED) entry.hired += 1;
    if (candidate.status === ACTIVE && byStage.has(candidate.stageId)) {
      entry.active.set(candidate.stageId, (entry.active.get(candidate.stageId) ?? 0) + 1);
    }
  }

  const result = new Map<string, Funnel>();
  for (const [vacancyId, entry] of counts) {
    result.set(vacancyId, {
      total: entry.total,
      hired: entry.hired,
      stages: [...entry.active]
        .map(([id, count]) => ({ stage: byStage.get(id)!, count }))
        .sort((a, b) => a.stage.order - b.stage.order),
    });
  }
  return result;
}
