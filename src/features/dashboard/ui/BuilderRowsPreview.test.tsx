import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newChart } from "@/features/item";
import type { Field } from "@/features/table";
import { useWidgetData } from "../api/widget-data";
import { BuilderRowsPreview } from "./BuilderData";

vi.mock("../api/widget-data", () => ({ useWidgetData: vi.fn() }));
vi.mock("./WidgetContents", () => ({ WidgetStatus: () => null }));
vi.mock("react-i18next", async original => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
const fields = [{ slug: "name", label: "Name", labels: {}, type: "SINGLE_LINE" }] as Field[];
const widget = { ...newChart(), tableSlug: "events", filters: {}, answers: {} };
const state = { schema: { fields, relations: [] }, rows: [{ guid: "5", name: "Visible fifth", secret: "MUST_NOT_RENDER" }, { guid: "6", name: "Visible sixth" }], count: 6, ready: true, loading: false, denied: false, forbidden: false, error: null, refetch: vi.fn() };
const render = () => renderToStaticMarkup(<BuilderRowsPreview widget={widget} fields={fields} filters={[]} values={{}} menuId="menu" datasets={[]} language="en" limit={2} page={3} onPage={vi.fn()} showTypes />);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useWidgetData).mockReturnValue(state as unknown as ReturnType<typeof useWidgetData>); });

it("uses the requested server page and exposes bounded count, row numbers and permission-scoped columns", () => {
  const html = render();
  expect(useWidgetData).toHaveBeenCalledWith(expect.objectContaining({ type: "records", pageSize: 2, columns: ["name"] }), [], {}, "menu", {}, 3, [], []);
  expect(html).toContain("5–6 / 6"); expect(html).toContain("Page 3 / 3"); expect(html).toContain("SINGLE_LINE");
  expect(html).toContain("Visible fifth"); expect(html).not.toContain("MUST_NOT_RENDER");
  expect(html).toMatch(/disabled=""[^>]*>Next/);
});

it.each([{ loading: true }, { denied: true }, { forbidden: true }, { error: "Source unavailable" }])("does not expose previous-page rows or counts while unavailable: %j", change => {
  vi.mocked(useWidgetData).mockReturnValue({ ...state, ...change } as unknown as ReturnType<typeof useWidgetData>);
  const html = render(); expect(html).not.toContain("Visible fifth"); expect(html).not.toContain("5–6 / 6");
});

it("distinguishes an empty real result from loading and has no next page", () => {
  vi.mocked(useWidgetData).mockReturnValue({ ...state, rows: [], count: 0 } as unknown as ReturnType<typeof useWidgetData>);
  const html = renderToStaticMarkup(<BuilderRowsPreview widget={widget} fields={fields} filters={[]} values={{}} menuId="menu" datasets={[]} language="en" onPage={vi.fn()} />);
  expect(html).toContain("sql.noRows"); expect(html).toContain("Page 1 / 1"); expect(html).not.toContain("Visible fifth");
});

it("binds toolbar refresh to the actual records request", () => {
  let refresh: (() => void) | undefined;
  renderToStaticMarkup(<BuilderRowsPreview widget={widget} fields={fields} filters={[]} values={{}} menuId="menu" datasets={[]} language="en" toolbar={run => { refresh = run; return null; }} />);
  expect(refresh).toBe(state.refetch);
});
