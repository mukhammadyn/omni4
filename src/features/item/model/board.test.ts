import { expect, test } from "vitest";
import type { Field } from "@/features/table";
import {
  boardColumns,
  boardLanes,
  boardOrderAt,
  colorOf,
  columnOrderEdits,
  groupValue,
  NO_GROUP,
  orderAt,
  sortOrderOf,
} from "./board";

const tabs = [
  { id: "todo", label: "К работе" },
  { id: "done", label: "Готово" },
];

const field = (type: string) => ({ type }) as Field;
const columnsOf = (rows: Record<string, unknown>[], extra = {}) =>
  boardColumns({ rows, tabs, slug: "status", unassigned: "Без значения", ...extra });

test("колонки идут в порядке вариантов, пустые остаются на месте", () => {
  const rows = [{ guid: "1", status: "done" }];

  expect(columnsOf(rows)).toEqual([
    { id: "todo", label: "К работе", rows: [] },
    { id: "done", label: "Готово", rows: [rows[0]] },
    { id: NO_GROUP, label: "Без значения", rows: [] },
  ]);
});

test("строка без значения попадает в последнюю колонку", () => {
  const rows = [
    { guid: "1", status: null },
    { guid: "2", status: "" },
    { guid: "3" },
  ];

  const columns = columnsOf(rows);

  expect(columns[columns.length - 1]).toEqual({
    id: NO_GROUP,
    label: "Без значения",
    rows,
  });
});

test("MULTISELECT кладёт карточку сразу в несколько колонок", () => {
  const rows = [{ guid: "1", status: ["todo", "done"] }];
  const columns = columnsOf(rows);

  expect(columns[0]?.rows).toEqual(rows);
  expect(columns[1]?.rows).toEqual(rows);
});

test("значение вне вариантов получает свою колонку, а не пропадает", () => {
  const rows = [{ guid: "1", status: "снятый вариант" }];

  expect(columnsOf(rows).map((column) => column.id)).toEqual([
    "todo",
    "done",
    "снятый вариант",
    NO_GROUP,
  ]);
});

/*
 * Колонка по связи: вариантов у поля нет вовсе, а подпись лежит
 * в самой строке — рядом со ссылкой бэкенд кладёт связанную запись.
 */
test("колонка из данных подписывается по своей же строке", () => {
  const rows = [
    { guid: "1", status: "guid-соли", status_data: { name: "Соли" } },
    { guid: "2", status: "guid-соли", status_data: { name: "Соли" } },
  ];

  const columns = boardColumns({
    rows,
    tabs: [],
    slug: "status",
    unassigned: "Без значения",
    labelOf: (row) => String((row["status_data"] as { name: string }).name),
  });

  expect(columns).toEqual([
    { id: "guid-соли", label: "Соли", rows },
    { id: NO_GROUP, label: "Без значения", rows: [] },
  ]);
});

test("номер позиции — между соседями, а не занятый соседом", () => {
  const rows = [
    { guid: "1", board_order: 1 },
    { guid: "2", board_order: 2 },
    { guid: "3", board_order: 3 },
  ];

  expect(boardOrderAt(rows, 0)).toBe(0);
  expect(boardOrderAt(rows, 1)).toBe(1.5);
  expect(boardOrderAt(rows, 3)).toBe(4);
  expect(boardOrderAt([], 0)).toBe(1);
});

test("карточки без номера считаются по своему месту", () => {
  const rows = [{ guid: "1" }, { guid: "2" }, { guid: "3" }];

  // Места 1, 2, 3 — значит между вторым и третьим будет 2.5.
  expect(boardOrderAt(rows, 2)).toBe(2.5);
});

test("одинаковые номера соседей не дают третьего такого же", () => {
  const rows = [
    { guid: "1", board_order: 2 },
    { guid: "2", board_order: 2 },
  ];

  expect(boardOrderAt(rows, 1)).toBe(2.5);
});

/*
 * Порядок строк задаёт сервер и между запросами он гуляет; колонки
 * от этого меняться местами не должны — иначе доска перетасовывается
 * после каждой правки.
 */
test("колонки из данных стоят по алфавиту, а не в порядке строк", () => {
  const rows = [{ guid: "1", status: "b" }, { guid: "2", status: "a" }];

  expect(boardColumns({ rows, tabs: [], slug: "status", unassigned: "—" }).map((c) => c.id)).toEqual(
    ["a", "b", NO_GROUP],
  );
});

test("колонки по связи стоят по номеру записи, безномерные — после, по алфавиту", () => {
  const rows = [
    { guid: "1", stage: "won" },
    { guid: "2", stage: "lead" },
    { guid: "3", stage: "b" },
    { guid: "4", stage: "a" },
  ];
  const orders: Record<string, number> = { won: 6, lead: 1 };

  expect(
    boardColumns({
      rows,
      tabs: [],
      slug: "stage",
      unassigned: "—",
      orderOf: (_row, value) => orders[value],
    }).map((c) => c.id),
  ).toEqual(["lead", "won", "a", "b", NO_GROUP]);
});

