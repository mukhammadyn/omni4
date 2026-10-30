import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newChart } from "@/features/item";
import type { Field } from "@/features/table";
import { useWidgetData } from "../api/widget-data";
import { BuilderRowsPreview } from "./BuilderData";
vi.mock("../api/widget-data", () => ({ useWidgetData: vi.fn() }));
vi.mock("react-i18next", async (original) => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
const field = (slug: string, type = "SINGLE_LINE") => ({ id: slug, slug, label: slug, labels: {}, type, options: new Map() }) as Field;
const fields = [field("title"), field("amount", "NUMBER"), field("private")];
const widget = { ...newChart(), tableSlug: "events", filters: {}, answers: {} };
let data: ReturnType<typeof useWidgetData>;
const render = (props = {}) => renderToStaticMarkup(<BuilderRowsPreview widget={widget} fields={fields} filters={[]} values={{}} menuId="menu" datasets={[]} language="en" {...props} />);
beforeEach(() => {
  data = { schema: { fields: fields.slice(0, 2), relations: [] }, rows: [{ guid: "1", title: "Allowed row", amount: 25, private: "SECRET" }], count: 1, unanswered: [], ready: true, loading: false, denied: false, forbidden: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useWidgetData>;
  vi.mocked(useWidgetData).mockReturnValue(data);
});
describe("chart Fields source preview", () => {
  it("renders actual response rows through permitted schema, without private columns", () => {
    const html = render();
    expect(html).toContain("Allowed row"); expect(html).toContain("25");
    expect(html).not.toContain("SECRET"); expect(html).not.toContain(">private<");
  });
  it("passes the independent bounded limit to the existing records read contract", () => {
    render({ limit: 1000 });
    expect(vi.mocked(useWidgetData).mock.calls.at(-1)?.[0]).toMatchObject({ type: "records", pageSize: 1000, tableSlug: "events" });
    expect(widget).not.toHaveProperty("pageSize");
  });
  it("does not display stale response rows during loading, errors or denied access", () => {
    for (const state of [{ loading: true }, { error: "Could not load rows" }, { denied: true }, { forbidden: true }]) {
      vi.mocked(useWidgetData).mockReturnValue({ ...data, ...state });
      expect(render()).not.toContain("Allowed row");
    }
  });
  it("shows an honest empty result and honors hidden fields", () => {
    vi.mocked(useWidgetData).mockReturnValue({ ...data, rows: [], count: 0 });
    expect(render()).toContain("sql.noRows");
    vi.mocked(useWidgetData).mockReturnValue(data);
    const html = render({ widget: { ...widget, fieldPresentation: { title: { hidden: true } } } });
    expect(html).not.toContain("Allowed row"); expect(html).toContain("25");
  });
});
