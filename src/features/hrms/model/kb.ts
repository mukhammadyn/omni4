/**
 * База знаний: дерево страниц `hr_kb_articles` (родитель —
 * `hr_kb_articles_id`), у страницы эмодзи, заголовок и содержимое.
 *
 * Содержимое — документ tiptap (ProseMirror JSON, ADR-0015) строкой
 * в JSON-поле `content`. Статьи, перенесённые из hrms, лежат там
 * документом BlockNote — массивом блоков. Он переводится в tiptap
 * при чтении (`toDoc`) и сохраняется уже им: живые данные массово
 * не переписываются, статья переходит в новый формат при первой правке.
 */

export type KbNode = { type: string; attrs?: Record<string, unknown>; content?: KbNode[]; text?: string; marks?: KbMark[] };
type KbMark = { type: string; attrs?: Record<string, unknown> };
export type KbDoc = { type: "doc"; content: KbNode[] };

export type KbPage = {
  id: string;
  parentId: string;
  title: string;
  icon: string;
  /** Как лежит в базе: строка JSON, массив BlockNote или документ. */
  content: unknown;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  author: string;
};

export const EMPTY_DOC: KbDoc = { type: "doc", content: [{ type: "paragraph" }] };

const parse = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/** Содержимое страницы документом tiptap, в каком бы виде оно ни лежало. */
export function toDoc(value: unknown): KbDoc {
  const raw = parse(value);
  if (Array.isArray(raw)) {
    const content = fromBlocks(raw as Block[]);
    return content.length ? { type: "doc", content } : EMPTY_DOC;
  }
  if (raw && typeof raw === "object" && (raw as KbDoc).type === "doc") return raw as KbDoc;
  return EMPTY_DOC;
}

/* ---------- BlockNote → tiptap ---------- */

type Inline = { type: string; text?: string; href?: string; styles?: Record<string, unknown>; content?: Inline[] };
type Cell = Inline[] | { type: "tableCell"; content?: Inline[]; props?: { colspan?: number; rowspan?: number } };
type Block = {
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | { type: "tableContent"; headerRows?: number; rows: { cells: Cell[] }[] };
  children?: Block[];
};

/*
 * Стили BlockNote → метки tiptap. Цвета (textColor, backgroundColor)
 * не переносятся: в данных это следы вставки из чужих документов —
 * чёрный, почти чёрный и прозрачный фон, — и в тёмной теме чёрный
 * текст пропал бы. Выравнивания в данных нет.
 */
const STYLE_MARKS: Record<string, string> = { bold: "bold", italic: "italic", underline: "underline", strike: "strike", code: "code" };

function fromInline(items: Inline[] | undefined, link?: string): KbNode[] {
  return (items ?? []).flatMap((item): KbNode[] => {
    if (item.type === "link") return fromInline(item.content, item.href);
    if (item.type !== "text" || !item.text) return [];
    const marks: KbMark[] = Object.entries(item.styles ?? {})
      .filter(([style, on]) => on === true && STYLE_MARKS[style])
      .map(([style]) => ({ type: STYLE_MARKS[style]! }));
    if (link) marks.push({ type: "link", attrs: { href: link } });
    return [{ type: "text", text: item.text, ...(marks.length ? { marks } : {}) }];
  });
}

const paragraph = (inline: KbNode[]): KbNode => (inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" });
const inlineOf = (block: Block) => fromInline(Array.isArray(block.content) ? block.content : undefined);

const LISTS: Record<string, { list: string; item: string }> = {
  bulletListItem: { list: "bulletList", item: "listItem" },
  numberedListItem: { list: "orderedList", item: "listItem" },
  checkListItem: { list: "taskList", item: "taskItem" },
};

/** Блоки по порядку; соседние пункты одного вида — один список. */
function fromBlocks(blocks: Block[]): KbNode[] {
  const out: KbNode[] = [];
  for (const block of blocks) {
    const list = LISTS[block.type];
    if (list) {
      const item: KbNode = {
        type: list.item,
        ...(list.item === "taskItem" ? { attrs: { checked: block.props?.checked === true } } : {}),
        content: [paragraph(inlineOf(block)), ...fromBlocks(block.children ?? [])],
      };
      const last = out.at(-1);
      if (last?.type === list.list) last.content!.push(item);
      else {
        const start = Number(block.props?.start);
        out.push({ type: list.list, ...(list.list === "orderedList" && start > 1 ? { attrs: { start } } : {}), content: [item] });
      }
      continue;
    }
    out.push(...fromBlock(block), ...fromBlocks(block.children ?? []));
  }
  return out;
}

function fromBlock(block: Block): KbNode[] {
  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(block.props?.level) || 1));
      const inline = inlineOf(block);
      return [{ type: "heading", attrs: { level }, ...(inline.length ? { content: inline } : {}) }];
    }
    case "quote":
      return [{ type: "blockquote", content: [paragraph(inlineOf(block))] }];
    case "divider":
      return [{ type: "horizontalRule" }];
    case "codeBlock": {
      const text = inlineOf(block).map((n) => n.text).join("");
      return [{ type: "codeBlock", ...(text ? { content: [{ type: "text", text }] } : {}) }];
    }
    case "image": {
      const src = typeof block.props?.url === "string" ? block.props.url : "";
      return src ? [{ type: "image", attrs: { src, alt: String(block.props?.name ?? "") } }] : [];
    }
    case "table":
      return [fromTable(block)];
    /* Карточка подстраницы hrms. Ссылается на дочернюю страницу, а они
       и так перечислены под документом (как в прототипе). */
    case "pageLink":
      return [];
    default:
      return [paragraph(inlineOf(block))];
  }
}

