import { useMemo } from "react";
import { api } from "@/shared/api/client";
import { todayInput } from "@/shared/lib/date-value";
import { reportError } from "@/shared/lib/toast";
import { useTablePermission } from "@/features/auth";
import {
  applyRights,
  orderColumns,
  useCreateItem,
  useDeleteItems,
  useDrawerLayout,
  useItems,
  useUpdateItem,
  type Item,
} from "@/features/item";
import { localized, optionOf, useTableSchema, type Field } from "@/features/table";
import { gradeIssue, type GradeIssue } from "../model/job-history";
import { EMPLOYEES } from "./employee";
import { useMatrixBands } from "./grade-matrix";
import { firstText, related, text } from "./org";

/** История назначений (`erp.dbml`, hr_job_history): приём, переводы, повышения, оклад. */
export const JOB_HISTORY = "hr_job_history";

/** Подпись варианта и его цвет из настроек поля. */
export type Choice = { label: string; color: string | null };

/** Запись истории в том виде, в каком её рисует лента «Работы». */
export type JobEntry = {
  id: string;
  row: Item;
  /** «ГГГГ-ММ-ДД». Конец пустой — запись действует. */
  from: string;
  to: string;
  current: boolean;
  reason: Choice | null;
  employment: Choice | null;
  format: string;
  position: string;
  grade: string;
  department: string;
  location: string;
  schedule: string;
  /** null — оклада нет или роли его не видно (права на поле). */
  salary: number | null;
  currency: string;
  issue: GradeIssue | null;
};

/** Поля назначения, которые сотрудник держит у себя копией ([snap] в erp.dbml). */
const UNITS = "core_business_units_ids";
/** Поля назначения, которые можно исправить в текущей записи со страницы сотрудника. */
export const isAssignment = (slug: string) => slug === UNITS || SNAP.includes(slug);
const SNAP = ["hr_departments_id", "hr_positions_id", "hr_grades_id", "hr_locations_id", "hr_work_schedules_id", "employment_type", "work_format"];

/**
 * Копия текущего назначения в карточку сотрудника. Текущее — последнее
 * по `date_from`, уже начавшееся и не закрытое.
 *
 * ponytail: по схеме это делает функция после записи в hr_job_history,
 * но её нет — без копии отдел и должность не доходят до KPI, графика,
 * зарплаты и списка. Появится функция — отсюда уходит.
 */
/**
 * Действует сегодня: уже началась и не закончилась. Одно правило и для
 * метки «Текущая должность», и для копии в карточку — иначе запись с завтрашней
 * датой помечена текущей, а в карточке ещё прежняя.
 */
function isCurrent(row: Item, today = todayInput()): boolean {
  return text(row.date_from).slice(0, 10) <= today && (!row.date_to || text(row.date_to).slice(0, 10) >= today);
}

async function currentSnap(employee: string, link: string): Promise<Item | null> {
  /* Клиент API уже снял внешнюю обёртку: здесь `{ data: { count, response } }`. */
  type List = { data?: { response?: Item[] } };
  const res = await api.post<List>(`/v2/object/get-list/${JOB_HISTORY}`, { data: { [link]: employee, limit: 100 } });
  const current = (res.data?.response ?? [])
    .filter((r) => isCurrent(r))
    .sort((a, b) => text(b.date_from).localeCompare(text(a.date_from)))[0];
  if (!current) return null;
  const snap: Item = Object.fromEntries(SNAP.map((slug) => [slug, current[slug] ?? null]));
  /* Юниты — только заданные: у старых записей их не задавали (`null`),
     и копия стёрла бы юниты карточки. Пустой список — их очистили. */
  const units = current[UNITS];
  if (Array.isArray(units)) snap[UNITS] = units;
  return snap;
}

const SORT = [{ field: "date_from", direction: "desc" as const }];

/**
 * Всё для вкладки «Работа»: записи истории сотрудника, матрица грейдов
 * для сверки и поля карточки записи — ими правят и заводят должность.
 *
 * `link` — колонка-ссылка на сотрудника из вкладки связи, а не слаг
 * по памяти: вкладку заводит админ, и связь у неё может быть своя.
 */
