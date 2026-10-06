/**
 * Справочник со ссылкой на себя (отделы, должности, категории) —
 * строками дерева в порядке обхода, как `.ot` прототипа.
 *
 * Сирота — строка, чей родитель не пришёл в ответе или удалён, —
 * становится корнем, а не пропадает: иначе её не найти и не поправить.
 * Цикл (A → B → A) обходится один раз: зациклить экран правкой данных
 * нельзя, проверки на цикл в схеме нет (SYSTEM-TABLES-AUDIT, departments).
 */
export type TreeRow<T> = {
  row: T;
  depth: number;
  /** Сколько прямых детей. Ноль — строка-лист, раскрывать нечего. */
  children: number;
};

type Row = Record<string, unknown>;

export function flattenTree<T extends Row>(
  rows: T[],
  parentKey: string,
  closed: ReadonlySet<string>,
): TreeRow<T>[] {
  const guids = new Set(rows.map((row) => String(row.guid)));
  const kids = new Map<string, T[]>();
  const roots: T[] = [];

  for (const row of rows) {
    const parent = typeof row[parentKey] === "string" ? (row[parentKey] as string) : "";

    if (parent && parent !== row.guid && guids.has(parent)) {
      kids.set(parent, [...(kids.get(parent) ?? []), row]);
    } else {
      roots.push(row);
    }
  }

  const out: TreeRow<T>[] = [];
  const seen = new Set<string>();

  /* Свёрнутое обходится тоже, только не попадает в ответ: так «seen»
     знает все строки, достижимые от корней, и ниже остаются ровно
     строки цикла. */
  const walk = (row: T, depth: number, visible: boolean) => {
    const guid = String(row.guid);
    if (seen.has(guid)) return;
    seen.add(guid);

    const children = kids.get(guid) ?? [];
    if (visible) out.push({ row, depth, children: children.length });
    children.forEach((child) => walk(child, depth + 1, visible && !closed.has(guid)));
  };

  roots.forEach((row) => walk(row, 0, true));

  // Цикл без корня: обход от корней его не встретил — он и становится корнем.
  for (const row of rows) walk(row, 0, true);

  return out;
}
