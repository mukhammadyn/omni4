import { useMemo } from "react";
import { useTablePermissions } from "@/features/auth";
import { MAX_LIMIT, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { ALL_VIEW_RIGHTS, localized, useTableDetails, useTableSchema } from "@/features/table";
import { relationTabs, useMenuViews } from "@/features/view";
import { todayInput } from "@/shared/lib/date-value";
import { firstText, related, text, toPerson } from "./org";

/** Таблица сотрудников ERP (`ucode/erp/erp.dbml`, «Сотрудник = пользователь»). */
export const EMPLOYEES = "employees";

/**
 * Всё, что нужно странице сотрудника: запись, схема, вкладки и права.
 *
 * Вкладки — те же вкладки связей, что у карточки записи (view пункта
 * меню с `is_relation_view`, features/view/model/relation-tabs): админ
 * заводит, переименовывает и убирает их там же, а страница их только
 * показывает. Поэтому ей нужен пункт меню, из которого её открыли.
 */
export function useEmployee(menuId: string, guid: string, language: string) {
  const record = useItem(EMPLOYEES, guid, true);
  const { schema, isLoading: schemaLoading } = useTableSchema(EMPLOYEES);
  const { views } = useMenuViews(menuId);
  const { viewRights } = useTableDetails(EMPLOYEES);
  const permissionOf = useTablePermissions();
  const update = useUpdateItem(EMPLOYEES);
  /* Регион — PICK_LIST локации: в записи ключ варианта, подпись — в схеме. */
  const { schema: locations } = useTableSchema("locations");

  /* Вкладки — по тем же правилам, что в карточке: право на чужую
     таблицу и на сам view (routes/_authed.m.$menuId, relationTabs). */
  const tabs = useMemo(
    () =>
      relationTabs(views, schema.relations, language).filter(
        (tab) =>
          permissionOf(tab.tableSlug).read && (viewRights.get(tab.id) ?? ALL_VIEW_RIGHTS).view,
      ),
    [views, schema.relations, language, permissionOf, viewRights],
  );

  const regionKey = record.item ? firstText(related(record.item, "locations_id").region) : "";
  const region = locations.fields.find((field) => field.slug === "region")?.options.get(regionKey);

  return {
    row: record.item,
    region: region ? localized(region.labels, language, region.label || regionKey) : regionKey,
    isLoading: record.isLoading || schemaLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    tabs,
    /** Вкладка «Оргструктура» того же пункта: туда ведёт кнопка сбоку. */
    orgViewId: views.find((view) => view.type === "ORG")?.id,
    can: permissionOf(EMPLOYEES),
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
    /**
     * Увольнение: статус «Уволен» и дата — сегодня в поясе пользователя
     * («ГГГГ-ММ-ДД», как пишет поле DATE). Причину и прочее правят полями.
     */
    dismiss: () =>
      update.mutate({
        guid,
        values: { status: "dismissed", dismissal_date: todayInput() },
      }),
  };
}

/** Подчинённые: у кого руководитель — этот сотрудник (`employees_id`). */
export function useReports(guid: string) {
  const { page } = useItems(EMPLOYEES, {
    limit: 200,
    page: 1,
    // `contains` — голое значение рядом со слагом, то есть равенство (см. toCondition).
    filters: { employees_id: { op: "contains", values: [guid] } },
  });
  return page.rows;
}

/**
 * Шапка страницы — `#empMeta` прототипа: должность, работодатель,
 * локация, отдел, бот и последний вход. Регион — в useEmployee: ему
 * нужна схема локаций.
 *
 * Бизнес-юнита у сотрудника нет: он висит на локации, а связанная
 * запись приезжает без своих связей. Его место — работодатель
 * (`legal_entities_id`).
 */
export function toProfile(row: Item) {
  return {
    ...toPerson(row),
    employer: text(related(row, "legal_entities_id").name),
    /** Чат с ботом есть — бот подключён (`telegram_chat_id`, пишет функция бота). */
    bot: Boolean(text(row.telegram_chat_id)),
    lastActivity: text(row.last_activity),
  };
}

/**
 * Соседи по списку — стрелки «предыдущий / следующий» в шапке.
 * По кругу, как в прототипе.
 */
export function useNeighbours(guid: string) {
  // ponytail: весь список ради двух соседей; при тысячах сотрудников — ручка соседей на бэкенде.
  const { page } = useItems(EMPLOYEES, { limit: MAX_LIMIT, page: 1 });
  const ids = page.rows.map((row) => text(row.guid));
  const at = ids.indexOf(guid);
  if (at < 0 || ids.length < 2) return null;
  return { prev: ids[(at - 1 + ids.length) % ids.length]!, next: ids[(at + 1) % ids.length]! };
}
