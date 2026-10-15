import { expect, test } from "vitest";
import { EMPTY_DOC, childrenOf, descendantsOf, docText, dropPlan, pathTo, toDoc, type KbPage } from "./kb";

const text = (t: string, styles: Record<string, unknown> = {}) => ({ type: "text", text: t, styles });
const block = (type: string, content: unknown[] = [], props: Record<string, unknown> = {}, children: unknown[] = []) => ({
  type,
  props,
  content,
  children,
});

test("BlockNote строкой: абзац, заголовок, цитата, разделитель, картинка", () => {
  const doc = toDoc(
    JSON.stringify([
      block("heading", [text("Глава")], { level: 2 }),
      block("paragraph", [text("жирно", { bold: true, textColor: "rgb(0, 0, 0)" }), text(" просто")]),
      block("quote", [text("Важно")]),
      { type: "divider", props: {}, children: [] },
      { type: "image", props: { url: "https://cdn/x.png", name: "x.png" }, children: [] },
    ]),
  );
  expect(doc.content).toEqual([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Глава" }] },
    {
      type: "paragraph",
      /* Цвет из вставки не переносится, жирный — да. */
      content: [
        { type: "text", text: "жирно", marks: [{ type: "bold" }] },
        { type: "text", text: " просто" },
      ],
    },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Важно" }] }] },
    { type: "horizontalRule" },
    { type: "image", attrs: { src: "https://cdn/x.png", alt: "x.png" } },
  ]);
});

test("соседние пункты — один список, вложенные — внутри пункта; ссылка — меткой", () => {
  const doc = toDoc([
    block("bulletListItem", [text("a")], {}, [block("bulletListItem", [{ type: "link", href: "https://u", content: [text("в")] }])]),
    block("bulletListItem", [text("b")]),
    block("numberedListItem", [text("1")], { start: 3 }),
  ]);
  expect(doc.content).toEqual([
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "a" }] },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "в", marks: [{ type: "link", attrs: { href: "https://u" } }] }] }],
                },
              ],
            },
          ],
        },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
      ],
    },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] }] },
  ]);
});

test("таблица: первые headerRows строк — заголовки; карточка подстраницы hrms выпадает", () => {
  const doc = toDoc([
    {
      type: "table",
      props: {},
      content: {
        type: "tableContent",
        headerRows: 1,
        rows: [
          { cells: [{ type: "tableCell", content: [text("Отдел")], props: { colspan: 1, rowspan: 1 } }] },
          { cells: [[text("CEO")]] },
        ],
      },
    },
    { type: "pageLink", props: { articleId: "x" } },
  ]);
  expect(doc.content).toEqual([
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Отдел" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "CEO" }] }] }] },
      ],
    },
  ]);
});

test("документ tiptap отдаётся как есть; пусто и мусор — пустой документ", () => {
  const doc = { type: "doc", content: [{ type: "paragraph" }] };
  expect(toDoc(JSON.stringify(doc))).toEqual(doc);
  expect(toDoc(null)).toEqual(EMPTY_DOC);
  expect(toDoc("[]")).toEqual(EMPTY_DOC);
  expect(toDoc("{oops")).toEqual(EMPTY_DOC);
});

const page = (id: string, parentId = "", extra: Partial<KbPage> = {}): KbPage => ({
  id,
  parentId,
  title: id,
  icon: "",
  content: null,
  sortOrder: null,
  createdAt: "2026-01-01",
  updatedAt: "",
  author: "",
  ...extra,
});

test("подстраницы: sort_order, затем порядок карточек hrms в родителе, затем по созданию", () => {
  const pages = [
    page("root", "", { content: JSON.stringify([{ type: "pageLink", props: { articleId: "b" } }, { type: "pageLink", props: { articleId: "a" } }]) }),
    page("a", "root", { createdAt: "2026-01-01" }),
    page("b", "root", { createdAt: "2026-01-02" }),
    page("c", "root", { createdAt: "2026-01-00" }),
    page("d", "root", { sortOrder: 0 }),
  ];
  expect(childrenOf(pages, "root").map((p) => p.id)).toEqual(["d", "b", "a", "c"]);
});

test("путь и потомки; цикл в данных не зацикливает", () => {
  const pages = [page("a"), page("b", "a"), page("c", "b"), page("x", "y"), page("y", "x")];
  expect(pathTo(pages, "c").map((p) => p.id)).toEqual(["a", "b", "c"]);
  expect(descendantsOf(pages, "a")).toEqual(["b", "c"]);
  expect(pathTo(pages, "x").map((p) => p.id)).toEqual(["y", "x"]);
  expect(descendantsOf(pages, "x")).toEqual(["y"]);
});

test("текст документа — для поиска", () => {
  expect(docText(toDoc([block("paragraph", [text("один")]), block("bulletListItem", [text("два")])])).replace(/\s+/g, " ").trim()).toBe(
    "один два",
  );
});

test("перетаскивание: перед, после, внутрь; номера всем соседям; в свою ветку — нельзя", () => {
  const pages = [page("r"), page("a", "r", { createdAt: "1" }), page("b", "r", { createdAt: "2" }), page("c", "r", { createdAt: "3" }), page("x")];
  expect(dropPlan(pages, "c", "a", "before")).toEqual([
    { id: "c", sortOrder: 0 },
    { id: "a", sortOrder: 1 },
    { id: "b", sortOrder: 2 },
  ]);
  expect(dropPlan(pages, "x", "b", "after")).toEqual([
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "x", sortOrder: 2, parentId: "r" },
    { id: "c", sortOrder: 3 },
  ]);
  expect(dropPlan(pages, "x", "a", "in")).toEqual([{ id: "x", sortOrder: 0, parentId: "a" }]);
  expect(dropPlan(pages, "r", "a", "in")).toEqual([]);
  expect(dropPlan(pages, "a", "a", "after")).toEqual([]);
  /* Порядок уже такой — писать нечего. */
  const sorted = pages.map((p, i) => (p.parentId === "r" ? { ...p, sortOrder: i - 1 } : p));
  expect(dropPlan(sorted, "b", "a", "after")).toEqual([]);
});
