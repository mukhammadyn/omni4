import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { PEOPLE, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { api, ApiError } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";
import { PARTICIPANT, SURVEY_STATUS, type Definition } from "../model/survey";
import { participantsDiff } from "../model/training";
import { upsert } from "./schedule";
import i18n from "@/shared/lib/i18n";
import { related, text } from "./org";
import { ALL } from "./vacancy-page";

export const SURVEYS = "hr_surveys";
export const SURVEY_PARTICIPANTS = "hr_survey_participants";
export const SURVEY_RESPONSES = "hr_survey_responses";

/** Назначения опросов `ids` по опросу: колонки списка. */
export function useSurveyParticipants(ids: string[]) {
  const query = useItems(ids.length ? SURVEY_PARTICIPANTS : undefined, {
    ...ALL,
    filters: { hr_surveys_id: { op: "is", values: ids } },
  });
  return useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const row of query.page.rows) {
      const id = text(row.hr_surveys_id);
      map.set(id, [...(map.get(id) ?? []), row]);
    }
    return map;
  }, [query.page.rows]);
}

/**
 * «Дублировать»: те же вопросы и настройки черновиком, без назначений
 * и ответов — как в прототипе. Автор копии — тот, кто копирует.
 */
export function useDuplicateSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ row, suffix }: { row: Item; suffix: string }) =>
      api.post<unknown>(`/v2/items/${SURVEYS}`, {
        data: {
          guid: crypto.randomUUID(),
          title: `${text(row.title)} ${suffix}`,
          type: row.type ?? null,
          definition: row.definition ?? null,
          is_anonymous: Boolean(row.is_anonymous),
          date_from: row.date_from ?? null,
          date_to: row.date_to ?? null,
          status: SURVEY_STATUS.draft,
          core_users_id: session.getObjectIds()[PEOPLE] ?? null,
        },
      }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.items.table(SURVEYS) }),
  });
}


export type SurveyParticipant = { id: string; employeeId: string; row: Item };

/** Опрос, его схема и назначения — для формы. `guid` пуст — новый. */
export function useSurveyDraftSource(guid: string) {
  const record = useItem(SURVEYS, guid, Boolean(guid));
  const { schema, isLoading } = useTableSchema(SURVEYS);
  const participants = useItems(guid ? SURVEY_PARTICIPANTS : undefined, {
    ...ALL,
    relations: false,
    filters: { hr_surveys_id: { op: "is", values: [guid] } },
  });
  return {
    row: record.item,
    isLoading: (Boolean(guid) && (record.isLoading || participants.isLoading)) || isLoading,
    fields: schema.fields,
    relations: schema.relations,
    participants: useMemo(
      () => participants.page.rows.map((row): SurveyParticipant => ({ id: text(row.guid), employeeId: text(row.hr_employees_id), row })),
      [participants.page.rows],
    ),
  };
}

export type SurveySave = {
  /** Пусто — новый опрос. */
  guid: string;
  /** Поля опроса: у нового — все, у правки — только изменённые. */
  values: Item;
  definition: Definition;
  participants: SurveyParticipant[];
  employeeIds: string[];
};

/**
 * Назначение: добавить новых, снять убранных. У оставшихся статус
 * и ответы не трогаются.
 *
 * ponytail: через items API — два запроса, без транзакции; удаление после
 * записи, чтобы сбой оставил лишнее, а не потерял. Заменить облачной
 * функцией назначения (как `survey_assign_employees` в udevs_hrms_admin),
 * когда она появится в omni4.
 */
export async function assign(survey: string, participants: SurveyParticipant[], employeeIds: string[]) {
  const { add, remove } = participantsDiff(participants, employeeIds);
  await upsert(
    SURVEY_PARTICIPANTS,
    add.map((employee) => ({ guid: crypto.randomUUID(), hr_surveys_id: survey, hr_employees_id: employee, status: PARTICIPANT.pending })),
  );
  if (remove.length) await api.delete<unknown>(`/v1/object/${SURVEY_PARTICIPANTS}`, { data: { ids: remove } });
}

/**
 * Сохранение формы опроса: запись (вопросы — JSON-строкой в `definition`,
 * как её хранит udevs_hrms_admin), затем назначения. Новому опросу автор —
 * тот, кто создал. Возвращает guid.
 */
export function useSaveSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (save: SurveySave) => {
      const guid = save.guid || crypto.randomUUID();
      const data = { ...save.values, definition: JSON.stringify(save.definition), guid };
      if (save.guid) await api.put<unknown>(`/v2/items/${SURVEYS}`, { data });
      else await api.post<unknown>(`/v2/items/${SURVEYS}`, { data: { core_users_id: session.getObjectIds()[PEOPLE] ?? null, ...data } });
      await assign(guid, save.participants, save.employeeIds);
      return guid;
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all([SURVEYS, SURVEY_PARTICIPANTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) }))),
  });
}

