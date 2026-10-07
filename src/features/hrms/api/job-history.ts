import { useMemo } from "react";
import { useTablePermission } from "@/features/auth";
import {
  MAX_LIMIT,
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
import { gradeIssue, type Band, type GradeIssue } from "../model/job-history";
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

const SORT = [{ field: "date_from", direction: "desc" as const }];
const ALL = { limit: MAX_LIMIT, page: 1 };

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
  const bandRows = useItems("hr_salary_bands", ALL);
  const create = useCreateItem(JOB_HISTORY);
  const update = useUpdateItem(JOB_HISTORY);
  const remove = useDeleteItems(JOB_HISTORY);

  /** Поля без запрещённых роли: оклад скрыт правами — его нет и в ленте. */
  const fields = useMemo(
    () => applyRights(schema.fields, layout.rights),
    [schema.fields, layout.rights],
  );

  const bands = useMemo(
    () =>
      bandRows.page.rows
        .filter((row) => row.is_active !== false)
        .map(
          (row): Band => ({
            positionId: text(row.positions_id),
            gradeId: text(row.grades_id),
            gradeName: text(related(row, "grades_id").name),
            max: typeof row.salary_max === "number" ? row.salary_max : null,
            from: text(row.effective_from),
          }),
        ),
    [bandRows.page.rows],
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
        current: row.is_current === true || !row.date_to,
        reason: choice("change_reason", row),
        employment: choice("employment_type", row),
        format: choice("work_format", row)?.label ?? "",
        position: text(related(row, "positions_id").name),
        grade: text(related(row, "grades_id").name),
        department: text(related(row, "departments_id").name),
        location: text(related(row, "locations_id").name),
        schedule: text(related(row, "hr_work_schedules_id").name),
        salary,
        currency: choice("currency", row)?.label ?? "",
      };
      return {
        ...entry,
        issue: gradeIssue(
          { positionId: text(row.positions_id), gradeId: text(row.grades_id), salary },
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
    create: (values: Item, onDone: () => void) => create.mutate(values, { onSuccess: onDone }),
    edit: (guid: string, slug: string, value: unknown) =>
      update.mutate({ guid, values: { [slug]: value } }),
    remove: (guid: string) => remove.mutate([guid]),
  };
}
