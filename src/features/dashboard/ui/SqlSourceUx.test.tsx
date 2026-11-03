import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newChart } from "@/features/item";
import { BuilderParameters, BuilderSourceFields } from "./BuilderData";
import { SqlDatasetRunner } from "./SqlDatasetRunner";
import { ChartAppearance } from "./ChartAppearance";
import { SqlWidgetOptions } from "./SqlWidgetOptions";
import { updateSqlParameter, type Dataset } from "../model/datasets";
import { useSqlRunner } from "../api/sql-runner";
import { useDashboardSchema } from "../api/schema";
vi.mock("react-i18next", async original => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ru" } }) }));
vi.mock("../api/sql-runner", () => ({ useSqlRunner: vi.fn() }));
vi.mock("../api/schema", () => ({ useDashboardSchema: vi.fn() }));
vi.mock("../api/sql-catalog", () => ({ useSqlCatalog: () => ({ tables: [] }) }));
const parameter = { name: "month", type: "date" as const, required: false, defaultValue: "2026-10-01", dashboardControl: "month" as const, controlLabel: "Месяц", controlGroup: "period", dynamicDefault: "today" as const };
const dataset: Dataset = { id: "query", name: "Existing", source: { kind: "sql", sql: "SELECT :month", columns: [], parameters: [parameter, { name: "other", type: "text", required: true, defaultValue: "kept" }] } };
const result = { columns: [{ key: "total", type: "numeric" }], rows: [{ total: "32" }], limit: 100, truncated: false };
const renderRunner = () => renderToStaticMarkup(<SqlDatasetRunner menuId="allowed" sql="SELECT 32 AS total" parameters={[]} previewFields />);
beforeEach(() => {
  vi.mocked(useSqlRunner).mockReturnValue({ result, enabled: true, busy: false, checking: false, scopeKey: "scope", maxRows: 1000, error: null, gateError: null, run: vi.fn(), cancel: vi.fn() });
});
describe("simplified SQL source", () => {
  it("uses one name/type/value editor and keeps shared values visibly bound", () => {
    const html = renderToStaticMarkup(<BuilderParameters dataset={dataset} onChange={() => {}} language="ru" values={{ month: "2026-11-01" }} sharedNames={["month"]} onValueChange={() => {}} />);
    expect(html).toContain("Месяц"); expect(html).toContain('value="2026-11-01"'); expect(html).toMatch(/readonly/i);
    expect(html).toContain("Значение из фильтра дашборда");
    expect(html).not.toContain("Значения для отдельного запуска можно изменить ниже");
    expect(html).toContain("Настройки параметра"); expect(html).toContain('value="2026-10-01"');
  });
  it("edits defaults without changing parameter order, required flag or control metadata", () => {
    const next = updateSqlParameter(dataset, { ...parameter, defaultValue: "2026-12-01" });
    expect(next.source).toMatchObject({ parameters: [{ ...parameter, defaultValue: "2026-12-01" }, { name: "other", defaultValue: "kept" }] });
    expect(dataset.source.kind === "sql" && dataset.source.parameters[0]).toEqual(parameter);
    const missing = updateSqlParameter(dataset, { name: "new", type: "number", required: true, defaultValue: "2" });
    expect(missing.source.kind === "sql" && missing.source.parameters.map(p => p.name)).toEqual(["month", "other", "new"]);
  });
  it("shows actual execution columns and rows immediately below the run flow", () => {
    const html = renderRunner();
    expect(html).toContain("Поля результата"); expect(html).toContain("numeric"); expect(html).toContain("total"); expect(html).toContain("32");
  });
  it("distinguishes loading, errors, no execution and successful empty results", () => {
    const initial = vi.mocked(useSqlRunner)("allowed", "SELECT 32 AS total", [], {}, 100);
    for (const state of [{ result: null, busy: true }, { result: null, error: "Query denied" }, { result: null }]) {
      vi.mocked(useSqlRunner).mockReturnValue({ ...initial, ...state });
      const html = renderRunner(); expect(html).not.toContain('>32<'); expect(html).not.toContain('aria-label="Поля результата"');
      if (state.busy) expect(html).toContain("common.loading");
      if (state.error) expect(html).toContain('role="alert"');
    }
    vi.mocked(useSqlRunner).mockReturnValue({ ...initial, result: { ...result, rows: [] } });
    const html = renderRunner(); expect(html).toContain("Поля результата"); expect(html).toContain("По запросу нет строк.");
  });
  it("hides stale schema until the selected authorized table is ready", () => {
    const schema = { schema: { fields: [{ slug: "permitted", label: "Allowed field", type: "NUMBER", labels: {} }], relations: [] }, ready: true, loading: false, error: null, denied: false, retry: vi.fn() };
    const render = () => renderToStaticMarkup(<BuilderSourceFields tableSlug="events" menuId="allowed" language="en" />);
    vi.mocked(useDashboardSchema).mockReturnValue(schema as unknown as ReturnType<typeof useDashboardSchema>);
    expect(render()).toContain("Allowed field"); expect(render()).toContain("Поля таблицы"); expect(render()).not.toContain("Table fields");
    for (const state of [{ loading: true }, { ready: false }, { error: "Unavailable" }, { denied: true }]) {
      vi.mocked(useDashboardSchema).mockReturnValue({ ...schema, ...state } as unknown as ReturnType<typeof useDashboardSchema>);
      expect(render()).not.toContain("Allowed field");
    }
  });
  it("keeps advanced configuration available behind closed disclosures and does not mutate it", () => {
    const widget = { ...newChart(), tableSlug: "", filters: {}, answers: {}, kind: "stat" as const, sqlSuffix: "лет", sqlDetailField: "detail", appearance: { decimals: 1, valueSize: 24 } };
    const before = JSON.stringify(widget);
    const html = renderToStaticMarkup(<SqlWidgetOptions compact widget={widget} fields={[]} onChange={() => { throw Error("No writes during render"); }} />);
    expect(html).toContain("Все настройки виджета"); expect(html).not.toContain("<details open"); expect(html).toContain("Подпись из поля");
    expect(renderToStaticMarkup(<ChartAppearance compact widget={widget} onChange={() => {}} />)).toBe("");
    expect(JSON.stringify(widget)).toBe(before);
  });
});
