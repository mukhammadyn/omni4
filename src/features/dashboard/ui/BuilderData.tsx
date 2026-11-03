import { SqlParameterOptions } from "./SqlParameterOptions";
import { useState, type ReactNode } from "react";
import { ChevronDownIcon, Table2Icon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMenuTree } from "@/features/sidebar";
import { builderPreviewLimit } from "../model/builder-preview";
import { groupBuilderSources } from "../model/builder-sources";
import { Cell } from "@/features/item";
import { useTablePermissions } from "@/features/auth";
import { localized, useTableCatalog, type Field } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field as InputField, Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import { updateSqlParameter, type Dataset, type DatasetParameter } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import type { DashFilter, FilterValues } from "../model/filters";
import { namedSqlParameters } from "../model/sql-assist";
import { useWidgetData } from "../api/widget-data";
import { WidgetStatus } from "./WidgetContents";


export function BuilderSources({ value, language, onPick, active = true, compact = false }: { compact?: boolean; value: string; language: string; onPick: (slug: string) => void; active?: boolean }) {
  const { t, i18n } = useTranslation(); const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchCollapsed, setSearchCollapsed] = useState<{ query: string; groups: Record<string, boolean> }>({ query: "", groups: {} });
  const toggleGroup = (id: string) => {
    if (search.trim()) setSearchCollapsed((current) => ({ query: search, groups: { ...(current.query === search ? current.groups : {}), [id]: current.query === search ? !current.groups[id] : true } }));
    else setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  };
  const tables = useTableCatalog(active), menus = useMenuTree(active), permissionOf = useTablePermissions();
  const groups = groupBuilderSources(tables.items, menus.items, (slug) => permissionOf(slug).read, search, language, i18n.language.startsWith("ru") ? "Общие" : "General");
  return <nav aria-label={i18n.language.startsWith("ru") ? "Таблицы источника" : "Source tables"} className={`flex min-h-0 flex-1 flex-col gap-2 ${compact ? "builder-source-menu-compact" : ""}`}>
    <label className="flex shrink-0 items-center gap-2 rounded-md border border-border-strong bg-input px-2"><Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" /><input className="min-w-0 w-full bg-transparent py-2 text-sm outline-none" aria-label={t("menuForm.tableSearch")} placeholder={i18n.language.startsWith("ru") ? "Название или ключ таблицы" : "Table name or key"} value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div data-builder-table-list className="min-h-0 flex-1 overflow-auto">
      {groups.map(group => { const open = search.trim() ? searchCollapsed.query !== search || !searchCollapsed.groups[group.id] : !collapsed[group.id]; return <section key={group.id} className="mb-2">
        <button type="button" aria-expanded={open} aria-controls={`builder-sources-${group.id}`} onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-left text-xs font-semibold text-fg-muted hover:bg-surface-hover"><Icon as={ChevronDownIcon} size={12} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />{group.label}<span className="ml-auto text-2xs font-normal">{group.tables.length}</span></button>
        <div id={`builder-sources-${group.id}`} hidden={!open} role="group" aria-label={group.label} className="space-y-0.5">{group.tables.map(table => <button type="button" key={table.slug} aria-pressed={value === table.slug} onClick={() => onPick(table.slug)} title={`${localized(table.labels, language, table.label)} · ${table.slug}`} className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${value === table.slug ? "bg-accent-subtle text-accent-text" : "text-fg hover:bg-surface-hover"}`}><Icon as={Table2Icon} size={14} className="shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate">{localized(table.labels, language, table.label)}</span><code className="block truncate text-2xs text-fg-muted">{table.slug}</code></span></button>)}</div>
      </section>; })}
      {(tables.isLoading || menus.isLoading) && <p role="status" className="p-2 text-sm text-fg-muted">{t("common.loading")}</p>}
      {!groups.length && !tables.isLoading && !tables.error && <p role="status" className="p-2 text-sm text-fg-muted">{i18n.language.startsWith("ru") ? "Таблицы не найдены. Попробуйте другое название или ключ." : "No tables found. Try another name or technical key."}</p>}
      {tables.error && <div role="alert" className="space-y-2 p-2 text-sm"><p>{i18n.language.startsWith("ru") ? "Не удалось загрузить весь список таблиц." : "Could not load the complete table catalog."}</p><Button variant="secondary" disabled={tables.isLoading} onClick={tables.retry}>{i18n.language.startsWith("ru") ? "Повторить" : "Retry"}</Button></div>}
    </div>
  </nav>;
}
export function BuilderParameters({ dataset, onChange, language, values, onValueChange, sharedNames = [] }: { dataset: Dataset; onChange: (dataset: Dataset) => void; language: string; values?: Record<string, string>; onValueChange?: (name: string, value: string) => void; sharedNames?: string[] }) {
  const ru = language.startsWith("ru");
  if (dataset.source.kind !== "sql") return null;
  const source = dataset.source, names = namedSqlParameters(source.sql);
  const put = (parameter: DatasetParameter) => onChange(updateSqlParameter(dataset, parameter));
  return <section className="space-y-3" aria-label={ru ? "Параметры" : "Parameters"}>
    {names.length > 0 && <h2 className="text-sm font-semibold">{ru ? "Параметры" : "Parameters"}</h2>}
    {names.map(name => { const p = source.parameters.find(p => p.name === name) ?? { name, type: "text" as const, required: true }; const shared = sharedNames.includes(name);
      return <div key={name} className="rounded-lg border border-border p-3 space-y-2">
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
          <div className="col-span-2 min-w-0 sm:col-span-1"><span className="block text-xs text-fg-muted">{ru ? "Имя" : "Name"}</span><code className="block break-all py-2 text-sm">{p.controlLabel || name}</code>{p.controlLabel && <span className="text-xs text-fg-muted">:{name}</span>}</div>
          <InputField label={ru ? "Тип" : "Type"}><Dropdown ariaLabel={`${ru ? "Тип" : "Type"}: ${name}`} value={p.type} items={["text", "number", "date", "boolean"].map((type, index) => ({ value: type, label: (ru ? ["Текст", "Число", "Дата", "Да / нет"] : ["Text", "Number", "Date", "Yes / no"])[index]! }))} onChange={type => put({ ...p, type: type as DatasetParameter["type"] })} /></InputField>
          <InputField label={ru ? "Значение" : "Value"}><Input aria-label={`${ru ? "Значение" : "Value"}: ${name}`} type={p.type === "date" ? "date" : "text"} inputMode={p.type === "number" ? "decimal" : undefined} placeholder={p.type === "boolean" ? "true / false" : undefined} readOnly={shared} value={values?.[name] ?? p.defaultValue ?? ""} onChange={e => { put({ ...p, defaultValue: e.target.value }); onValueChange?.(name, e.target.value); }} /></InputField>
        </div>
        {shared && <p className="text-xs text-fg-muted">{ru ? "Значение из фильтра дашборда" : "Value from the dashboard filter"}</p>}
        <details><summary className="cursor-pointer text-xs text-fg-muted">{ru ? "Настройки параметра" : "Parameter settings"}</summary><div className="mt-3 space-y-3">
          {onValueChange && shared && <InputField label={ru ? "Значение по умолчанию" : "Default value"}><Input aria-label={`${ru ? "По умолчанию" : "Default"}: ${name}`} type={p.type === "date" ? "date" : "text"} value={p.defaultValue ?? ""} onChange={e => put({ ...p, defaultValue: e.target.value })} /></InputField>}
          <SqlParameterOptions ru={ru} parameter={p} onChange={put} />
        </div></details>
      </div>;
    })}
    {!names.length && <p className="text-sm text-fg-muted">{ru ? "Нет параметров. Для параметра добавьте :имя в SQL." : "No parameters. Add :name to SQL to use one."}</p>}
  </section>;
}
export function BuilderRowsPreview({ widget, fields, filters, values, menuId, datasets, language, limit = 10, page = 1, onPage, showTypes = false, toolbar }: { toolbar?: (refresh: () => void) => ReactNode; limit?: number; page?: number; onPage?: (page: number) => void; showTypes?: boolean; widget: Widget; fields: Field[]; filters: DashFilter[]; values: FilterValues; menuId: string; datasets: Dataset[]; language: string }) {
  const { t, i18n } = useTranslation();
  const sorts = (widget.sorts ?? []).filter((sort) => !widget.calculatedFields?.some((field) => field.slug === sort.field));
  const records: Widget = { ...widget, sorts, type: "records", columns: fields.filter((field) => !widget.fieldPresentation?.[field.slug]?.hidden).map((field) => field.slug), pageSize: builderPreviewLimit(limit) };
  const data = useWidgetData(records, filters, values, menuId, {}, page, sorts, datasets);
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
    {toolbar && <div className="-mx-4">{toolbar(data.refetch)}</div>}
    {status ? <div className="p-2">{status}</div> : <>
      <div className="sr-only"><WidgetStatus widget={records} data={data} compact /></div>
      <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={language.startsWith("ru") ? "Результат источника" : "Source results"} tabIndex={0}>
        <table className="w-full border-collapse text-left text-sm"><thead className="sticky top-0 z-1 bg-surface text-fg-muted"><tr>{showTypes && <th scope="col" className="w-10 border-b border-border px-2 py-1.5 font-normal">#</th>}{columns.map((field) => <th scope="col" key={field.slug} className="min-w-32 border-b border-border px-2 py-1.5 font-normal">{localized(field.labels, language, field.label)}{showTypes && <code className="block text-2xs font-normal text-fg-subtle">{field.type}</code>}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={String(row.guid ?? index)} className="hover:bg-surface-hover">{showTypes && <td className="border-b border-border px-2 py-1.5 text-xs text-fg-subtle">{(page - 1) * records.pageSize! + index + 1}</td>}{columns.map((field) => <td key={field.slug} className="border-b border-border px-2 py-1.5"><div className="flex max-w-64 items-center gap-1 overflow-hidden"><Cell field={field} row={row} tableSlug={widget.tableSlug} relations={relations} locale={i18n.language} language={language} />{(field.type === "MONEY" || /amount|salary|price|cost/i.test(field.slug)) && currencyVisible && row.currency !== undefined && <small className="shrink-0 text-fg-muted">{String(row.currency)}</small>}</div></td>)}</tr>)}{!data.rows.length && <tr><td colSpan={columns.length + (showTypes ? 1 : 0)} className="p-4 text-center text-fg-muted">{t("sql.noRows")}</td></tr>}</tbody>
        </table>
      </div>
      {onPage && <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-fg-muted">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{i18n.language.startsWith("ru") ? "Назад" : "Previous"}</Button>
        <span role="status">{data.count ? `${(page - 1) * records.pageSize! + 1}–${Math.min(page * records.pageSize!, data.count)} / ${data.count.toLocaleString(i18n.language)}` : "0"}</span>
        <Button size="sm" variant="secondary" disabled={page * records.pageSize! >= data.count} onClick={() => onPage(page + 1)}>{i18n.language.startsWith("ru") ? "Далее" : "Next"}</Button>
        <span className="ml-auto">{i18n.language.startsWith("ru") ? "Страница" : "Page"} {page} / {Math.max(1, Math.ceil(data.count / records.pageSize!))}</span>
      </footer>}
    </>}
  </div>;
}
