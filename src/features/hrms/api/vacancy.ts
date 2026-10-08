import { useMemo } from "react";
import { MAX_LIMIT, useItems, type Item } from "@/features/item";
import { funnels, type Candidate, type Funnel, type Stage } from "../model/vacancy-funnel";
import { planRow, type PlanCandidate, type PlanEmployee, type PlanRow } from "../model/vacancy-plan";
import { EMPLOYEES } from "./employee";
import { text } from "./org";

/** Вакансии HRMS (`ucode/erp/erp.dbml`). */
export const VACANCIES = "hr_vacancies";

const ALL = { limit: MAX_LIMIT, page: 1 };

const toStage = (row: Item): Stage => ({
  id: text(row.guid),
  name: text(row.name),
  color: text(row.color),
  order: typeof row.sort_order === "number" ? row.sort_order : 0,
});

const toCandidate = (row: Item): Candidate & PlanCandidate => ({
  id: text(row.guid),
  vacancyId: text(row.hr_vacancies_id),
  stageId: text(row.hr_recruiting_stages_id),
  status: text(row.status),
  hiredAt: text(row.hired_at),
});

const toEmployee = (row: Item): PlanEmployee => ({
  positionId: text(row.positions_id),
  departmentId: text(row.departments_id),
  locationId: text(row.locations_id),
  dismissalDate: text(row.dismissal_date),
  candidateId: text(row.hr_candidates_id),
});

/**
 * Кандидаты вакансий на экране — одним запросом. Таблица, карточки
 * и планирование спрашивают одно и то же, и кэш у них общий.
 */
function useCandidates(vacancyIds: string[]) {
  // ponytail: одна порция в MAX_LIMIT кандидатов на страницу вакансий;
  // упрётся — считать на бэкенде функцией (docs/backend-notes.md, FORMULA).
  const query = useItems(vacancyIds.length ? "hr_candidates" : undefined, {
    ...ALL,
    filters: { hr_vacancies_id: { op: "is", values: vacancyIds } },
  });
  const rows = useMemo(() => query.page.rows.map(toCandidate), [query.page.rows]);
  return { rows, isLoading: query.isLoading };
}

/**
 * Воронки вакансий на экране и справочник этапов. Без вакансий —
 * запросов нет. `null`, пока ответа нет: ноль кандидатов до загрузки —
 * неправда.
 */
export function useVacancyFunnels(vacancyIds: string[]): Map<string, Funnel> | null {
  const candidates = useCandidates(vacancyIds);
  const stages = useItems(vacancyIds.length ? "hr_recruiting_stages" : undefined, ALL);

  const loading = candidates.isLoading || stages.isLoading;
  return useMemo(
    () => (loading ? null : funnels(candidates.rows, stages.page.rows.map(toStage))),
    [loading, candidates.rows, stages.page.rows],
  );
}

/**
 * Итоги планирования по каждой вакансии (model/vacancy-plan).
 * Сотрудники — только тех должностей, что есть у вакансий на экране.
 */
export function useVacancyPlan(vacancies: Item[], today: string): Map<string, PlanRow> | null {
  const ids = useMemo(() => vacancies.map((row) => text(row.guid)).filter(Boolean), [vacancies]);
  const positions = useMemo(
    () => [...new Set(vacancies.map((row) => text(row.positions_id)).filter(Boolean))],
    [vacancies],
  );
  const candidates = useCandidates(ids);
  // ponytail: MAX_LIMIT сотрудников этих должностей — потолок одной порции.
  const employees = useItems(positions.length ? EMPLOYEES : undefined, {
    ...ALL,
    filters: { positions_id: { op: "is", values: positions } },
  });

  const loading = candidates.isLoading || employees.isLoading;
  return useMemo(() => {
    if (loading) return null;
    const staff = employees.page.rows.map(toEmployee);
    return new Map(
      vacancies.map((row) => [
        text(row.guid),
        planRow(
          {
            id: text(row.guid),
            positionId: text(row.positions_id),
            departmentId: text(row.departments_id),
            locationId: text(row.locations_id),
            headcount: typeof row.headcount === "number" ? row.headcount : 0,
            openedAt: text(row.opened_at),
            deadline: text(row.deadline),
          },
          candidates.rows,
          staff,
          today,
        ),
      ]),
    );
  }, [loading, vacancies, candidates.rows, employees.page.rows, today]);
}
