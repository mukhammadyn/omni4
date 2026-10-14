/**
 * Запись `hr_candidate_stage_history` — переход кандидата по воронке.
 *
 * Событий на `hr_candidates` у проекта нет (`/v2/collections/…/automation`
 * пуст), бэкенд историю не ведёт — её пишет тот, кто меняет этап. Форма —
 * как у записей прежнего HRMS-приложения в той же таблице:
 *   hr_recruiting_stages_id_2 — «С этапа» (пусто — вход в воронку);
 *   hr_recruiting_stages_id   — «На этап» (пусто — выход: нанят, отказ);
 *   status                    — статус кандидата после перехода;
 *   employees_id              — кто перевёл, если своя строка известна;
 *   comment                   — пояснение: причина отказа, откуда перенесён.
 */
export function stageHistoryRow({
  candidate,
  vacancy,
  from,
  to,
  status,
  by,
  at,
  comment,
}: {
  candidate: string;
  vacancy: string;
  from: string | null;
  to: string | null;
  status: string;
  by: string | undefined;
  at: string;
  comment?: string | undefined;
}) {
  return {
    hr_candidates_id: candidate,
    hr_vacancies_id: vacancy,
    hr_recruiting_stages_id_2: from,
    hr_recruiting_stages_id: to,
    status,
    moved_at: at,
    ...(by ? { employees_id: by } : {}),
    ...(comment ? { comment } : {}),
  };
}
