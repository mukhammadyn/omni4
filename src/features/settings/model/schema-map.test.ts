import { describe, expect, it } from "vitest";
import { groupOf, layoutSchema, matchesTable, pickSchema, toDbml, toSchemaMap } from "./schema-map";

const tableRows = [
  { slug: "deal", label: "Deals", rows: 12, fields: [{ slug: "guid", type: "UUID" }, { slug: "company_id", type: "LOOKUP" }] },
  // Поля строкой — так тоже приезжает.
  // reltuples = -1: таблицу не анализировали — это не ноль строк.
  { slug: "company", label: "company", rows: -1, fields: '[{"slug":"guid","type":"UUID"}]' },
  { slug: "note", label: "It's a note", fields: null },
];

const linkRows = [
  { table_from: "deal", field_from: "company_id", table_to: "company", type: "Many2One" },
  // Вторая сторона выбирается в строке — стрелке некуда упереться.
  { table_from: "deal", field_from: "target", table_to: "", type: "Many2Dynamic" },
  // Таблицы нет в выборке.
  { table_from: "deal", field_from: "role_id", table_to: "role", type: "Many2One" },
];

describe("toSchemaMap", () => {
  it("парсит поля обоих видов и отбрасывает висячие связи", () => {
    const map = toSchemaMap(tableRows, linkRows);

    expect(map.tables.map((table) => table.fields.length)).toEqual([2, 1, 0]);
    expect(map.tables.map((table) => table.rows)).toEqual([12, null, null]);
    expect(map.links).toEqual([{ from: "deal", field: "company_id", to: "company", type: "Many2One" }]);
  });
});

describe("groupOf", () => {
  it("модуль — по префиксу у таблиц omni4, пользовательская — в «Другое»", () => {
    expect(groupOf("role", true, false)).toBe("platform");
    expect(groupOf("crm_deals", false, true)).toBe("crm");
    expect(groupOf("hr_shifts", false, true)).toBe("hr");
    expect(groupOf("int_ai_audit", false, true)).toBe("integrations");
    expect(groupOf("employees", false, true)).toBe("core");
    // Префикс модуля у своей таблицы её модульной не делает.
    expect(groupOf("crm_notes", false, false)).toBe("other");
  });

  it("protected приходит из SQL строгим true", () => {
    const [crm, own] = toSchemaMap(
      [
        { slug: "crm_deals", protected: true, fields: [] },
        { slug: "crm_mine", protected: "true", fields: [] },
      ],
      [],
    ).tables;

    expect([crm?.group, own?.group]).toEqual(["crm", "other"]);
  });
});

describe("подгруппы", () => {
  const row = (slug: string, section?: string) => ({ slug, protected: true, section, fields: [] });
  const link = (from: string, to: string) => ({ table_from: from, field_from: `${to}_id`, table_to: to });

  it("дочерняя наследует подгруппу родителя по цепочке, справочник остаётся без неё", () => {
    const map = toSchemaMap(
      [
        row("hr_trainings", "Обучение"),
        row("hr_training_participants"),
        row("hr_participant_notes"),
        row("hr_absence_types"),
        row("employees", "Люди"),
        row("hr_job_history"),
      ],
      [
        link("hr_participant_notes", "hr_training_participants"),
        link("hr_training_participants", "hr_trainings"),
        link("hr_training_participants", "hr_absence_types"),
        // «Люди» — подгруппа Ядра, а не HR: из другой группы не наследуется.
        link("hr_job_history", "employees"),
      ],
    );
    const section = (slug: string) => map.tables.find((table) => table.slug === slug)?.section;

    expect(section("hr_training_participants")).toBe("Обучение");
    expect(section("hr_participant_notes")).toBe("Обучение");
    expect(section("hr_absence_types")).toBeNull();
    expect(section("hr_job_history")).toBeNull();
  });
});

describe("pickSchema", () => {
  it("оставляет связи только между оставшимися и ищет по полям", () => {
    const map = toSchemaMap(tableRows, linkRows);
    const picked = pickSchema(map, (table) => matchesTable(table, "company_id"));

    expect(picked.tables.map((table) => table.slug)).toEqual(["deal"]);
    expect(picked.links).toEqual([]);
    expect(pickSchema(map, () => true).links).toHaveLength(1);
  });
});

describe("layoutSchema", () => {
  it("ставит того, на кого ссылаются, левее, а таблицы без связей — в хвост", () => {
    const layout = layoutSchema(toSchemaMap(tableRows, linkRows));
    const x = (slug: string) => layout.boxes.get(slug)!.x;

    expect(x("company")).toBeLessThan(x("deal"));
    expect(x("deal")).toBeLessThan(x("note"));
  });

  it("не зацикливается на круге ссылок", () => {
    const map = toSchemaMap(
      [
        { slug: "a", label: "", fields: [] },
        { slug: "b", label: "", fields: [] },
      ],
      [
        { table_from: "a", field_from: "b_id", table_to: "b", type: "Many2One" },
        { table_from: "b", field_from: "a_id", table_to: "a", type: "Many2One" },
      ],
    );

    expect(layoutSchema(map).boxes.size).toBe(2);
  });
});

describe("toDbml", () => {
  it("пишет таблицы, ключ и ссылки, экранируя кавычку в подписи", () => {
    const dbml = toDbml(toSchemaMap(tableRows, linkRows));

    expect(dbml).toContain("Table deal [note: 'Deals'] {\n  guid UUID [pk]\n  company_id LOOKUP\n}");
    // Подпись совпадает со слагом — заметка не нужна.
    expect(dbml).toContain("Table company {");
    expect(dbml).toContain("[note: 'It\\'s a note']");
    expect(dbml).toContain("Ref: deal.company_id > company.guid");
  });
});
