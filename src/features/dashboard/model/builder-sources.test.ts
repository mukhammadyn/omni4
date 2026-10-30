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
    expect(groupBuilderSources([...tables, tables[0]!], [], read, "", "en").flatMap((group) => group.tables)).toHaveLength(3);
    expect(groupBuilderSources(tables, menus, read, "absent", "en")).toEqual([]);
  });
  it("uses localized names and leaves unrecognized prefixes to real metadata/fallback", () => {
    const localized = { ...table("hrms_custom", "Custom"), labels: { ru: "Справочник" } };
    expect(groupBuilderSources([localized], menus, read, "СПРАВОЧНИК", "ru")[0]?.label).toBe("General");
  });
  it("puts every hr_ and crm_ table in its canonical module despite missing or conflicting metadata", () => {
    const keys = ["hr_timesheet_events", "hr_employee_family", "hr_employee_contacts", "hr_grade_matrix_cells", "crm_deals", "crm_tasks"];
    const wrong = [...menus, { node: node("wrong-hr", { tableId: "id-hr_employee_family" }), trail: [{ id: "crm", label: "CRM" }] }, { node: node("wrong-crm", { tableId: "id-crm_tasks" }), trail: [{ id: "hrms", label: "HRMS" }] }];
    const groups = groupBuilderSources(keys.map((key) => table(key, key)), wrong, () => true, "", "en");
    expect(groups.map((group) => [group.label, group.tables.map((item) => item.slug)])).toEqual([["CRM", keys.slice(4)], ["HRMS", keys.slice(0, 4)]]);
  });
  it("merges prefix and actual module entries, preserves other real modules and excludes denied matches", () => {
    const inventory = node("warehouse", { isModule: true, label: "Warehouse" });
    const tree = [...menus, { node: inventory, trail: [] }, { node: node("stock", { tableId: "id-stock" }), trail: [{ id: "warehouse", label: "Warehouse" }] }];
    const groups = groupBuilderSources([table("HR_contacts", "Contacts"), table("employees", "People"), table("stock", "Stock"), table("hr_private", "Private"), table("core_regions", "Regions")], tree, (slug) => slug !== "hr_private", "", "en");
    expect(groups.map((group) => [group.label, group.tables.length])).toEqual([["HRMS", 2], ["Warehouse", 1], ["General", 1]]);
    expect(groupBuilderSources([table("hr_private", "Private")], tree, () => false, "hr_", "en")).toEqual([]);
  });

});
