import { describe, expect, it, vi } from "vitest";
import { readCatalogPages } from "./catalog-pages";
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ slug: `table_${i}`, label: `Table ${i}` }));
describe("complete table metadata catalog", () => {
  it("automatically reads more than one page and one terminal empty page, without a fixed result limit", async () => {
    const data = rows(95);
    const read = vi.fn(async (offset: number, limit: number) => ({ tables: data.slice(offset, offset + limit), count: data.length }));
    expect(await readCatalogPages(read)).toEqual(data);
    expect(read.mock.calls.map(([offset]) => offset)).toEqual([0, 30, 60, 90, 95]);
  });
  it("advances by actual response size even if the server applies a lower default cap", async () => {
    const data = rows(52);
    const read = vi.fn(async (offset: number) => ({ tables: data.slice(offset, offset + 17) }));
    expect(await readCatalogPages(read)).toEqual(data);
    expect(read.mock.calls.map(([offset]) => offset)).toEqual([0, 17, 34, 51, 52]);
  });
  it("bounds concurrency at one metadata request and deduplicates overlapping pages", async () => {
    let active = 0, peak = 0;
    const pages = [[{ slug: "a" }, { slug: "b" }], [{ slug: "b" }, { slug: "c" }], []];
    const result = await readCatalogPages(async () => {
      active += 1; peak = Math.max(peak, active); await Promise.resolve(); active -= 1;
      return { tables: pages.shift() ?? [] };
    });
    expect(peak).toBe(1); expect(result.map((item) => item.slug)).toEqual(["a", "b", "c"]);
  });
  it("fails repeated/no-progress pages instead of hanging or claiming a truncated catalog is complete", async () => {
    const read = vi.fn(async () => ({ tables: rows(30) }));
    await expect(readCatalogPages(read)).rejects.toThrow("no progress");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("propagates a page error once and starts a clean cursor on explicit retry", async () => {
    const data = rows(35); let fail = true;
    const read = vi.fn(async (offset: number, limit: number) => {
      if (fail && offset === 30) throw new Error("page failed");
      return { tables: data.slice(offset, offset + limit) };
    });
    await expect(readCatalogPages(read)).rejects.toThrow("page failed");
    expect(read).toHaveBeenCalledTimes(2);
    fail = false; read.mockClear();
    expect(await readCatalogPages(read)).toEqual(data);
    expect(read.mock.calls.map(([offset]) => offset)).toEqual([0, 30, 35]);
  });
  it("honors cancellation and an explicit safety bound without returning partial success", async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => { controller.abort(); return { tables: rows(30) }; });
    await expect(readCatalogPages(read, { signal: controller.signal })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
    let page = 0;
    await expect(readCatalogPages(async () => ({ tables: [{ slug: `new_${page++}` }] }), { maxPages: 3 })).rejects.toThrow("safety bound");
  });
  it("returns a valid empty catalog and rejects malformed/no-key non-empty pages", async () => {
    expect(await readCatalogPages(async () => ({ count: 0 }))).toEqual([]);
    await expect(readCatalogPages(async () => ({ tables: [{}] }))).rejects.toThrow("no progress");
  });
});
