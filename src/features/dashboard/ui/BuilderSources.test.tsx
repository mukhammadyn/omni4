import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useTableCatalog } from "@/features/table";
import { useTablePermissions } from "@/features/auth";
import { useMenuTree } from "@/features/sidebar";
import { useWidgetData } from "../api/widget-data";
import { BuilderSources } from "./BuilderData";
vi.mock("@/features/table", async (original) => ({ ...await original<typeof import("@/features/table")>(), useTableCatalog: vi.fn() }));
vi.mock("@/features/auth", async (original) => ({ ...await original<typeof import("@/features/auth")>(), useTablePermissions: vi.fn() }));
vi.mock("@/features/sidebar", async (original) => ({ ...await original<typeof import("@/features/sidebar")>(), useMenuTree: vi.fn() }));
vi.mock("../api/widget-data", () => ({ useWidgetData: vi.fn() }));
vi.mock("react-i18next", async (original) => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
const table = (slug: string, label = slug) => ({ id: slug, slug, label, labels: {}, icon: "" });
const render = () => renderToStaticMarkup(<BuilderSources value="crm_late_page" language="en" onPick={vi.fn()} />);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMenuTree).mockReturnValue({ items: [], isLoading: false, error: null });
  vi.mocked(useTablePermissions).mockReturnValue(((slug: string) => ({ read: slug !== "hr_private" })) as ReturnType<typeof useTablePermissions>);
  vi.mocked(useTableCatalog).mockReturnValue({ items: [...Array.from({ length: 65 }, (_, i) => table(`hr_${i}`)), table("crm_late_page", "Last CRM source"), table("core_regions"), table("hr_private", "Private")], isLoading: false, error: null, retry: vi.fn() });
});
describe("complete chart Source catalog UI", () => {
  it("preserves a late-page selection, canonical tags and permissions without per-group Load more", () => {
    const html = render();
    const chosen = html.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    expect(chosen).toContain("Last CRM source"); expect(chosen).toContain("crm_late_page");
    expect(html).toContain('aria-label="HRMS"'); expect(html).toContain('aria-label="CRM"'); expect(html).toContain('aria-label="General"');
    expect(html).not.toContain("hr_private"); expect(html).not.toContain("Load more"); expect(html).not.toContain("action.more");
    expect(useWidgetData).not.toHaveBeenCalled();
  });
  it("shows catalog errors and explicit retry without pretending the catalog is empty", () => {
    vi.mocked(useTableCatalog).mockReturnValue({ items: [], isLoading: false, error: new Error("page failed"), retry: vi.fn() });
    const html = render();
    expect(html).toContain('role="alert"'); expect(html).toContain("Retry"); expect(html).not.toContain("No tables found");
  });
  it("shows loading until metadata completion without a false empty state", () => {
    vi.mocked(useTableCatalog).mockReturnValue({ items: [], isLoading: true, error: null, retry: vi.fn() });
    const html = render();
    expect(html).toContain('role="status"'); expect(html).toContain("common.loading"); expect(html).not.toContain("No tables found");
  });
});
