import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { colorOf, PEOPLE, useItems, type Item } from "@/features/item";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { CHIP_HEX, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { firstText, related, text } from "./org";
import { ALL } from "./vacancy-page";

export const DOCUMENTS = "hr_documents";
export const DOCUMENT_FOLDERS = "hr_document_folders";

export type DocFolder = { id: string; name: string; color: ChipColor };

export type Doc = {
  id: string;
  title: string;
  /** Номер документа (`number`). */
  number: string;
  /** Действует до (`valid_until`), YYYY-MM-DD; пусто — бессрочный. */
  validUntil: string;
  url: string;
  date: string;
  folderId: string;
  employeeId: string;
  employeeName: string;
  employeePhoto: string;
  departmentId: string;
  /** Кто загрузил — `core_users`; пусто — сотрудник сам или старая запись. */
  uploadedBy: string;
};

function toDoc(row: Item): Doc {
  const person = related(row, "hr_employees_id");
  return {
    id: text(row.guid),
    title: text(row.title),
    number: text(row.number),
    validUntil: text(row.valid_until).slice(0, 10),
    url: text(row.file),
    date: text(row.date) || text(row.created_at).slice(0, 10),
    folderId: text(row.hr_document_folders_id),
    employeeId: text(row.hr_employees_id),
    employeeName: text(person.full_name),
    employeePhoto: firstText(person.photo),
    departmentId: text(person.hr_departments_id),
    uploadedBy: text(related(row, "core_users_id").full_name),
  };
}

const newest = (a: Doc, b: Doc) => b.date.localeCompare(a.date);

/**
 * Документы — все или одного сотрудника — и папки. Папка — строка
 * `hr_document_folders`; цвет свой, иначе от имени, как у отделов.
 *
 * ponytail: весь список одним запросом, потолок — MAX_LIMIT (ALL).
 * Документов станет больше тысячи — грузить папку по открытию.
 */
export function useDocuments(employeeId?: string) {
  const docs = useItems(DOCUMENTS, {
    ...ALL,
    ...(employeeId ? { filters: { hr_employees_id: { op: "is", values: [employeeId] } } } : {}),
  });
  const folders = useItems(DOCUMENT_FOLDERS, { ...ALL, relations: false });
  const can = useTablePermissions()(DOCUMENTS);
  return {
    docs: useMemo(() => docs.page.rows.map(toDoc).sort(newest), [docs.page.rows]),
    folders: useMemo(
      () =>
        [...folders.page.rows]
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
          .map((row): DocFolder => {
            const name = text(row.name);
            return { id: text(row.guid), name, color: text(row.color) ? hexToChipColor(text(row.color)) : colorOf(name) };
          }),
      [folders.page.rows],
    ),
    isLoading: docs.isLoading || folders.isLoading,
    can,
  };
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([DOCUMENTS, DOCUMENT_FOLDERS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })));
}

/** Загрузить: файлы уже в хранилище (useUploadFiles), здесь — строки. */
export function useAddDocuments() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      files,
      employee,
      folder,
      template = "",
      number = "",
      validUntil = "",
    }: {
      files: { url: string; name: string }[];
      employee: string;
      folder: string;
      template?: string;
      number?: string;
      validUntil?: string;
    }) => {
      for (const file of files) {
        await api.post<unknown>(`/v2/items/${DOCUMENTS}`, {
          data: {
            guid: crypto.randomUUID(),
            title: file.name,
            file: file.url,
            date: todayInput(),
            source: "hr",
            signature_status: "not_required",
            hr_employees_id: employee,
            hr_document_folders_id: folder || null,
            hr_document_templates_id: template || null,
            number: number || null,
            valid_until: validUntil || null,
            core_users_id: session.getObjectIds()[PEOPLE] ?? null,
          },
        });
      }
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

export function useMoveDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, folder }: { id: string; folder: string }) =>
      api.put<unknown>(`/v2/items/${DOCUMENTS}`, { data: { guid: id, hr_document_folders_id: folder || null } }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

/** Номер и срок действия — правка из окна документа. */
export function useUpdateDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, number, validUntil }: { id: string; number?: string; validUntil?: string }) =>
      api.put<unknown>(`/v2/items/${DOCUMENTS}`, {
        data: {
          guid: id,
          ...(number !== undefined ? { number: number || null } : {}),
          ...(validUntil !== undefined ? { valid_until: validUntil || null } : {}),
        },
      }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<unknown>(`/v2/items/${DOCUMENTS}/${id}`, { data: { data: {} } }),
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSettled: invalidate,
  });
}

/** Новая папка (без `id`) или правка имени и цвета. Цвет — HEX палитры. */
export function useSaveFolder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name, color, order }: { id?: string; name: string; color: ChipColor; order?: number }) =>
      id
        ? api.put<unknown>(`/v2/items/${DOCUMENT_FOLDERS}`, { data: { guid: id, name, color: CHIP_HEX[color] } })
        : api.post<unknown>(`/v2/items/${DOCUMENT_FOLDERS}`, {
            data: { guid: crypto.randomUUID(), name, color: CHIP_HEX[color], sort_order: order ?? 0 },
          }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

/**
 * Порядок папок: `sort_order` по месту в списке. Пишутся только
 * сдвинутые — у старых папок порядок бывает пустым или одинаковым.
 */
export function useReorderFolders() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [index, guid] of ids.entries())
        await api.put<unknown>(`/v2/items/${DOCUMENT_FOLDERS}`, { data: { guid, sort_order: index + 1 } });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: invalidate,
  });
}

/**
 * Удалить папку. Документы не удаляются — уходят в «Без папки»: иначе
 * у них осталась бы ссылка на несуществующую строку.
 *
 * ponytail: по PUT на документ, без транзакции; сначала документы — сбой
 * оставит папку, а не документы-сироты. Папок с тысячами файлов не ждём.
 */
export function useDeleteFolder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, docs }: { id: string; docs: string[] }) => {
      for (const guid of docs) await api.put<unknown>(`/v2/items/${DOCUMENTS}`, { data: { guid, hr_document_folders_id: null } });
      await api.delete<unknown>(`/v2/items/${DOCUMENT_FOLDERS}/${id}`, { data: { data: {} } });
    },
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSettled: invalidate,
  });
}
