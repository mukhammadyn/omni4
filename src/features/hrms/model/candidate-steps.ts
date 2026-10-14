import type { Item } from "@/features/item";

const text = (value: unknown) => (typeof value === "string" ? value : "");

export type StageStep = {
  id: string;
  name: string;
  color: string;
  /** Этап пройден или идёт — у него есть оценки и комментарии. */
  done: boolean;
  /** Кандидат сейчас на нём. У нанятого текущего нет: воронка пройдена. */
  current: boolean;
  /** Средняя оценка этапа из 10, до десятых; нет оценок — нет. */
  score: number | undefined;
  /** С какого момента на этапе: последний вход по истории. */
  since: string;
};

/**
 * Шаги воронки кандидата — `.cd-step` прототипа.
 *
 * Пройдены — этапы до текущего по порядку воронки, у нанятого — все:
 * так считает прототип (`enrich`), и история для этого не нужна —
 * у кандидатов, заведённых до того, как фронт её писал, её нет.
 * История даёт только дату входа; нет её у текущего этапа —
 * `stage_changed_at` кандидата.
 */
export function candidateSteps(
  stages: Item[],
  candidate: Item,
  history: Item[],
  evaluations: Item[],
): StageStep[] {
  const stageId = text(candidate.hr_recruiting_stages_id);
  const hired = candidate.status === "hired";
  const at = stages.findIndex((stage) => text(stage.guid) === stageId);

  return stages.map((stage, i) => {
    const id = text(stage.guid);
    const scores = evaluations
      .filter((e) => text(e.hr_recruiting_stages_id) === id && typeof e.score === "number")
      .map((e) => e.score as number);
    const entries = history
      .filter((h) => text(h.hr_recruiting_stages_id) === id)
      .map((h) => text(h.moved_at))
      .sort();
    const current = !hired && id === stageId;

    return {
      id,
      name: text(stage.name),
      color: text(stage.color),
      done: hired || (at >= 0 && i <= at),
      current,
      score: scores.length
        ? Math.round((scores.reduce((sum, x) => sum + x, 0) / scores.length) * 10) / 10
        : undefined,
      since: entries.at(-1) ?? (id === stageId ? text(candidate.stage_changed_at) : ""),
    };
  });
}