/** Назначить сотрудников со страницы опроса — «Выбрать сотрудников». */
export function useAssignSurvey(guid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ participants, employeeIds }: { participants: SurveyParticipant[]; employeeIds: string[] }) =>
      assign(guid, participants, employeeIds),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.items.table(SURVEY_PARTICIPANTS) }),
  });
}

/**
 * Всё для страницы опроса (survey.html прототипа): запись, схема,
 * назначения с сотрудниками, ответы, права и правка поля.
 */
export function useSurvey(guid: string) {
  const record = useItem(SURVEYS, guid, true);
  const { schema, isLoading: schemaLoading } = useTableSchema(SURVEYS);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(SURVEYS);
  const participants = useItems(guid ? SURVEY_PARTICIPANTS : undefined, {
    ...ALL,
    filters: { hr_surveys_id: { op: "is", values: [guid] } },
  });
  const responses = useItems(guid ? SURVEY_RESPONSES : undefined, {
    ...ALL,
    relations: false,
    filters: { hr_surveys_id: { op: "is", values: [guid] } },
  });
  return {
    row: record.item,
    isLoading: record.isLoading || schemaLoading || participants.isLoading || responses.isLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    participants: useMemo(
      () => participants.page.rows.map((row): SurveyParticipant => ({ id: text(row.guid), employeeId: text(row.hr_employees_id), row })),
      [participants.page.rows],
    ),
    responses: responses.page.rows,
    can: permissionOf(SURVEYS),
    canAssign: permissionOf(SURVEY_PARTICIPANTS).write,
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
  };
}

/** Назначения сотрудника с опросами (связь) и его ответы — вкладка «Опросы». */
export function useEmployeeSurveys(employeeId: string) {
  const participants = useItems(employeeId ? SURVEY_PARTICIPANTS : undefined, {
    ...ALL,
    filters: { hr_employees_id: { op: "is", values: [employeeId] } },
  });
  const responses = useItems(employeeId ? SURVEY_RESPONSES : undefined, {
    ...ALL,
    relations: false,
    filters: { hr_employees_id: { op: "is", values: [employeeId] } },
  });
  return {
    participants: participants.page.rows,
    responses: responses.page.rows,
    isLoading: participants.isLoading || responses.isLoading,
  };
}

type One = { data?: { data?: { response?: Item } } };
const fetchOne = async (slug: string, guid: string) => (await api.get<One>(`/v2/items/${slug}/${guid}`)).data?.data?.response ?? {};

export type SurveySubmit = { participant: Item; answers: Record<string, unknown> };

/**
 * «Отправить» — ответ сотрудника: строка в `hr_survey_responses`
 * и назначение «Пройден». Перед записью: опрос активен — по опросу
 * из связи назначения (свою запись `hr_surveys` роль сотрудника
 * читать не обязана, а одиночный GET связей не отдаёт); второй раз
 * не проходят — по свежему назначению. Как `survey_submit`
 * в udevs-hrms-reports.
 *
 * ponytail: проверка и две записи — с клиента, без транзакции;
 * гонка двух отправок разом даст два ответа. Заменить облачной
 * функцией прохождения, когда она появится в omni4.
 */
export function useSubmitSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ participant, answers }: SurveySubmit) => {
      const surveyId = text(participant.hr_surveys_id);
      const fresh = await fetchOne(SURVEY_PARTICIPANTS, text(participant.guid));
      if (related(participant, "hr_surveys_id").status !== SURVEY_STATUS.active) throw new Error(i18n.t("survey.take.notActive"));
      if (fresh.status === PARTICIPANT.completed) throw new Error(i18n.t("survey.take.already"));

      const employee = related(participant, "hr_employees_id");
      const now = new Date().toISOString();
      await api.post<unknown>(`/v2/items/${SURVEY_RESPONSES}`, {
        data: {
          guid: crypto.randomUUID(),
          hr_surveys_id: surveyId,
          hr_employees_id: text(participant.hr_employees_id),
          hr_departments_id: text(employee.hr_departments_id) || null,
          answers: JSON.stringify(answers),
          completed_at: now,
        },
      });
      await api.put<unknown>(`/v2/items/${SURVEY_PARTICIPANTS}`, {
        data: { guid: text(participant.guid), status: PARTICIPANT.completed, completed_at: now },
      });
    },
    /* Свой отказ (не активен, уже пройден) — своим текстом; ответ сервера — как обычно. */
    onError: (error) => (error instanceof ApiError || !(error instanceof Error) ? reportError(error, "common.saveFailed") : toast.error(error.message)),
    onSettled: () =>
      Promise.all([SURVEY_PARTICIPANTS, SURVEY_RESPONSES].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) }))),
  });
}