test("номер колонки — между соседями", () => {
  expect(orderAt([1, 6], 1)).toBe(3.5);
  expect(orderAt([1, 6], 0)).toBe(0);
  expect(orderAt([1, 6], 2)).toBe(7);
});

test("перенос колонки среди пронумерованных — одна запись, номер между соседями", () => {
  const rest = [
    { id: "lead", label: "", rows: [], order: 1 },
    { id: "won", label: "", rows: [], order: 6 },
  ];

  expect(columnOrderEdits(rest, "deal", 1)).toEqual([{ guid: "deal", order: 3.5 }]);
});

test("есть колонки без номера — нумеруются все, и колонка встаёт куда бросили", () => {
  // lead=1, won=6, a и b без номера. lead бросают после a.
  const rest = [
    { id: "won", label: "", rows: [], order: 6 },
    { id: "a", label: "", rows: [] },
    { id: "b", label: "", rows: [] },
  ];

  expect(columnOrderEdits(rest, "lead", 2)).toEqual([
    { guid: "won", order: 1 },
    { guid: "a", order: 2 },
    { guid: "lead", order: 3 },
    { guid: "b", order: 4 },
  ]);
});

test("номер колонки читается из связанной записи, пустой — не номер", () => {
  expect(sortOrderOf({ stage_data: { sort_order: 3 } }, "stage")).toBe(3);
  expect(sortOrderOf({ stage_data: { sort_order: "4" } }, "stage")).toBe(4);
  expect(sortOrderOf({ stage_data: { sort_order: null } }, "stage")).toBeUndefined();
  expect(sortOrderOf({ stage_data: null }, "stage")).toBeUndefined();
});

test("колонка по связи берёт цвет из связанной записи", () => {
  const rows = [{ guid: "1", stage: "s1", stage_data: { guid: "s1", color: "#3b82f6" } }];

  const [column] = boardColumns({
    rows,
    tabs: [],
    slug: "stage",
    unassigned: "—",
    colorOf: (row) => colorOf(row, "stage"),
  });

  expect(column?.color).toBe("#3b82f6");
  expect(colorOf({ stage_data: { color: "" } }, "stage")).toBeUndefined();
  expect(colorOf({ stage_data: null }, "stage")).toBeUndefined();
});

test("бросок в колонку без значения снимает значение, а не пишет пустую строку", () => {
  expect(groupValue(field("STATUS"), NO_GROUP)).toBeNull();
  expect(groupValue(field("MULTISELECT"), NO_GROUP)).toBeNull();
});

test("у MULTISELECT значение уезжает списком", () => {
  expect(groupValue(field("MULTISELECT"), "todo")).toEqual(["todo"]);
  expect(groupValue(field("STATUS"), "todo")).toBe("todo");
  expect(groupValue(field("LOOKUP"), "guid-1")).toBe("guid-1");
});

const LANE_ARGS = {
  tabs: [
    { id: "todo", label: "К работе" },
    { id: "done", label: "Готово" },
  ],
  slug: "status",
  unassigned: "Без статуса",
};

test("без поля дорожки доска остаётся одной дорожкой", () => {
  const lanes = boardLanes({
    ...LANE_ARGS,
    lane: "",
    rows: [{ guid: "1", status: "todo" }],
  });

  expect(lanes).toHaveLength(1);
  expect(lanes[0]?.id).toBe("");
  expect(lanes[0]?.columns.map((column) => column.id)).toEqual(["todo", "done", ""]);
});

/*
 * Колонки внутри дорожки те же и в том же порядке: иначе «Готово»
 * у одного исполнителя оказывалось бы третьим, а у другого — первым,
 * и доску нельзя было бы читать по строкам.
 */
test("у каждой дорожки свои строки и одинаковый набор колонок", () => {
  const lanes = boardLanes({
    ...LANE_ARGS,
    lane: "owner",
    laneTabs: [{ id: "anna", label: "Анна" }],
    rows: [
      { guid: "1", status: "todo", owner: "anna" },
      { guid: "2", status: "done", owner: "boris" },
      { guid: "3", status: "todo" },
    ],
  });

  // Анна — вариант поля, Борис встретился в данных, пустая дорожка последней.
  expect(lanes.map((lane) => lane.id)).toEqual(["anna", "boris", ""]);
  expect(lanes.map((lane) => lane.columns.map((column) => column.id))).toEqual([
    ["todo", "done", ""],
    ["todo", "done", ""],
    ["todo", "done", ""],
  ]);

  const anna = lanes[0]?.columns.find((column) => column.id === "todo");
  expect(anna?.rows.map((row) => row.guid)).toEqual(["1"]);

  const nobody = lanes[2]?.columns.find((column) => column.id === "todo");
  expect(nobody?.rows.map((row) => row.guid)).toEqual(["3"]);
});