export function useJobHistory({
  employee,
  link,
  menuId,
  language,
}: {
  employee: string;
  link: string;
  menuId: string;
  language: string;
}) {
  const { schema, isLoading: schemaLoading } = useTableSchema(JOB_HISTORY);
  const layout = useDrawerLayout({ tableSlug: JOB_HISTORY, menuId, language });
  const can = useTablePermission(JOB_HISTORY);
  const list = useItems(JOB_HISTORY, {
    // ponytail: сотня назначений на человека — с запасом; больше — страницы.
    limit: 100,
    page: 1,
    sorts: SORT,
    // `contains` — голое значение рядом со слагом, то есть равенство (см. toCondition).
    filters: { [link]: { op: "contains", values: [employee] } },
  });
  const bands = useMatrixBands();
  const create = useCreateItem(JOB_HISTORY);
  const update = useUpdateItem(JOB_HISTORY);
  const remove = useDeleteItems(JOB_HISTORY);
  /* Через общую правку строки: у таблицы входа она сама добавит from_auth_service (authBypass). */
  const updateEmployee = useUpdateItem(EMPLOYEES);
  /*
   * Через промис, а не `mutate(…, { onSuccess })`: колбэки вызова
   * теряются, если вкладка «Работа» перемонтировалась, пока шёл запрос
   * (список перезапрашивается сразу после правки) — копия молча не уходила.
   */
  const after = (write: Promise<unknown>, onDone?: () => void) =>
    void write
      .then(() => {
        onDone?.();
        return currentSnap(employee, link);
      })
      .then((values) => values && updateEmployee.mutateAsync({ guid: employee, values }))
      .catch((error: unknown) => reportError(error, "common.saveFailed"));

  /** Поля без запрещённых роли: оклад скрыт правами — его нет и в ленте. */
  const fields = useMemo(
    () => applyRights(schema.fields, layout.rights),
    [schema.fields, layout.rights],
  );


  const entries = useMemo(() => {
    const bySlug = new Map(fields.map((field) => [field.slug, field]));
    const choice = (slug: string, row: Item): Choice | null => {
      const field = bySlug.get(slug);
      const value = firstText(row[slug]);
      if (!field || !value) return null;
      const option = optionOf(field, value);
      return option
        ? { label: localized(option.labels, language, option.label || value), color: option.color }
        : { label: value, color: null };
    };

    return list.page.rows.map((row): JobEntry => {
      const salary = bySlug.has("salary") && typeof row.salary === "number" ? row.salary : null;
      const entry = {
        id: text(row.guid),
        row,
        from: text(row.date_from),
        to: text(row.date_to),
        current: isCurrent(row),
        reason: choice("change_reason", row),
        employment: choice("employment_type", row),
        format: choice("work_format", row)?.label ?? "",
        position: text(related(row, "hr_positions_id").name),
        grade: text(related(row, "hr_grades_id").name),
        department: text(related(row, "hr_departments_id").name),
        location: text(related(row, "hr_locations_id").name),
        schedule: text(related(row, "hr_work_schedules_id").name),
        salary,
        currency: choice("currency", row)?.label ?? "",
      };
      return {
        ...entry,
        issue: gradeIssue(
          { positionId: text(row.hr_positions_id), gradeId: text(row.hr_grades_id), salary, date: text(row.date_from).slice(0, 10), currency: firstText(row.currency) },
          bands,
        ),
      };
    });
  }, [list.page.rows, fields, bands, language]);

  return {
    entries,
    isLoading: list.isLoading || schemaLoading,
    error: list.error,
    can,
    fields,
    relations: schema.relations,
    /** Поля карточки записи: порядок и скрытые — из её раскладки. */
    columns: useMemo(
      () =>
        orderColumns(fields, layout.order).filter((field: Field) => !layout.hidden.has(field.slug)),
      [fields, layout.order, layout.hidden],
    ),
    sections: layout.sections,
    creating: create.isPending,
    create: (values: Item, onDone: () => void) => after(create.mutateAsync(values), onDone),
    edit: (guid: string, slug: string, value: unknown) => after(update.mutateAsync({ guid, values: { [slug]: value } })),
    /** Правка из формы: все её поля одним запросом. */
    save: (guid: string, values: Item, onDone: () => void) =>
      after(update.mutateAsync({ guid, values }), onDone),
    saving: update.isPending,
    remove: (guid: string) => after(remove.mutateAsync([guid])),
  };
}
