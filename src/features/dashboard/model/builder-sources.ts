import type { MenuNode } from "@/features/sidebar";
import { localized, type TableOption } from "@/features/table";

type MenuEntry = { node: MenuNode; trail: { id: string; label: string }[] };
export type SourceGroup = { id: string; label: string; tables: TableOption[] };

/** Explicit ERP prefixes take precedence; other tables keep actual menu membership. */
export function groupBuilderSources(tables: TableOption[], menus: MenuEntry[], canRead: (slug: string) => boolean, search: string, language: string, general = "General"): SourceGroup[] {
  const modules = new Map(menus.filter(({ node }) => node.isModule).map(({ node }) => [node.id, node]));
  const groups = new Map<string, SourceGroup>();
  const query = search.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  for (const table of tables) {
    if (seen.has(table.slug) || !canRead(table.slug)) continue;
    seen.add(table.slug);
    if (query && ![table.slug, table.label, localized(table.labels, language, table.label)].some((label) => label.toLocaleLowerCase().includes(query))) continue;
    const match = menus.find(({ node, trail }) => (node.tableId === table.id || node.tableId === table.slug) && trail.some((parent) => modules.has(parent.id)));
    const module = match?.trail.map((parent) => modules.get(parent.id)).find(Boolean);
    const key = table.slug.toLocaleLowerCase();
    const prefix = key.startsWith("hr_") ? "HRMS" : key.startsWith("crm_") ? "CRM" : null;
    const moduleLabel = module?.label.trim().toLocaleUpperCase();
    const canonical = prefix ?? (moduleLabel === "HRMS" || moduleLabel === "CRM" ? moduleLabel : null);
    const id = canonical ? `erp-${canonical.toLocaleLowerCase()}` : module?.id ?? "general";
    const group = groups.get(id) ?? { id, label: canonical ?? module?.label ?? general, tables: [] };
    group.tables.push(table); groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.id === "general" ? 1 : b.id === "general" ? -1 : a.label.localeCompare(b.label));
}
