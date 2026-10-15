import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, PEOPLE, patchRow, useItems, type Item, type ItemsResponseDto } from "@/features/item";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { session } from "@/shared/api/session";
import { EMPTY_DOC, toDoc, type KbDoc, type KbPage } from "../model/kb";
import { text } from "./org";
import { useAll } from "./timesheet";

export const KB = "hr_kb_articles";

const toPage = (row: Item, authors: Map<string, string>): KbPage => ({
  id: text(row.guid),
  parentId: text(row.hr_kb_articles_id),
  /* Заголовки из hrms бывают с переводом строки и пробелами по краям. */
  title: text(row.title).trim(),
  icon: text(row.icon).trim(),
  content: row.content,
  sortOrder: typeof row.sort_order === "number" ? row.sort_order : null,
  createdAt: text(row.created_at),
  updatedAt: text(row.updated_at),
  author: authors.get(text(row.core_users_id)) ?? "",
});

/**
 * Вся база целиком: дереву нужны все страницы, поиску — их текст.
 * Страниц десятки, а не тысячи.
 *
 * Без связей: в `hr_kb_articles_id_data` бэкенд кладёт родителя целиком,
 * с его текстом, — ответ omni4 весил 2,6 МБ вместо 1,1. Имена авторов —
 * отдельным запросом, их единицы.
 */
export function useKbPages() {
  const { rows, loading } = useAll(KB, {}, false);
  const ids = useMemo(() => [...new Set(rows.map((r) => text(r.core_users_id)).filter(Boolean))], [rows]);
  const people = useItems(ids.length ? PEOPLE : undefined, {
    limit: MAX_LIMIT,
    page: 1,
    relations: false,
    filters: { guid: { op: "is", values: ids } },
  });
  const pages = useMemo(() => {
    const authors = new Map(people.page.rows.map((u) => [text(u.guid), text(u.full_name)]));
    return rows.map((row) => toPage(row, authors));
  }, [rows, people.page.rows]);
  return { pages, loading };
}

/**
 * Правка страницы — PUT и подстановка в кэш, без перезапроса базы.
 *
 * Не `useUpdateItem`: тот после каждой правки перечитывает всё под
 * ключом items, а автосохранение пишет на каждой паузе в наборе — это
 * мегабайт базы на каждое предложение. Здесь строка в кэше правится
 * на месте вместе с `updated_at`; формул и событий у таблицы нет, так
 * что пересчитывать бэкенду нечего. Отказ — сообщение, кэш перечитывается.
 */
function useSaveKb() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guid, values }: { guid: string; values: Item }) => api.put<unknown>(`/v2/items/${KB}`, { data: { guid, ...values } }),
    onMutate: ({ guid, values }) =>
      queryClient.setQueriesData({ queryKey: keys.items.table(KB) }, (page: unknown) =>
        patchRow(page, { guid, values: { ...values, updated_at: new Date().toISOString() } }),
      ),
    onError: (error) => {
      reportError(error, "common.saveFailed");
      void queryClient.invalidateQueries({ queryKey: keys.items.table(KB) });
    },
  });
}

/** Автор правки — своя строка `core_users`; у ADMIN её нет — пусто. */
const by = () => ({ core_users_id: session.getObjectIds()[PEOPLE] ?? null });

/**
 * Строки базы в кэше через `fix`. База грузится бесконечным запросом
 * (`useAll`): в кэше куски `{pages}`, строки — в `data.response`.
 */
function editRows(page: unknown, fix: (rows: Item[], at: number) => Item[]): unknown {
  const chunks = (page as { pages?: ItemsResponseDto[] } | undefined)?.pages;
  if (!Array.isArray(chunks)) return page;
  return {
    ...(page as object),
    pages: chunks.map((chunk, at) => ({ ...chunk, data: { ...chunk.data, response: fix(chunk.data?.response ?? [], at) } })),
  };
}

/**
 * Создание и удаление — сразу в кэше, до ответа. Иначе новая страница
 * появлялась бы через секунду: адрес уже на ней, а её нет, и экран
 * показывал первую страницу — по кнопке жали ещё раз и заводили
 * пустые страницы пачкой. Отказ — сообщение и перечитывание.
 */
function useKbWrites() {
  const queryClient = useQueryClient();
  const cache = (fix: (rows: Item[], at: number) => Item[]) =>
    queryClient.setQueriesData({ queryKey: keys.items.table(KB) }, (page: unknown) => editRows(page, fix));
  const reload = () => void queryClient.invalidateQueries({ queryKey: keys.items.table(KB) });

  const create = useMutation({
    mutationFn: (row: Item) => api.post<unknown>(`/v2/items/${KB}`, { data: row }),
    onMutate: (row) => {
      const now = new Date().toISOString();
      cache((rows, at) => (at === 0 ? [...rows, { ...row, created_at: now, updated_at: now }] : rows));
    },
    onError: (error) => {
      reportError(error, "common.createFailed");
      reload();
    },
  });
  const remove = useMutation({
    mutationFn: (ids: string[]) => api.delete<unknown>(`/v1/object/${KB}`, { data: { ids } }),
    onMutate: (ids) => cache((rows) => rows.filter((row) => !ids.includes(text(row.guid)))),
    onError: (error) => {
      reportError(error, "common.deleteFailed");
      reload();
    },
  });
  return { create, remove };
}

/**
 * Правки базы. Создание и копия — со своим guid: страницу открывают
 * сразу, не дожидаясь ответа. Удаление — вместе с вложенными (их ids
 * собирает вызывающий, `descendantsOf`): бэкенд каскада не делает.
 */
export function useKbActions() {
  const { create, remove } = useKbWrites();
  const update = useSaveKb();
  const add = (values: Item) => {
    const guid = crypto.randomUUID();
    create.mutate({ guid, icon: "📄", title: "", content: JSON.stringify(EMPTY_DOC), ...values, ...by() });
    return guid;
  };
  return {
    /** Новая страница; `parentId` пуст — верхний уровень. Возвращает guid. */
    create: (parentId: string) => add({ hr_kb_articles_id: parentId || null }),
    /** Копия рядом с оригиналом, без вложенных — как `dup` прототипа. */
    duplicate: (page: KbPage, suffix: string) =>
      add({
        hr_kb_articles_id: page.parentId || null,
        icon: page.icon,
        title: `${page.title} ${suffix}`.trim(),
        content: JSON.stringify(toDoc(page.content)),
      }),
    /** Заголовок, эмодзи, содержимое (документом tiptap) или родитель. */
    save: (id: string, values: { title?: string; icon?: string; content?: KbDoc; parentId?: string }) =>
      update.mutate({
        guid: id,
        values: {
          ...(values.title === undefined ? {} : { title: values.title }),
          ...(values.icon === undefined ? {} : { icon: values.icon }),
          ...(values.content === undefined ? {} : { content: JSON.stringify(values.content) }),
          ...(values.parentId === undefined ? {} : { hr_kb_articles_id: values.parentId || null }),
          ...by(),
        },
      }),
    remove: (ids: string[]) => remove.mutate(ids),
    /** Создание в пути — кнопки создания неактивны: второй клик не заведёт вторую. */
    creating: create.isPending,
  };
}
