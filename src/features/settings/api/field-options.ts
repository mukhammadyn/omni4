import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";

export type OptionDraft = { value: string; label: string; color: string };

type FieldsDto = { fields?: Record<string, unknown>[] };

/**
 * Варианты одного PICK_LIST или MULTISELECT, заведённого в нескольких таблицах
 * (`employment_type` у сотрудника, истории работы и вакансии), —
 * одним списком: правка уходит во все, иначе варианты разойдутся
 * (SYSTEM-TABLES-AUDIT, «Настройки HRMS без своей таблицы»).
 *
 * Поле перечитывается перед записью: PUT требует объект целиком
 * (справочник API, §4.4), и устаревший кэш затёр бы чужую правку.
 * У варианта сохраняются его прочие ключи — подписи других языков.
 */
export function useSaveFieldOptions(tables: string[], slug: string, language: string) {
  const queryClient = useQueryClient();

  return useMutation({
    /* Таблицы — параллельно: у каждой своё поле, порядок не важен,
       а по очереди это шесть запросов подряд, секунды на сохранение. */
    mutationFn: (options: OptionDraft[]) =>
      Promise.all(tables.map(async (table) => {
        const response = await api.get<FieldsDto>(`/v2/fields/${table}`);
        const field = response.fields?.find((one) => one.slug === slug);
        if (!field) return;

        const attributes = (field.attributes ?? {}) as Record<string, unknown>;
        /* MULTISELECT хранит в строке slug, а в `value` — подпись
           (table/api/normalize, toOptions); PICK_LIST — `value`. */
        const multi = field.type === "MULTISELECT";
        const before = new Map(
          ((attributes.options ?? []) as Record<string, unknown>[]).map((one) => [multi ? one.slug || one.value : one.value, one]),
        );

        await api.put<unknown>(`/v2/fields/${table}`, {
          ...field,
          attributes: {
            ...attributes,
            has_color: true,
            options: options.map((one) => ({
              ...before.get(one.value),
              ...(multi ? { slug: one.value, value: one.label } : { value: one.value }),
              label: one.label,
              [`label_${language}`]: one.label,
              color: one.color,
            })),
          },
        });
      })),
    onError: (error) => reportError(error, "common.saveFailed"),
    /* Только схемы этих таблиц и без ожидания: хук ждёт свой onSettled
       до колбэков вызова, и окно висело, пока перечитывалось всё `tables`. */
    onSettled: () => {
      for (const table of tables) void queryClient.invalidateQueries({ queryKey: keys.tables.fields(table) });
    },
  });
}
