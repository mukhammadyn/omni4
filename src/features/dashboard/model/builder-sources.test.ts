import { describe, expect, it } from "vitest";
import type { MenuNode } from "@/features/sidebar";
import { groupBuilderSources } from "./builder-sources";
const table = (slug: string, label: string) => ({ id: `id-${slug}`, slug, label, labels: {}, icon: "" });
const node = (id: string, extra: Partial<MenuNode> = {}) => ({ id, label: id.toUpperCase(), isModule: false, tableId: "", ...extra }) as MenuNode;
const menus = [{ node: node("crm", { isModule: true }), trail: [] }, { node: node("hrms", { isModule: true }), trail: [] }, { node: node("deal", { tableId: "id-crm_deals" }), trail: [{ id: "crm", label: "CRM" }] }, { node: node("person", { tableId: "employees" }), trail: [{ id: "hrms", label: "HRMS" }] }];
const tables = [table("crm_deals", "Сделки"), table("employees", "People"), table("notes", "Notes"), table("secret", "Private")];
const read = (slug: string) => slug !== "secret";
describe("chart source catalog", () => {
  it("uses module metadata with ID and slug references, and a General fallback", () => {
    expect(groupBuilderSources(tables, menus, read, "", "en").map((g) => [g.label, g.tables.map((t) => t.slug)])).toEqual([["CRM", ["crm_deals"]], ["HRMS", ["employees"]], ["General", ["notes"]]]);
  });
  it("matches technical keys and display labels case-insensitively", () => {
    expect(groupBuilderSources(tables, menus, read, " CRM_DEALS ", "en")[0]?.tables[0]?.label).toBe("Сделки");
    expect(groupBuilderSources(tables, menus, read, "PEOPLE", "en")[0]?.label).toBe("HRMS");
    expect(groupBuilderSources(tables, menus, read, "сДеЛкИ", "ru")[0]?.label).toBe("CRM");
  });
  it("keeps permission filtering, unknown fallback and deduplication even during search", () => {
    expect(groupBuilderSources(tables, menus, read, "secret", "en")).toEqual([]);
    expect(groupBuilderSources([...tables, tables[0]!], [], read, "", "en")[0]?.tables).toHaveLength(3);
    expect(groupBuilderSources(tables, menus, read, "absent", "en")).toEqual([]);
  });
  it("uses localized display names without guessing modules from a prefix", () => {
    const localized = { ...table("hrms_custom", "Custom"), labels: { ru: "Справочник" } };
    expect(groupBuilderSources([localized], menus, read, "СПРАВОЧНИК", "ru")[0]?.label).toBe("General");
  });
});
