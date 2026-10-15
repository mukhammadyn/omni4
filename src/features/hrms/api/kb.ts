import { useMemo } from "react";
import { MAX_LIMIT, PEOPLE, useCreateItem, useDeleteItems, useItems, useUpdateItem, type Item } from "@/features/item";
import { session } from "@/shared/api/session";
import { EMPTY_DOC, type KbDoc, type KbPage } from "../model/kb";
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

/** Автор правки — своя строка `core_users`; у ADMIN её нет — пусто. */
const by = () => ({ core_users_id: session.getObjectIds()[PEOPLE] ?? null });

/**
 * Правки базы. Создание и копия — со своим guid: страницу открывают
 * сразу, не дожидаясь ответа. Удаление — вместе с вложенными (их ids
 * собирает вызывающий, `descendantsOf`): бэкенд каскада не делает.
 */
export function useKbActions() {
  const create = useCreateItem(KB);
  const update = useUpdateItem(KB);
  const remove = useDeleteItems(KB);
  const add = (values: Item) => {
    const guid = crypto.randomUUID();
    create.mutate({ guid, icon: "📄", title: "", content: JSON.stringify(EMPTY_DOC), ...values, ...by() });
    return guid;
  };
  return {
    /** Новая страница; `parentId` пуст — верхний уровень. Возвращает guid. */
    create: (parentId: string) => add({ hr_kb_articles_id: parentId || null }),
    /** Копия рядом с оригиналом, без вложенных — как `dup` прототипа. */
    duplicate: (page: KbPage, content: KbDoc, suffix: string) =>
      add({
        hr_kb_articles_id: page.parentId || null,
        icon: page.icon,
        title: `${page.title} ${suffix}`.trim(),
        content: JSON.stringify(content),
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
    saving: update.isPending || create.isPending,
  };
}
