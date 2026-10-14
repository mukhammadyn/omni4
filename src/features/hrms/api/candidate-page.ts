import { useMemo, useRef, useState } from "react";
import { useTablePermissions } from "@/features/auth";
import { useCreateItem, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { session } from "@/shared/api/session";
import { candidateSteps } from "../model/candidate-steps";
import { EMPLOYEES } from "./employee";
import { related, text } from "./org";
import { todayInput } from "@/shared/lib/date-value";
import { VACANCIES } from "./vacancy";
import {
  ALL,
  CANDIDATES,
  EVALUATIONS,
  HISTORY,
  STAGES,
  useCandidateMoves,
  usePipelineStages,
} from "./vacancy-page";

const REASONS = "hr_rejection_reasons";

/**
 * Всё, что нужно странице кандидата (candidate.html прототипа): запись
 * и схема, шаги воронки его вакансии, оценки и комментарии по этапам
 * (`hr_candidate_evaluations`), история переходов
 * (`hr_candidate_stage_history`), причины отказа, права и правки.
 *
 * Воронка — та, что у вакансии кандидата: она приезжает в записи
 * связью (`hr_vacancies_id_data`) с голым id воронки — второй запрос
 * за вакансией не нужен.
 */
export function useCandidate(guid: string) {
  const record = useItem(CANDIDATES, guid, true);
  const { schema, isLoading: schemaLoading } = useTableSchema(CANDIDATES);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(CANDIDATES);
  const moves = useCandidateMoves();
  const createEvaluation = useCreateItem(EVALUATIONS);
  const updateEvaluation = useUpdateItem(EVALUATIONS);

  /*
   * Оценки и комментарии, которые ещё едут на сервер. Оптимистично —
   * своим состоянием, а не правкой кэша: новую строку некуда вставить,
   * не зная ключа списка, а у созданной строки нет `patchRow`, как у
   * правки (её useUpdateItem подставляет сам). Строка уходит из списка
   * ожидающих, когда перезапрос после создания уже принёс её — без
   * мигания; при отказе — сразу, и useCreateItem скажет почему.
   */
  const [pending, setPending] = useState<Item[]>([]);
  /** Балл, поставленный поверх ещё не созданной своей оценки: догоняет её PUT. */
  const latest = useRef(new Map<string, number>());
  const create = (values: Item) => {
    const optimistic: Item = { ...values, guid: crypto.randomUUID(), created_at: new Date().toISOString() };
    setPending((list) => [...list, optimistic]);
    createEvaluation.mutate(optimistic, {
      onSuccess: () => {
        const score = latest.current.get(text(optimistic.guid));
        latest.current.delete(text(optimistic.guid));
        if (score !== undefined && score !== optimistic.score)
          updateEvaluation.mutate({ guid: text(optimistic.guid), values: { score } });
      },
      onSettled: () => setPending((list) => list.filter((x) => x !== optimistic)),
    });
  };

  const row = record.item;
  const { stages } = usePipelineStages(row ? text(related(row, "hr_vacancies_id").hr_recruiting_pipelines_id) : "");
  const own = { hr_candidates_id: { op: "is" as const, values: [guid] } };
  const evaluations = useItems(EVALUATIONS, { ...ALL, filters: own });
  const history = useItems(HISTORY, { ...ALL, filters: own });
  /* Причины нужны только кнопке «Отказ»: она есть у кандидата в работе
     и у того, кто вправе его править. */
  const can = permissionOf(CANDIDATES);
  const reasons = useItems(row?.status === "active" && can.update ? REASONS : undefined, {
    ...ALL,
    relations: false,
  });

  const allEvaluations = useMemo(() => {
    const known = new Set(evaluations.page.rows.map((e) => text(e.guid)));
    const waiting = pending
      .filter((e) => !known.has(text(e.guid)))
      .map((e) => (latest.current.has(text(e.guid)) ? { ...e, score: latest.current.get(text(e.guid)) } : e));
    return [...evaluations.page.rows, ...waiting];
  }, [evaluations.page.rows, pending]);

  /* Сотрудник, заведённый из этого кандидата (`employees.hr_candidates_id`) —
     только у нанятого: «Создать сотрудника» или «Открыть сотрудника». */
  const employee = useItems(row?.status === "hired" ? EMPLOYEES : undefined, {
    limit: 1,
    page: 1,
    relations: false,
    filters: own,
  });
  const createEmployee = useCreateItem(EMPLOYEES);

  const steps = useMemo(
    () => (row ? candidateSteps(stages, row, history.page.rows, allEvaluations) : []),
    [row, stages, history.page.rows, allEvaluations],
  );
  /** Своя строка `employees` из токена; у ADMIN её нет — автор пустой. */
  const me = session.getObjectIds()[EMPLOYEES];

  return {
    row,
    isLoading: record.isLoading || schemaLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    steps,
    evaluations: allEvaluations,
    /** Переходы — новые сверху. */
    history: useMemo(
      () => [...history.page.rows].sort((a, b) => text(b.moved_at).localeCompare(text(a.moved_at))),
      [history.page.rows],
    ),
    /** Причины в справочнике выключают, а не удаляют (`is_active`). */
    reasons: useMemo(() => reasons.page.rows.filter((r) => r.is_active !== false), [reasons.page.rows]),
    me,
    can,
    canEvaluate: permissionOf(EVALUATIONS).write,
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
    move: (stage: string) => row && moves.move(row, stage),
    restore: () => row && moves.restore(row),
    finish: (status: string, values?: Item, comment?: string) => row && moves.finish(row, status, values, comment),
    transfer: (vacancy: string, stage: string | null, comment: string) =>
      row && moves.transfer(row, vacancy, stage, comment),
    /** guid сотрудника из этого кандидата; пусто — не заведён. */
    employee: text(employee.page.rows[0]?.guid),
    canCreateEmployee: permissionOf(EMPLOYEES).write,
    creatingEmployee: createEmployee.isPending,
    /**
     * Сотрудник из нанятого кандидата: имя и контакты — его, должность,
     * отдел, локация и условия — вакансии, приём — день выхода. Почта
     * кандидата — личная: рабочую выдаст компания.
     */
    createEmployee: (onDone: (guid: string) => void) => {
      if (!row) return;
      const id = crypto.randomUUID();
      createEmployee.mutate(employeeFromCandidate(row, id), { onSuccess: () => onDone(id) });
    },
    /**
     * Оценка этапа — своя: правится своя строка оценки с баллом на этом
     * этапе, нет её — заводится. Чужие оценки не трогаются, в балле
     * этапа они складываются в среднее.
     */
    score: (stage: string, score: number) => {
      const mine = allEvaluations.find(
        (e) =>
          text(e.hr_recruiting_stages_id) === stage &&
          typeof e.score === "number" &&
          text(e.employees_id) === (me ?? ""),
      );
      if (!mine) return create(evaluationRow(guid, stage, me, { score }));
      /* Своя оценка ещё создаётся: PUT раньше POST ушёл бы в пустоту —
         балл ждёт создания (см. create) и пока виден из ожидающих. */
      if (pending.some((e) => e.guid === mine.guid)) {
        latest.current.set(text(mine.guid), score);
        setPending((list) => [...list]); // перерисовать: балл лежит в ref
        return;
      }
      updateEvaluation.mutate({ guid: text(mine.guid), values: { score } });
    },
    /** Комментарий к этапу — отдельной строкой оценки, без балла. */
    comment: (stage: string, comment: string) => create(evaluationRow(guid, stage, me, { comment })),
  };
}

function evaluationRow(candidate: string, stage: string, by: string | undefined, values: Item): Item {
  return {
    hr_candidates_id: candidate,
    hr_recruiting_stages_id: stage,
    ...(by ? { employees_id: by } : {}),
    ...values,
  };
}

/** Строка `employees` из нанятого кандидата. Пустые значения не пишутся. */
export function employeeFromCandidate(candidate: Item, guid: string): Item {
  const vacancy = related(candidate, "hr_vacancies_id");
  const values: Item = {
    guid,
    hr_candidates_id: candidate.guid,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    full_name: candidate.full_name,
    phone: candidate.phone,
    personal_email: candidate.email,
    telegram_username: candidate.telegram_username,
    photo: candidate.photo,
    positions_id: vacancy.positions_id,
    departments_id: vacancy.departments_id,
    locations_id: vacancy.locations_id,
    work_format: vacancy.work_format,
    employment_type: vacancy.employment_type,
    hire_date: text(candidate.start_date) || todayInput(),
    status: "active",
  };
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

/**
 * Куда перенести кандидата: вакансии, кроме закрытых и его собственной,
 * и первый этап воронки каждой. Грузится, только пока выбор открыт.
 */
export function useTransferChoices(enabled: boolean, current: string) {
  const vacancies = useItems(enabled ? VACANCIES : undefined, { ...ALL, relations: false });
  const stages = useItems(enabled ? STAGES : undefined, { ...ALL, relations: false });
  return useMemo(() => {
    const first = new Map<string, string>();
    for (const stage of [...stages.page.rows].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))) {
      const pipeline = text(stage.hr_recruiting_pipelines_id);
      if (!first.has(pipeline)) first.set(pipeline, text(stage.guid));
    }
    return {
      loading: vacancies.isLoading || stages.isLoading,
      choices: vacancies.page.rows
        .filter((v) => v.status !== "closed" && text(v.guid) !== current)
        .map((v) => ({
          id: text(v.guid),
          title: text(v.title),
          stage: first.get(text(v.hr_recruiting_pipelines_id)) ?? null,
        })),
    };
  }, [vacancies.page.rows, stages.page.rows, vacancies.isLoading, stages.isLoading, current]);
}
