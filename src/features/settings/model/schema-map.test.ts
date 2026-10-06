import { describe, expect, it } from "vitest";
import { layoutSchema, toDbml, toSchemaMap } from "./schema-map";

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
