import { useMemo } from "react";
import { MAX_LIMIT, useItems, type Item } from "@/features/item";
import { hexToChipColor, type ChipColor } from "@/shared/ui/chip";

/*
 * Оргструктура читает таблицы HRMS по их слагам и полям из схемы
 * ERP (`ucode/erp/erp.dbml`): employees, departments, business_units,
 * locations, legal_entities. Это не угадывание полей показа связи
 * (CONTEXT, Relation) — экран сделан под эти таблицы и вне их
 * не показывается (FIXED_VIEW_TYPES). Связанная запись приезжает рядом
 * со ссылкой (`positions_id` → `positions_id_data`), её имя — `name`.
 */

export type Person = {
  id: string;
  name: string;
  photo: string;
  position: string;
  department: string;
  departmentId: string;
  locationId: string;
  /** Руководитель — самосвязь `employees_id`. */
  managerId: string;
};

export type Department = {
  id: string;
  name: string;
  parentId: string;
  headId: string;
  /**
   * Руководитель — из связанной записи (`employees_id_data`), а не из
   * людей на экране: отбор view мог его отсеять.
   */
  headName: string;
  headPhoto: string;
  color: string;
};

/** Ступень организации: юрлицо → бизнес-юнит → локация. */
export type Unit = {
  id: string;
  kind: "entity" | "unit" | "location";
  name: string;
  /** Строка под именем: ИНН, описание, адрес. */
  info: string;
  parentId: string;
  headId: string;
  headName: string;
  headPhoto: string;
  color: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const related = (row: Item, slug: string) => {
  const data = row[`${slug}_data`];
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Item) : {};
};
const firstText = (value: unknown) => text(Array.isArray(value) ? value[0] : value);

export function toPerson(row: Item): Person {
  return {
    id: text(row.guid),
    name: text(row.full_name) || [text(row.last_name), text(row.first_name)].filter(Boolean).join(" "),
    photo: firstText(row.photo),
    position: text(related(row, "positions_id").name),
    department: text(related(row, "departments_id").name),
    departmentId: text(row.departments_id),
    locationId: text(row.locations_id),
    managerId: text(row.employees_id),
  };
}

/** Руководитель записи: самосвязь на сотрудника, `employees_id`. */
const head = (row: Item) => {
  const person = related(row, "employees_id");
  return { headName: text(person.full_name), headPhoto: firstText(person.photo) };
};

function toDepartment(row: Item): Department {
  return {
    id: text(row.guid),
    name: text(row.name),
    parentId: text(row.departments_id),
    headId: text(row.employees_id),
    ...head(row),
    color: text(row.color),
  };
}

function toUnits(entities: Item[], units: Item[], locations: Item[]): Unit[] {
  return [
    ...entities.map((row) => ({
      id: text(row.guid),
      kind: "entity" as const,
      name: text(row.name),
      info: text(row.inn),
      parentId: "",
      headId: "",
      /* У юрлица руководитель — строка для документов, не сотрудник. */
      headName: text(row.director_name),
      headPhoto: "",
      color: text(row.color),
    })),
    ...units.map((row) => ({
      id: text(row.guid),
      kind: "unit" as const,
      name: text(row.name),
      info: text(row.description),
      parentId: text(row.legal_entities_id),
      headId: text(row.employees_id),
      ...head(row),
      color: text(row.color),
    })),
    ...locations.map((row) => ({
      id: text(row.guid),
      kind: "location" as const,
      name: text(row.name),
      info: text(row.address),
      parentId: text(row.business_units_id),
      headId: "",
      headName: "",
      headPhoto: "",
      color: text(row.color),
    })),
  ];
}

/*
 * Справочники целиком, одной порцией: их десятки строк, а дереву нужен
 * весь набор — половина отделов дала бы обрубленные ветки.
 *
 * Отделы нужны всем деревьям (ими красятся люди), юрлица, бизнес-юниты
 * и локации — только «Организации»: до неё их не спрашиваем.
 */
const ALL = { limit: MAX_LIMIT, page: 1 };

export function useOrgDirectory({ units: withUnits }: { units: boolean }) {
  const departments = useItems("departments", ALL);
  const entities = useItems(withUnits ? "legal_entities" : undefined, ALL);
  const units = useItems(withUnits ? "business_units" : undefined, ALL);
  const locations = useItems(withUnits ? "locations" : undefined, ALL);
  const queries = withUnits ? [departments, entities, units, locations] : [departments];

  /* Памяткой: от этих списков считаются цвета и деревья экрана. */
  const departmentList = useMemo(() => departments.page.rows.map(toDepartment), [departments.page.rows]);
  const unitList = useMemo(
    () => toUnits(entities.page.rows, units.page.rows, locations.page.rows),
    [entities.page.rows, units.page.rows, locations.page.rows],
  );

  return {
    departments: departmentList,
    units: unitList,
    isLoading: queries.some((query) => query.isLoading),
    /** Первый отказ словами сервера. null — всё загрузилось. */
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => queries.forEach((query) => query.refetch()),
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
