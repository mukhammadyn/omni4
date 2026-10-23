import { useMemo } from "react";
import { MAX_LIMIT, useItems, type Item, type OrgNode } from "@/features/item";
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
  positionId: string;
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
    positionId: text(row.hr_positions_id),
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
  const positions = useItems("hr_positions", ALL);

  /* Памяткой: от этого списка считаются цвета и деревья экрана. */
  const departmentList = useMemo(() => departments.page.rows.map(toDepartment), [departments.page.rows]);

  /* Должность → вышестоящая (`hr_positions.hr_positions_id`). */
  const positionParent = useMemo(
    () => new Map(positions.page.rows.map((row) => [text(row.guid), text(row.hr_positions_id)])),
    [positions.page.rows],
  );

  return {
    departments: departmentList,
    positionParent,
    isLoading: departments.isLoading || positions.isLoading,
    /** Отказ словами сервера. null — всё загрузилось. */
    error: departments.error ?? positions.error ?? null,
    refetch: () => {
      void departments.refetch();
      void positions.refetch();
    },
  };
}

/**
 * Руководитель для дерева: свой (`hr_employees_id`), а не указан —
 * первый на экране, кто занимает вышестоящую должность; нет такого —
 * следующую выше. Иерархия должностей в проектах заполнена, а поле
 * руководителя у людей — обычно нет, и дерево выходило плоским.
 */
export function managerByPosition(people: Person[], positionParent: Map<string, string>) {
  const holder = new Map<string, string>();
  for (const person of people) {
    if (person.positionId && !holder.has(person.positionId)) holder.set(person.positionId, person.id);
  }
  return (person: Person) => {
    if (person.managerId) return person.managerId;
    const seen = new Set<string>();
    let at = positionParent.get(person.positionId);
    while (at && !seen.has(at)) {
      seen.add(at);
      const boss = holder.get(at);
      if (boss && boss !== person.id) return boss;
      at = positionParent.get(at);
    }
    return undefined;
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

export type UnitNode = {
  kind: "unit" | "region" | "location";
  name: string;
  sub: string;
  /** Руководитель юнита — карточка сотрудника (`hr_employees_id`). */
  headId: string;
  headName: string;
  headPhoto: string;
  color: string;
  locationIds: string[];
};

/**
 * Дерево «Организация»: бизнес-юнит → дочерние юниты (`core_business_units_id`,
 * родитель) → регион → локация. Регион — свой
 * у локации (`core_regions_id`), без вложенности регионов; локация
 * с несколькими юнитами стоит под каждым. Локации без юнита — отдельный
 * корень «Без юнита».
 */
export function useOrgUnits(enabled: boolean) {
  const units = useItems(enabled ? "core_business_units" : undefined, ALL);
  const locations = useItems(enabled ? "hr_locations" : undefined, ALL);

  const roots = useMemo(() => {
    const node = (id: string, data: Omit<UnitNode, "headId" | "headName" | "headPhoto" | "color"> & Partial<UnitNode>, kids: OrgNode<UnitNode>[] = []): OrgNode<UnitNode> => ({
      id,
      kids,
      data: { headId: "", headName: "", headPhoto: "", color: "", ...data },
    });
    const branch = (unitId: string, rows: Item[]) => {
      const byRegion = new Map<string, Item[]>();
      for (const row of rows) {
        const region = text(row.core_regions_id);
        byRegion.set(region, [...(byRegion.get(region) ?? []), row]);
      }
      return [...byRegion].map(([regionId, list]) => {
        const kids = list.map((row) =>
          node(`${unitId}:${text(row.guid)}`, {
            kind: "location",
            name: text(row.name),
            sub: text(row.address),
            color: text(row.color),
            locationIds: [text(row.guid)],
          }),
        );
        return node(`${unitId}:r:${regionId}`, {
          kind: "region",
          name: text(related(list[0]!, "core_regions_id").name),
          sub: "",
          locationIds: kids.flatMap((kid) => kid.data.locationIds),
        }, kids);
      });
    };
    const unitsOf = (row: Item) => (Array.isArray(row.core_business_units_ids) ? row.core_business_units_ids.map(String) : []);
    const rows = new Map(units.page.rows.map((row) => [text(row.guid), row]));
    const parentOf = (id: string) => {
      const parent = text(rows.get(id)?.core_business_units_id);
      return parent !== id && rows.has(parent) ? parent : "";
    };
    const build = (id: string, seen: Set<string>): OrgNode<UnitNode> => {
      const row = rows.get(id)!;
      const childUnits = [...rows.keys()]
        .filter((kid) => parentOf(kid) === id && !seen.has(kid))
        .map((kid) => build(kid, new Set(seen).add(kid)));
      const regions = branch(id, locations.page.rows.filter((loc) => unitsOf(loc).includes(id)));
      return node(id, {
        kind: "unit",
        name: text(row.name),
        sub: text(related(row, "crm_legal_entities_id").name) || text(row.description),
        headId: text(row.hr_employees_id),
        headName: who(row, "hr_employees_id").name,
        headPhoto: who(row, "hr_employees_id").photo,
        color: text(row.color),
        // Юнит считает и людей дочерних: локацию под двумя юнитами — один раз.
        locationIds: [...new Set([...childUnits, ...regions].flatMap((kid) => kid.data.locationIds))],
      }, [...childUnits, ...regions]);
    };
    // Корни — юниты без родителя; цикл в данных (A → B → A) обрывается на повторе.
    const result = [...rows.keys()].filter((id) => !parentOf(id)).map((id) => build(id, new Set([id])));
    const orphans = locations.page.rows.filter((loc) => !unitsOf(loc).length);
    if (orphans.length) {
      const kids = branch("none", orphans);
      result.push(node("none", { kind: "unit", name: "", sub: "", locationIds: kids.flatMap((kid) => kid.data.locationIds) }, kids));
    }
    return result;
  }, [units.page.rows, locations.page.rows]);

  return {
    roots,
    isLoading: units.isLoading || locations.isLoading,
    error: units.error ?? locations.error ?? null,
    refetch: () => {
      void units.refetch();
      void locations.refetch();
    },
  };
}

/**
 * Грейды по должности: только группы, к которой отнесена должность
 * («Должности» → «Группа грейдов»), а нет своей — ближайшей вышестоящей;
 * нигде нет — все. Нужен модалке должности и форме вакансии.
 */
export function useGradesFor() {
  const list = { limit: MAX_LIMIT, page: 1, relations: false } as const;
  const positions = useItems("hr_positions", list);
  const grades = useItems("hr_grades", list);
  return useMemo(() => {
    const groupOf = (position: unknown) => {
      const seen = new Set<unknown>();
      for (let id = position; id && !seen.has(id); ) {
        seen.add(id);
        const row = positions.page.rows.find((p) => p.guid === id);
        if (row?.hr_grades_id) return String(row.hr_grades_id);
        id = row?.hr_positions_id;
      }
      return "";
    };
    const of = (position: unknown): Item[] => {
      const group = groupOf(position);
      return grades.page.rows
        .filter((g) => g.hr_grades_id && g.is_active !== false && (!group || g.hr_grades_id === group))
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)));
    };
    return { of, fits: (position: unknown, grade: unknown) => !grade || of(position).some((g) => g.guid === grade) };
  }, [positions.page.rows, grades.page.rows]);
}
