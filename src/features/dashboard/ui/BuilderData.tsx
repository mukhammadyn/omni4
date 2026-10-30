import { useEffect, useState } from "react";
import { ChevronDownIcon, Table2Icon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMenuTree } from "@/features/sidebar";
import { builderPreviewLimit } from "../model/builder-preview";
import { groupBuilderSources } from "../model/builder-sources";
import { Cell } from "@/features/item";
import { useTablePermissions } from "@/features/auth";
import { localized, useTables, type Field } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import type { Dataset, DatasetParameter } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import type { DashFilter, FilterValues } from "../model/filters";
import { namedSqlParameters } from "../model/sql-assist";
import { useWidgetData } from "../api/widget-data";
import { WidgetStatus } from "./WidgetContents";


export function BuilderSources({ value, language, onPick, active = true }: { value: string; language: string; onPick: (slug: string) => void; active?: boolean }) {
  const { t } = useTranslation(); const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchCollapsed, setSearchCollapsed] = useState<{ query: string; groups: Record<string, boolean> }>({ query: "", groups: {} });
  const toggleGroup = (id: string) => {
    if (search.trim()) setSearchCollapsed((current) => ({ query: search, groups: { ...(current.query === search ? current.groups : {}), [id]: current.query === search ? !current.groups[id] : true } }));
    else setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  };
  const tables = useTables("", active), menus = useMenuTree(active), permissionOf = useTablePermissions();
  // The collection endpoint searches labels only. Search the complete paginated catalog
  // locally so technical keys beyond page one remain discoverable.
  useEffect(() => { if (active && search.trim() && tables.hasMore && !tables.isLoading) tables.loadMore(); }, [active, search, tables]);
  const groups = groupBuilderSources(tables.items, menus.items, (slug) => permissionOf(slug).read, search, language, language.startsWith("ru") ? "Общие" : "General");
  return <div className="space-y-3">
    <label className="flex items-center gap-2 rounded-md border border-border-strong bg-input px-3"><Icon as={SearchIcon} size={15} className="text-fg-subtle" /><input className="min-w-0 w-full bg-transparent py-2 text-sm outline-none" aria-label={t("menuForm.tableSearch")} placeholder={language.startsWith("ru") ? "Название или ключ таблицы" : "Table name or key"} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {groups.map((group) => { const open = search.trim() ? searchCollapsed.query !== search || !searchCollapsed.groups[group.id] : !collapsed[group.id]; return <section key={group.id} className="overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={open} aria-controls={`builder-sources-${group.id}`} onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-2 bg-surface-soft px-3 py-2.5 text-left text-sm font-medium"><Icon as={ChevronDownIcon} size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />{group.label}<span className="ml-auto text-xs font-normal text-fg-muted">{group.tables.length}</span></button>
      <div id={`builder-sources-${group.id}`} hidden={!open}><div className="grid gap-2 p-3 sm:grid-cols-3" role="group" aria-label={group.label}>{group.tables.map((table) => <button key={table.slug} type="button" aria-pressed={value === table.slug} onClick={() => onPick(table.slug)} className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 text-left transition-colors ${value === table.slug ? "border-accent bg-accent-subtle ring-1 ring-accent" : "border-border hover:bg-surface-hover"}`}><Icon as={Table2Icon} size={16} className="mt-0.5 shrink-0 text-fg-muted" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{localized(table.labels, language, table.label)}</strong><code className="mt-1 block truncate text-xs text-fg-muted" title={table.slug}>{table.slug}</code><span className="mt-2 inline-flex max-w-full truncate rounded bg-surface-hover px-1.5 py-0.5 text-2xs text-fg-muted">{group.label}</span></span><span className={`mt-1 size-3 shrink-0 rounded-full border ${value === table.slug ? "border-4 border-accent" : "border-border-strong"}`} /></button>)}</div></div>
    </section>; })}
    {(tables.isLoading || menus.isLoading) && <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>}
    {!groups.length && !tables.isLoading && <p role="status" className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-fg-muted">{language.startsWith("ru") ? "Таблицы не найдены. Попробуйте другое название или ключ." : "No tables found. Try another name or technical key."}</p>}
    {tables.hasMore && !search.trim() && <Button variant="secondary" disabled={tables.isLoading} onClick={tables.loadMore}>{t("action.more", { defaultValue: "…" })}</Button>}
  </div>;
}
export function BuilderParameters({ dataset, onChange, language }: { dataset: Dataset; onChange: (dataset: Dataset) => void; language: string }) {
  const { t } = useTranslation(); const ru = language.startsWith("ru");
  if (dataset.source.kind !== "sql") return null;
  const source = dataset.source, names = namedSqlParameters(source.sql);
  return <div className="space-y-5"><h2 className="text-lg font-semibold">{ru ? "Параметры" : "Parameters"}</h2><p className="text-sm leading-relaxed text-fg-muted">{ru ? "Именованные параметры SQL-запроса. Используйте :имя в запросе. Типы и значения по умолчанию сохраняются с SQL. Значения для отдельного запуска можно изменить ниже." : "Use :name in the SQL query. Types and defaults are saved with SQL. Override values for a single run below."}</p><div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="text-fg-muted"><tr><th className="border-b border-border p-3 font-normal">{ru ? "Имя параметра" : "Parameter name"}</th><th className="border-b border-border p-3 font-normal">{t("dashboard.parameterType")}</th><th className="border-b border-border p-3 font-normal">{ru ? "Значение по умолчанию" : "Default value"}</th><th className="border-b border-border p-3 font-normal">SQL</th></tr></thead><tbody>{names.map((name) => <tr key={name} className="border-b border-border"><td className="p-3 font-mono">:{name}</td><td className="p-3"><Dropdown ariaLabel={`${t("dashboard.parameterType")}: ${name}`} value={source.parameters.find((p) => p.name === name)?.type ?? "text"} items={["text", "number", "date", "boolean"].map((type) => ({ value: type, label: type }))} onChange={(type) => onChange({ ...dataset, source: { ...source, parameters: [...source.parameters.filter((p) => p.name !== name), { ...source.parameters.find((p) => p.name === name), name, type: type as DatasetParameter["type"], required: true }] } })} /></td><td className="p-3"><Input aria-label={`${ru ? "По умолчанию" : "Default"}: ${name}`} value={source.parameters.find((p) => p.name === name)?.defaultValue ?? ""} onChange={(event) => onChange({ ...dataset, source: { ...source, parameters: source.parameters.map((p) => p.name === name ? { ...p, defaultValue: event.target.value } : p) } })} /></td><td className="p-3 text-fg-muted">:{name}</td></tr>)}</tbody></table></div>{!names.length && <p className="text-sm text-fg-muted">{ru ? "Добавьте :параметр в SQL-запрос, чтобы настроить его тип." : "Add a :parameter to the SQL query to configure its type."}</p>}</div>;
}
export function BuilderRowsPreview({ widget, fields, filters, values, menuId, datasets, language, limit = 10 }: { limit?: number; widget: Widget; fields: Field[]; filters: DashFilter[]; values: FilterValues; menuId: string; datasets: Dataset[]; language: string }) {
  const { t, i18n } = useTranslation();
  const sorts = (widget.sorts ?? []).filter((sort) => !widget.calculatedFields?.some((field) => field.slug === sort.field));
  const records: Widget = { ...widget, sorts, type: "records", columns: fields.filter((field) => !widget.fieldPresentation?.[field.slug]?.hidden).map((field) => field.slug), pageSize: builderPreviewLimit(limit) };
  const data = useWidgetData(records, filters, values, menuId, {}, 1, sorts, datasets);
  const columns = data.schema.fields.filter((field) => records.columns?.includes(field.slug));
  const relations = new Map(data.schema.relations.map((relation) => [relation.id, relation]));
  const currencyVisible = columns.some((field) => field.slug === "currency");
  let status;
  if (!widget.tableSlug && !widget.datasetId) status = <p className="text-sm text-fg-muted">{t("dashboard.pickTableFirst")}</p>;
  else if (data.denied || data.forbidden) status = <p className="text-sm text-fg-muted">{t("dashboard.noWidgetAccess")}</p>;
  else if (data.error) status = <p role="alert" className="text-sm text-danger">{t(data.error as "dashboard.filterConflict", { defaultValue: data.error })}<button type="button" className="ml-2 underline" onClick={data.refetch}>{t("dashboard.refresh")}</button></p>;
  else if (data.loading || !data.ready) status = <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>;
  else if (!columns.length) status = <p className="text-sm text-fg-muted">{language.startsWith("ru") ? "Нет видимых полей" : "No visible fields"}</p>;
  return <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
    {status ? <div className="p-2">{status}</div> : <>
      <div className="sr-only"><WidgetStatus widget={records} data={data} compact /></div>
      <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={language.startsWith("ru") ? "Результат источника" : "Source results"} tabIndex={0}>
        <table className="w-full border-collapse text-left text-sm"><thead className="sticky top-0 z-1 bg-surface text-fg-muted"><tr>{columns.map((field) => <th scope="col" key={field.slug} className="min-w-32 border-b border-border px-2 py-1.5 font-normal">{localized(field.labels, language, field.label)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={String(row.guid ?? index)} className="hover:bg-surface-hover">{columns.map((field) => <td key={field.slug} className="border-b border-border px-2 py-1.5"><div className="flex max-w-64 items-center gap-1 overflow-hidden"><Cell field={field} row={row} tableSlug={widget.tableSlug} relations={relations} locale={i18n.language} language={language} />{(field.type === "MONEY" || /amount|salary|price|cost/i.test(field.slug)) && currencyVisible && row.currency !== undefined && <small className="shrink-0 text-fg-muted">{String(row.currency)}</small>}</div></td>)}</tr>)}{!data.rows.length && <tr><td colSpan={columns.length} className="p-4 text-center text-fg-muted">{t("sql.noRows")}</td></tr>}</tbody>
        </table>
      </div>
    </>}
  </div>;
}
