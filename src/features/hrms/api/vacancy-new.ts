import { useMemo } from "react";
import { useCreateItem, useItems, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { session } from "@/shared/api/session";
import { todayInput } from "@/shared/lib/date-value";
import { plusDays } from "../model/vacancy-dates";
import { EMPLOYEES } from "./employee";
import { text } from "./org";
import { VACANCIES } from "./vacancy";
import { ALL } from "./vacancy-page";

const PIPELINES = "hr_recruiting_pipelines";

/**
 * Новая вакансия — vacancy.html?new=1 прототипа: схема, черновик
 * с умолчаниями прототипа и создание.
 *
 * Воронка — та, что отмечена `is_default`. Своей копии этапов под
 * вакансию форма не заводит: копирования нет ни в бэкенде (у таблицы
 * нет автоматизаций), ни в схеме нет признака шаблона, по которому
 * отличить шаблон от копии (SYSTEM-TABLES-AUDIT, hr_recruiting_pipelines).
 */
export function useNewVacancy() {
  const { schema, isLoading } = useTableSchema(VACANCIES);
  const pipelines = useItems(PIPELINES, ALL);
  const create = useCreateItem(VACANCIES);
  const pipeline = pipelines.page.rows.find((row) => row.is_default === true);

  const draft = useMemo<Item>(() => {
    const today = todayInput();
    const recruiter = session.getObjectIds()[EMPLOYEES];
    return {
      guid: crypto.randomUUID(),
      status: "draft",
      priority: "medium",
      level: "middle",
      headcount: 1,
      work_format: "office",
      employment_type: "full_time",
      experience: "y1_3",
      currency: "UZS",
      show_salary: true,
      opened_at: today,
      deadline: plusDays(today, 30),
      desired_start_date: plusDays(today, 45),
      ...(recruiter ? { employees_id: recruiter } : {}),
      ...(pipeline ? { hr_recruiting_pipelines_id: text(pipeline.guid), hr_recruiting_pipelines_id_data: pipeline } : {}),
    };
  }, [pipeline]);

  return {
    fields: schema.fields,
    relations: useMemo(() => new Map(schema.relations.map((r) => [r.id, r])), [schema.relations]),
    isLoading: isLoading || pipelines.isLoading,
    draft,
    pending: create.isPending,
    create: (values: Item, onDone: (guid: string) => void) =>
      create.mutate(values, { onSuccess: () => onDone(text(values.guid)) }),
  };
}
