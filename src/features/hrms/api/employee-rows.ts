import { useCreateItem, useDeleteItems, useItems, useUpdateItem, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";

/** «Адреса и телефоны» сотрудника — `EG.contacts` прототипа, строка на адрес или контакт. */
export const CONTACTS = "hr_employee_contacts";
/** «Состав семьи» — `EG.family` прототипа. */
export const FAMILY = "hr_employee_family";
/** Образование и сертификаты — одна таблица, вид в `type`. */
export const QUALIFICATIONS = "hr_qualifications";

/**
 * Строки таблицы-вкладки сотрудника (`gridTab` прототипа): по `hr_employees_id`
 * и, если задано, по равенству полей `where` — они же уходят в новую строку.
 */
export function useEmployeeRows(table: string, employeeId: string, where: Record<string, string> = {}) {
  const { schema } = useTableSchema(table);
  const { page, isLoading } = useItems(table, {
    limit: 200,
    page: 1,
    filters: {
      hr_employees_id: { op: "contains", values: [employeeId] },
      ...Object.fromEntries(Object.entries(where).map(([slug, value]) => [slug, { op: "is" as const, values: [value] }])),
    },
  });
  const create = useCreateItem(table);
  const update = useUpdateItem(table);
  const remove = useDeleteItems(table);
  return {
    /*
     * Бэкенд отдаёт новые сверху (`ORDER BY created_at DESC`); старые
     * сверху — разворотом здесь. Сортировка `created_at` в запросе — SQL-
     * ошибка get-list (docs/backend-notes.md, «`order` из одного created_at»).
     */
    rows: [...page.rows].reverse(),
    isLoading,
    fields: schema.fields,
    add: (values: Item) => create.mutate({ guid: crypto.randomUUID(), hr_employees_id: employeeId, ...where, ...values }),
    edit: (guid: string, values: Item) => update.mutate({ guid, values }),
    remove: (guid: string) => remove.mutate([guid]),
  };
}
