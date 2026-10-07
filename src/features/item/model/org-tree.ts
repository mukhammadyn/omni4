/**
 * Узел оргструктуры: что угодно с детьми. Дерево сотрудников, отделов,
 * юрлиц — разные данные, а холст (ui/OrgChart) у них один.
 */
export type OrgNode<T> = { id: string; data: T; kids: OrgNode<T>[] };

/**
 * Плоский список → дерево по ссылке на родителя.
 *
 * Сирота (родитель не в наборе — отсеян фильтром, удалён) встаёт
 * в корень, как в groupByParent: спрятать запись хуже, чем показать её
 * без начальника. Цикл (A руководит B, B руководит A) не теряет никого:
 * первая не попавшая в дерево запись цикла становится корнем, и обход
 * останавливается на уже показанной.
 */
export function buildTree<T>(
  items: T[],
  idOf: (item: T) => string,
  parentOf: (item: T) => string | undefined,
): OrgNode<T>[] {
  const ids = new Set(items.map(idOf));
  const childrenOf = new Map<string, T[]>();

  for (const item of items) {
    const parent = parentOf(item);
    const at = parent && parent !== idOf(item) && ids.has(parent) ? parent : "";
    const bucket = childrenOf.get(at);
    if (bucket) bucket.push(item);
    else childrenOf.set(at, [item]);
  }

  const seen = new Set<string>();
  const build = (item: T): OrgNode<T> => {
    const id = idOf(item);
    seen.add(id);
    const kids = (childrenOf.get(id) ?? []).filter((kid) => !seen.has(idOf(kid)));
    return { id, data: item, kids: kids.map(build) };
  };

  const roots = (childrenOf.get("") ?? []).map(build);
  for (const item of items) if (!seen.has(idOf(item))) roots.push(build(item));

  return roots;
}

/** Сколько узлов под этим — число на свёрнутом узле («+12»). */
export function countBelow<T>(node: OrgNode<T>): number {
  return node.kids.reduce((sum, kid) => sum + 1 + countBelow(kid), 0);
}

/** Id узлов с детьми на глубине `from` и ниже: их сворачивают сразу. */
export function collapsedFrom<T>(roots: OrgNode<T>[], from: number): Set<string> {
  const closed = new Set<string>();
  const walk = (node: OrgNode<T>, depth: number) => {
    if (depth >= from && node.kids.length) closed.add(node.id);
    node.kids.forEach((kid) => walk(kid, depth + 1));
  };
  roots.forEach((root) => walk(root, 0));
  return closed;
}
