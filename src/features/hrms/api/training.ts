import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { PEOPLE, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { ASSIGNED, HOMEWORK, homeworkStatusFor, participantRow, participantsDiff } from "../model/training";
import { text } from "./org";
import { upsert } from "./schedule";
import { ALL } from "./vacancy-page";

export const TRAININGS = "hr_trainings";
export const PARTICIPANTS = "hr_training_participants";
export const MATERIALS = "hr_training_materials";

export type Participant = { id: string; employeeId: string; row: Item };
export type Material = { id: string; title: string; type: string; file: string; url: string };
/** Материал из формы: ещё не записан — без id. */
export type MaterialDraft = Omit<Material, "id"> & { id?: string };

const toParticipant = (row: Item): Participant => ({ id: text(row.guid), employeeId: text(row.hr_employees_id), row });
const toMaterial = (row: Item): Material => ({
  id: text(row.guid),
  title: text(row.title),
  type: text(row.type),
  file: text(row.file),
  url: text(row.url),
});
const byOrder = (a: Item, b: Item) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);

/** Участники тренингов `ids` по тренингу: колонки списка. */
export function useTrainingParticipants(ids: string[]) {
  const query = useItems(ids.length ? PARTICIPANTS : undefined, {
    ...ALL,
    filters: { hr_trainings_id: { op: "is", values: ids } },
  });
  return useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const row of query.page.rows) {
      const id = text(row.hr_trainings_id);
      map.set(id, [...(map.get(id) ?? []), row]);
    }
    return map;
  }, [query.page.rows]);
}

/** Участники и материалы одного тренинга: страница и форма. */
function useTrainingParts(guid: string) {
  const participants = useItems(guid ? PARTICIPANTS : undefined, {
    ...ALL,
    filters: { hr_trainings_id: { op: "is", values: [guid] } },
  });
  const materials = useItems(guid ? MATERIALS : undefined, {
    ...ALL,
    relations: false,
    filters: { hr_trainings_id: { op: "is", values: [guid] } },
  });
  return {
    participants: useMemo(() => participants.page.rows.map(toParticipant), [participants.page.rows]),
    materials: useMemo(() => [...materials.page.rows].sort(byOrder).map(toMaterial), [materials.page.rows]),
    partsLoading: Boolean(guid) && (participants.isLoading || materials.isLoading),
  };
}

/**
 * Всё, что нужно странице тренинга (training.html прототипа): запись,
 * схемы, участники с ДЗ, материалы, права и правка.
 */
export function useTraining(guid: string) {
  const record = useItem(TRAININGS, guid, true);
  const { schema, isLoading: schemaLoading } = useTableSchema(TRAININGS);
  const { schema: participantSchema } = useTableSchema(PARTICIPANTS);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(TRAININGS);
  const updateParticipant = useUpdateItem(PARTICIPANTS);
  const parts = useTrainingParts(guid);

  /** Проверка ДЗ: кто и когда — вместе с итогом. */
  const review = (participant: string, values: Item) =>
    updateParticipant.mutate({
      guid: participant,
      values: { ...values, reviewed_at: new Date().toISOString(), core_users_id: session.getObjectIds()[PEOPLE] ?? null },
    });

  return {
    row: record.item,
    isLoading: record.isLoading || schemaLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    participantFields: participantSchema.fields,
    ...parts,
    can: permissionOf(TRAININGS),
    canReview: permissionOf(PARTICIPANTS).update,
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
    /** «Принять»: оценка из 10 и необязательный отзыв. */
    accept: (participant: string, score: number, comment: string) =>
      review(participant, { homework_status: HOMEWORK.accepted, score, review_comment: comment }),
    /** «Отклонить»: на доработку с тем, что доработать. */
    reject: (participant: string, comment: string) =>
      review(participant, { homework_status: HOMEWORK.rejected, review_comment: comment }),
  };
}

export type TrainingSave = {
  /** Пусто — новый тренинг. */
  guid: string;
  /** Поля тренинга: у нового — все, у правки — только изменённые. */
  values: Item;
  /** Требуется ли ДЗ после сохранения. */
  homework: boolean;
  participants: Participant[];
  employeeIds: string[];
  materials: Material[];
  nextMaterials: MaterialDraft[];
};

/**
 * Сохранение формы тренинга: сама запись, затем участники и материалы.
 *
 * Запись — обычным POST/PUT, как ячейка: правка уходит только
 * изменёнными полями. Участники и материалы — upsert-many пачкой
 * (справочник API, §4.3); удаление — после записи новых, чтобы сбой
 * оставил лишнее, а не потерял. У оставшихся участников меняется только
 * статус ДЗ, если ДЗ включили или сняли. Возвращает guid тренинга.
 */
export function useSaveTraining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (save: TrainingSave) => {
      const guid = save.guid || crypto.randomUUID();
      if (save.guid) await api.put<unknown>(`/v2/items/${TRAININGS}`, { data: { ...save.values, guid } });
      else await api.post<unknown>(`/v2/items/${TRAININGS}`, { data: { ...save.values, guid } });

      const { add, remove } = participantsDiff(save.participants, save.employeeIds);
      await upsert(PARTICIPANTS, add.map((employee) => participantRow(guid, employee, save.homework)));
      /* Ключи not null — тоже: Postgres проверяет их до ON CONFLICT. */
      await upsert(
        PARTICIPANTS,
        save.participants
          .filter((p) => !remove.includes(p.id))
          .filter((p) => homeworkStatusFor(save.homework, p.row.homework_status) !== p.row.homework_status)
          .map((p) => ({
            guid: p.id,
            hr_trainings_id: guid,
            hr_employees_id: p.employeeId,
            status: text(p.row.status) || ASSIGNED,
            homework_status: homeworkStatusFor(save.homework, p.row.homework_status),
          })),
      );
      if (remove.length) await api.delete<unknown>(`/v1/object/${PARTICIPANTS}`, { data: { ids: remove } });

      await upsert(
        MATERIALS,
        save.nextMaterials.flatMap((m, index) =>
          m.id
            ? []
            : [{ guid: crypto.randomUUID(), hr_trainings_id: guid, title: m.title, type: m.type, file: m.file || null, url: m.url || null, sort_order: index }],
        ),
      );
      const keptMaterials = new Set(save.nextMaterials.map((m) => m.id));
      const dropped = save.materials.filter((m) => !keptMaterials.has(m.id)).map((m) => m.id);
      if (dropped.length) await api.delete<unknown>(`/v1/object/${MATERIALS}`, { data: { ids: dropped } });
      return guid;
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all([TRAININGS, PARTICIPANTS, MATERIALS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) }))),
  });
}

/** Для формы правки: то же, что у страницы, без проверки ДЗ. */
export function useTrainingDraftSource(guid: string) {
  const record = useItem(TRAININGS, guid, Boolean(guid));
  const { schema, isLoading } = useTableSchema(TRAININGS);
  return {
    row: record.item,
    isLoading: (Boolean(guid) && record.isLoading) || isLoading,
    fields: schema.fields,
    relations: schema.relations,
    ...useTrainingParts(guid),
  };
}
