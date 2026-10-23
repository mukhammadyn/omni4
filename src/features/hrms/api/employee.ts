import { useMemo } from "react";
import { useTablePermissions } from "@/features/auth";
import { MAX_LIMIT, PEOPLE, useItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { ALL_VIEW_RIGHTS, localized, useTableDetails, useTableSchema, useTableSettings } from "@/features/table";
import { useTableMenuId } from "@/features/sidebar";
import { relationTabs, useMenuViews } from "@/features/view";
import { firstText, related, text, toPerson } from "./org";

/**
 * Сотрудники — кадры, «о ком запись» (схема v2, `omni4-v2/erp.dbml`).
 * Не таблица входа: вход, бот и последний визит — у пользователя
 * (PEOPLE, `core_users`), он ссылается сюда `hr_employees_id`.
 */
export const EMPLOYEES = "hr_employees";

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
  /* Регион — у локации сотрудника, связью на справочник `core_regions`. */
  const locationId = record.item ? firstText(record.item.hr_locations_id) : "";
  const location = useItem("hr_locations", locationId || undefined, Boolean(locationId));
  /* Пользователь этого сотрудника: бот и последний вход — его. Может не быть. */
  const user = useItems(PEOPLE, {
    limit: 1,
    page: 1,
    filters: { hr_employees_id: { op: "contains", values: [guid] } },
    relations: false,
  });

  const { schema: users } = useTableSchema(PEOPLE);

  /*
   * Вкладки — по тем же правилам, что в карточке: право на чужую
   * таблицу и на сам view (routes/_authed.m.$menuId, relationTabs).
   *
   * Связь вкладки ищется сначала у сотрудника, потом у его пользователя:
   * в схеме v2 поля «кто» смотрят на `core_users`, и задачи сотрудника —
   * это `hr_tasks.core_users_id` его пользователя, а не связь с ним самим.
   * Такая вкладка (`viaUser`) отбирает строки по guid пользователя.
   */
  const tabs = useMemo(() => {
    const own = relationTabs(views, schema.relations, language);
    const taken = new Set(own.map((tab) => tab.id));
    const incoming = users.relations.filter((relation) => relation.direction === "incoming");
    const viaUser = relationTabs(
      views.filter((view) => !taken.has(view.id)),
      incoming,
      language,
    );
    return [
      ...own.map((tab) => ({ ...tab, viaUser: false })),
      ...viaUser.map((tab) => ({ ...tab, viaUser: true })),
    ]
      .sort((a, b) => a.view.order - b.view.order)
      .filter(
        (tab) =>
          permissionOf(tab.tableSlug).read && (viewRights.get(tab.id) ?? ALL_VIEW_RIGHTS).view,
      );
  }, [views, schema.relations, users.relations, language, permissionOf, viewRights]);


  return {
    row: record.item,
    user: user.page.rows[0],
    region: location.item ? text(related(location.item, "core_regions_id").name) : "",
    isLoading: record.isLoading || schemaLoading,
    error: record.error,
    fields: schema.fields,
    relations: schema.relations,
    tabs,
    /** Вкладка «Оргструктура» того же пункта: туда ведёт кнопка сбоку. */
    orgViewId: views.find((view) => view.type === "ORG")?.id,
    can: permissionOf(EMPLOYEES),
    edit: (slug: string, value: unknown) => update.mutate({ guid, values: { [slug]: value } }),
    /** Увольнение: статус «Уволен», дата («ГГГГ-ММ-ДД», как пишет поле DATE) и причина. */
    dismiss: (date: string, reasonId: string) =>
      update.mutate({
        guid,
        values: { status: "dismissed", dismissal_date: date, hr_dismissal_reasons_id: reasonId },
      }),
  };
}

/**
 * Пункт меню сотрудников — для перехода на страницу сотрудника из чужого
 * пункта (посещаемость): вкладки связей страница берёт из него.
 */
export function useEmployeesMenuId(): string | undefined {
  const { table } = useTableSettings(EMPLOYEES);
  return useTableMenuId(table?.id ?? "");
}

/** Подчинённые: у кого руководитель — этот сотрудник (`hr_employees_id`). */
export function useReports(guid: string) {
  const { page } = useItems(EMPLOYEES, {
    limit: 200,
    page: 1,
    // `contains` — голое значение рядом со слагом, то есть равенство (см. toCondition).
    filters: { hr_employees_id: { op: "contains", values: [guid] } },
  });
  return page.rows;
}

/**
 * Шапка страницы — `#empMeta` прототипа: должность, локация, отдел,
 * бот и последний вход. Регион — в useEmployee: ему нужна схема локаций.
 *
 * Работодателя нет: в схеме v2 юрлица только в CRM. Бот и вход —
 * у пользователя (`user`), а не у сотрудника; нет пользователя — нет и их.
 */
export function toProfile(row: Item, user: Item | undefined) {
  return {
    ...toPerson(row),
    /** Чат с ботом есть — бот подключён (`telegram_chat_id`, пишет функция бота). */
    bot: Boolean(text(user?.telegram_chat_id)),
    lastActivity: text(user?.last_activity),
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

const DISMISSAL_REASONS = "hr_dismissal_reasons";

/**
 * Причины увольнения и их типы. Тип — поле причины (`dismissal_type`),
 * у сотрудника хранится только причина: тип в форме лишь сужает список.
 */
export function useDismissalReasons(language: string) {
  const { page } = useItems(DISMISSAL_REASONS, { limit: MAX_LIMIT, page: 1 });
  const { schema } = useTableSchema(DISMISSAL_REASONS);
  const options = schema.fields.find((field) => field.slug === "dismissal_type")?.options;

  return useMemo(
    () => ({
      types: [...(options ?? new Map()).entries()].map(([value, option]) => ({
        value,
        label: localized(option.labels, language, option.label || value),
        color: option.color,
      })),
      /* Своего цвета у причины нет — берёт цвет типа, как в настройках. */
      reasons: page.rows
        .filter((row) => row.is_active !== false)
        .map((row) => {
          const type = firstText(row.dismissal_type);
          return { value: text(row.guid), label: text(row.name), type, color: options?.get(type)?.color ?? null };
        }),
    }),
    [options, page.rows, language],
  );
}
