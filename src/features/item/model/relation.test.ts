import { expect, test } from "vitest";
import type { Field, Relation } from "@/features/table";
import { autoFilterValues, relationSelection, relationTree, selfDefaults, withoutPrefix } from "./relation";

/** Связь с настроенным автофильтром: город отбирается по региону строки. */
function relationWith(autoFilters: unknown): Relation {
  return {
    id: "r1",
    type: "Many2One",
    toSlug: "cities",
    toLabel: "Города",
    toLabels: {},
    title: "",
    fieldFrom: "cities_id",
    direction: "outgoing",
    linkField: "cities_id",
    viewFields: [{ slug: "name", type: "SINGLE_LINE" }],
    viewFieldIds: [],
    selfDefault: null,
    raw: { auto_filters: autoFilters },
  };
}

const PAIRS = [{ field_from: "regions_id", field_to: "regions_id" }];

test("значение поля-источника уходит условием по чужой колонке", () => {
  const values = autoFilterValues(relationWith(PAIRS), { regions_id: "reg-1" });

  expect(values).toEqual({ regions_id: "reg-1" });
});

test("незаполненный источник условием не становится", () => {
  // Иначе список городов был бы пуст до выбора региона — а пустой
  // список читается как «связывать не с чем».
  expect(autoFilterValues(relationWith(PAIRS), {})).toEqual({});
  expect(autoFilterValues(relationWith(PAIRS), { regions_id: "" })).toEqual({});
  expect(autoFilterValues(relationWith(PAIRS), { regions_id: null })).toEqual({});
});

test("пары действуют вместе", () => {
  const values = autoFilterValues(
    relationWith([
      { field_from: "regions_id", field_to: "regions_id" },
      { field_from: "kind", field_to: "kind" },
    ]),
    { regions_id: "reg-1", kind: "big", extra: "не наше дело" },
  );

  expect(values).toEqual({ regions_id: "reg-1", kind: "big" });
});

test("ненастроенная связь условий не добавляет", () => {
  expect(autoFilterValues(relationWith(null), { regions_id: "reg-1" })).toEqual({});
  expect(autoFilterValues(relationWith([{}]), { regions_id: "reg-1" })).toEqual({});
  expect(autoFilterValues(relationWith([{ field_from: "regions_id" }]), {})).toEqual({});
});

/** Связь, помеченная подстановкой «своего». */
function selfRelation(
  selfDefault: Relation["selfDefault"],
  extra: Partial<Relation> = {},
): Relation {
  return { ...relationWith([]), selfDefault, ...extra };
}

const ME = { userId: "user-1", objectIds: { cities: "city-7", couriers: "courier-3" } };

test("«тот, кто заводит» подставляется в колонку-ссылку", () => {
  expect(selfDefaults([selfRelation("user")], ME)).toEqual({ cities_id: "user-1" });
});

/*
 * «Своя строка» и «вошедший» — разные идентификаторы: у курьера есть
 * пользователь и есть строка в таблице курьеров. Перепутать их значит
 * записать в колонку id, которого в целевой таблице нет вовсе.
 */
test("«его строка» берётся по целевой таблице, а не по пользователю", () => {
  expect(selfDefaults([selfRelation("object")], ME)).toEqual({ cities_id: "city-7" });

  const courier = selfRelation("object", { toSlug: "couriers", linkField: "couriers_id" });
  expect(selfDefaults([courier], ME)).toEqual({ couriers_id: "courier-3" });
});

test("подставлять нечего — колонки в новой записи нет", () => {
  // Своей строки в этой таблице у вошедшего нет: пустая строка
  // в колонке-ссылке — это битый идентификатор, а не «никто».
  const other = selfRelation("object", { toSlug: "orders", linkField: "orders_id" });
  expect(selfDefaults([other], ME)).toEqual({});

  expect(selfDefaults([selfRelation("user")], { userId: "", objectIds: {} })).toEqual({});
  expect(selfDefaults([selfRelation(null)], ME)).toEqual({});
});

/* У входящей связи колонки-ссылки в нашей строке нет — она в чужой. */
test("входящая связь ничего не подставляет", () => {
  const incoming = selfRelation("user", { direction: "incoming" });
  expect(selfDefaults([incoming], ME)).toEqual({});
});

test("цвет связанной записи едет вместе с подписью, пустой — не цвет", () => {
  const field = { slug: "stage_id" } as Field;
  const fields = [{ slug: "name", type: "SINGLE_LINE" }];

  expect(
    relationSelection(
      { stage_id_data: { guid: "s1", name: "КП готов", color: "#3b82f6" } },
      field,
      fields,
    ),
  ).toEqual([{ guid: "s1", label: "КП готов", color: "#3b82f6" }]);
  expect(
    relationSelection({ stage_id_data: { guid: "s2", name: "Без", color: "" } }, field, fields),
  ).toEqual([{ guid: "s2", label: "Без" }]);
});

test("relation options as a tree: group header, its children under it, orphan to the root", () => {
  const items = [
    { guid: "dev", name: "DEV" },
    { guid: "d1", name: "DEV D1", hr_grades_id: "dev" },
    { guid: "pm", name: "PM" },
    { guid: "x", name: "Lost", hr_grades_id: "gone" },
    { guid: "d2", name: "DEV D2", hr_grades_id: "dev" },
  ];
  expect(relationTree(items, "hr_grades_id").map((o) => `${o.depth}${o.header ? "H" : ""}:${String(o.item.guid)}`)).toEqual([
    "0H:dev",
    "1:d1",
    "1:d2",
    "0:pm",
    "0:x",
  ]);
  expect(withoutPrefix("DEV D3", "DEV")).toBe("D3");
  expect(withoutPrefix("DEVOPS", "DEV")).toBe("DEVOPS");
});
