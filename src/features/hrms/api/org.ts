import { useMemo } from "react";
import { MAX_LIMIT, useItems, type Item } from "@/features/item";
import { hexToChipColor, type ChipColor } from "@/shared/ui/chip";

/*
 * Оргструктура читает таблицы HRMS по их слагам и полям из схемы
 * ERP v2 (`omni4-v2/erp.dbml`): hr_employees, hr_departments. Это не угадывание полей показа связи
 * (CONTEXT, Relation) — экран сделан под эти таблицы и вне их
 * не показывается (FIXED_VIEW_TYPES). Связанная запись приезжает рядом
 * со ссылкой (`hr_positions_id` → `hr_positions_id_data`), её имя — `name`.
 */

export type Person = {
  id: string;
  name: string;
  photo: string;
  position: string;
  department: string;
  departmentId: string;
  location: string;
  locationId: string;
  /** Руководитель — самосвязь `hr_employees_id`. */
  managerId: string;
  managerName: string;
  managerPhoto: string;
};

export type Department = {
  id: string;
  name: string;
  parentId: string;
  /**
   * Руководитель отдела — пользователь (`core_users_id`), а открывается
   * его карточка сотрудника: `core_users.hr_employees_id`. Пусто — у
   * пользователя нет карточки, открывать нечего.
   */
  headId: string;
  /**
   * Имя и фото — из связанной записи (`core_users_id_data`), а не из
   * людей на экране: отбор view мог его отсеять.
   */
  headName: string;
  headPhoto: string;
  color: string;
};

export const text = (value: unknown) => (typeof value === "string" ? value : "");
export const related = (row: Item, slug: string) => {
  const data = row[`${slug}_data`];
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Item) : {};
};
export const firstText = (value: unknown) => text(Array.isArray(value) ? value[0] : value);

/** Имя и фото человека по связи: «кто» — `core_users`, «о ком» — `hr_employees`; поля у обеих одни. */
const who = (row: Item, slug: string) => {
  const person = related(row, slug);
  return { name: text(person.full_name), photo: firstText(person.photo) };
};

export function toPerson(row: Item): Person {
  return {
    id: text(row.guid),
    name: text(row.full_name) || [text(row.last_name), text(row.first_name)].filter(Boolean).join(" "),
    photo: firstText(row.photo),
    position: text(related(row, "hr_positions_id").name),
    department: text(related(row, "hr_departments_id").name),
    departmentId: text(row.hr_departments_id),
    location: text(related(row, "hr_locations_id").name),
    locationId: text(row.hr_locations_id),
    managerId: text(row.hr_employees_id),
    managerName: who(row, "hr_employees_id").name,
    managerPhoto: who(row, "hr_employees_id").photo,
  };
}

function toDepartment(row: Item): Department {
  return {
    id: text(row.guid),
    name: text(row.name),
    parentId: text(row.hr_departments_id),
    headId: text(related(row, "core_users_id").hr_employees_id),
    headName: who(row, "core_users_id").name,
    headPhoto: who(row, "core_users_id").photo,
    color: text(row.color),
  };
}

/*
 * Справочники целиком, одной порцией: их десятки строк, а дереву нужен
 * весь набор — половина отделов дала бы обрубленные ветки.
 *
 * Отделы нужны обоим деревьям: ими красятся люди.
 */
const ALL = { limit: MAX_LIMIT, page: 1 };

export function useOrgDirectory() {
  const departments = useItems("hr_departments", ALL);

  /* Памяткой: от этого списка считаются цвета и деревья экрана. */
  const departmentList = useMemo(() => departments.page.rows.map(toDepartment), [departments.page.rows]);

  return {
    departments: departmentList,
    isLoading: departments.isLoading,
    /** Отказ словами сервера. null — всё загрузилось. */
    error: departments.error ?? null,
    refetch: () => void departments.refetch(),
  };
}

/**
 * Цвет отдела: свой, иначе ближайшего предка со своим, иначе от имени.
 * Так ветка красится цветом департамента, когда его задали, а без
 * настроек отделы всё равно различимы.
 */
export function departmentColors(departments: Department[], fallback: (name: string) => ChipColor) {
  const byId = new Map(departments.map((dept) => [dept.id, dept]));
  const colors = new Map<string, ChipColor>();

  for (const dept of departments) {
    let at: Department | undefined = dept;
    const seen = new Set<string>();
    while (at && !at.color && !seen.has(at.id)) {
      seen.add(at.id);
      at = byId.get(at.parentId);
    }
    colors.set(dept.id, at?.color ? hexToChipColor(at.color) : fallback(dept.name));
  }

  return colors;
}