function fromTable(block: Block): KbNode {
  const table = block.content && !Array.isArray(block.content) ? block.content : { rows: [], headerRows: 0 };
  const headerRows = table.headerRows ?? 0;
  return {
    type: "table",
    content: table.rows.map((row, at) => ({
      type: "tableRow",
      content: row.cells.map((cell) => {
        const inline = fromInline(Array.isArray(cell) ? cell : cell.content);
        const props = Array.isArray(cell) ? {} : (cell.props ?? {});
        return {
          type: at < headerRows ? "tableHeader" : "tableCell",
          attrs: { colspan: props.colspan ?? 1, rowspan: props.rowspan ?? 1 },
          content: [paragraph(inline)],
        };
      }),
    })),
  };
}

/* ---------- Дерево ---------- */

/** Порядок подстраниц, заданный в родителе карточками hrms (`pageLink`). */
function linkOrder(content: unknown): string[] {
  const raw = parse(content);
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  const walk = (blocks: Block[]) =>
    blocks.forEach((b) => {
      if (b.type === "pageLink" && typeof b.props?.articleId === "string") ids.push(b.props.articleId);
      walk(b.children ?? []);
    });
  walk(raw as Block[]);
  return ids;
}

/**
 * Подстраницы по порядку: `sort_order`, если задан, затем порядок
 * карточек в родителе (так их расставил hrms), затем по созданию.
 */
export function childrenOf(pages: KbPage[], parentId: string): KbPage[] {
  const parent = pages.find((p) => p.id === parentId);
  const links = parent ? linkOrder(parent.content) : [];
  const rank = (p: KbPage) => {
    const at = links.indexOf(p.id);
    return at < 0 ? Infinity : at;
  };
  return pages
    .filter((p) => p.parentId === parentId)
    .sort(
      (a, b) =>
        (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
        rank(a) - rank(b) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** Путь от корня до страницы включительно — крошки и раскрытие дерева. */
export function pathTo(pages: KbPage[], id: string): KbPage[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const path: KbPage[] = [];
  /* Битая ссылка на родителя или цикл — не зависать. */
  for (let page = byId.get(id); page && !path.includes(page); page = byId.get(page.parentId)) path.unshift(page);
  return path;
}

/** Все вложенные страницы — удаляются вместе с родителем. */
export function descendantsOf(pages: KbPage[], id: string): string[] {
  const out: string[] = [];
  for (let level = [id]; level.length; ) {
    /* Уже собранные не берутся второй раз: цикл в данных не зациклит. */
    level = pages.filter((p) => level.includes(p.parentId) && p.id !== id && !out.includes(p.id)).map((p) => p.id);
    out.push(...level);
  }
  return out;
}

/** Текст документа без разметки — для поиска по дереву. */
export function docText(doc: KbDoc | KbNode): string {
  if ("text" in doc && doc.text) return doc.text;
  return (doc.content ?? []).map((n) => docText(n)).join(" ");
}

export type DropWhere = "before" | "after" | "in";

/**
 * Перетаскивание в дереве: куда встаёт страница и какой порядок
 * у её новых соседей. `sort_order` пишется всем соседям по порядку:
 * у страниц из hrms он пуст, и номер у одной поставил бы её первой.
 * Пусто — бросить нельзя (на себя или в свою ветку: был бы цикл).
 */
export function dropPlan(pages: KbPage[], dragId: string, targetId: string, where: DropWhere) {
  const drag = pages.find((p) => p.id === dragId);
  const target = pages.find((p) => p.id === targetId);
  if (!drag || !target || dragId === targetId || descendantsOf(pages, dragId).includes(targetId)) return [];
  const parentId = where === "in" ? target.id : target.parentId;
  const siblings = childrenOf(pages, parentId).filter((p) => p.id !== dragId);
  const at = where === "in" ? siblings.length : siblings.findIndex((p) => p.id === targetId) + (where === "after" ? 1 : 0);
  return [...siblings.slice(0, at), drag, ...siblings.slice(at)]
    .map((p, sortOrder) => ({ id: p.id, sortOrder, ...(p.id === dragId && p.parentId !== parentId ? { parentId } : {}) }))
    .filter((step, i, all) => {
      const page = pages.find((p) => p.id === all[i]!.id)!;
      return page.sortOrder !== step.sortOrder || "parentId" in step;
    });
}
