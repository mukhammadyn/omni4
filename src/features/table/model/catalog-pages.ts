export type CatalogPage<T> = { tables?: T[]; count?: number | string };
const PAGE_SIZE = 30;
const MAX_PAGES = 1000;

/** A catalog read is complete only at an empty page, not at a UI page-size limit.
 * One metadata request at a time. Advance by the actual response size so a server
 * page cap smaller than the requested limit cannot silently truncate the list.
 * Count is advisory; repeated/no-progress pages fail instead of looping forever.
 */
export async function readCatalogPages<T extends { slug?: string }>(
  readPage: (offset: number, limit: number, signal?: AbortSignal) => Promise<CatalogPage<T>>,
  { signal, maxPages = MAX_PAGES }: { signal?: AbortSignal | undefined; maxPages?: number } = {},
): Promise<T[]> {
  const items = new Map<string, T>();
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    signal?.throwIfAborted();
    const response = await readPage(offset, PAGE_SIZE, signal);
    signal?.throwIfAborted();
    const rows = response.tables ?? [];
    if (!Array.isArray(rows)) throw new Error("Invalid table catalog page");
    if (!rows.length) return [...items.values()];
    let added = 0;
    for (const row of rows) {
      if (!row.slug || items.has(row.slug)) continue;
      items.set(row.slug, row); added += 1;
    }
    if (!added) throw new Error("Table catalog pagination made no progress");
    offset += rows.length;
  }
  throw new Error("Table catalog pagination exceeded its safety bound");
}
