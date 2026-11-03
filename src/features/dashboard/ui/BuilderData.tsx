import { SqlParameterOptions } from "./SqlParameterOptions";
import { useState } from "react";
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
import { useDashboardSchema } from "../api/schema";
import { useWidgetData } from "../api/widget-data";
import { WidgetStatus } from "./WidgetContents";


export function BuilderSources({ value, language, onPick, active = true, compactSelection = false }: { compactSelection?: boolean; value: string; language: string; onPick: (slug: string) => void; active?: boolean }) {
  const { t } = useTranslation(); const [search, setSearch] = useState(""); const [choosing, setChoosing] = useState(!value);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchCollapsed, setSearchCollapsed] = useState<{ query: string; groups: Record<string, boolean> }>({ query: "", groups: {} });
  const toggleGroup = (id: string) => {
    if (search.trim()) setSearchCollapsed((current) => ({ query: search, groups: { ...(current.query === search ? current.groups : {}), [id]: current.query === search ? !current.groups[id] : true } }));
    else setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  };
  const tables = useTableCatalog(active), menus = useMenuTree(active), permissionOf = useTablePermissions();
  const groups = groupBuilderSources(tables.items, menus.items, (slug) => permissionOf(slug).read, search, language, language.startsWith("ru") ? "Общие" : "General");
  const selectedTable = permissionOf(value).read ? tables.items.find(table => table.slug === value) : undefined;
  if (compactSelection && selectedTable && !choosing && !tables.error) return <div className="flex items-center gap-3 rounded-lg border border-border p-3"><Icon as={Table2Icon} size={16} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{localized(selectedTable.labels, language, selectedTable.label)}</strong><code className="text-xs text-fg-muted">{value}</code></div><Button variant="secondary" size="sm" onClick={() => setChoosing(true)}>{language.startsWith("ru") ? "Сменить таблицу" : "Change table"}</Button></div>;
  return <div className="space-y-3">
    <label className="flex items-center gap-2 rounded-md border border-border-strong bg-input px-3"><Icon as={SearchIcon} size={15} className="text-fg-subtle" /><input className="min-w-0 w-full bg-transparent py-2 text-sm outline-none" aria-label={t("menuForm.tableSearch")} placeholder={language.startsWith("ru") ? "Название или ключ таблицы" : "Table name or key"} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {groups.map((group) => { const open = search.trim() ? searchCollapsed.query !== search || !searchCollapsed.groups[group.id] : !collapsed[group.id]; return <section key={group.id} className="overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={open} aria-controls={`builder-sources-${group.id}`} onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-2 bg-surface-soft px-3 py-2.5 text-left text-sm font-medium"><Icon as={ChevronDownIcon} size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />{group.label}<span className="ml-auto text-xs font-normal text-fg-muted">{group.tables.length}</span></button>
      <div id={`builder-sources-${group.id}`} hidden={!open}><div className="grid gap-2 p-3 sm:grid-cols-3" role="group" aria-label={group.label}>{group.tables.map((table) => <button key={table.slug} type="button" aria-pressed={value === table.slug} onClick={() => { onPick(table.slug); setChoosing(false); }} className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 text-left transition-colors ${value === table.slug ? "border-accent bg-accent-subtle ring-1 ring-accent" : "border-border hover:bg-surface-hover"}`}><Icon as={Table2Icon} size={16} className="mt-0.5 shrink-0 text-fg-muted" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{localized(table.labels, language, table.label)}</strong><code className="mt-1 block truncate text-xs text-fg-muted" title={table.slug}>{table.slug}</code><span className="mt-2 inline-flex max-w-full truncate rounded bg-surface-hover px-1.5 py-0.5 text-2xs text-fg-muted">{group.label}</span></span><span className={`mt-1 size-3 shrink-0 rounded-full border ${value === table.slug ? "border-4 border-accent" : "border-border-strong"}`} /></button>)}</div></div>
    </section>; })}
    {(tables.isLoading || menus.isLoading) && <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>}
    {!groups.length && !tables.isLoading && !tables.error && <p role="status" className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-fg-muted">{language.startsWith("ru") ? "Таблицы не найдены. Попробуйте другое название или ключ." : "No tables found. Try another name or technical key."}</p>}
    {tables.error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"><p>{language.startsWith("ru") ? "Не удалось загрузить весь список таблиц." : "Could not load the complete table catalog."}</p><Button variant="secondary" disabled={tables.isLoading} onClick={tables.retry}>{language.startsWith("ru") ? "Повторить" : "Retry"}</Button></div>}
  </div>;
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

/** Only the selected table’s authorized schema; query-key changes hide stale fields. */
export function BuilderSourceFields({ tableSlug, menuId, language }: { tableSlug: string; menuId: string; language: string }) {
  const { t } = useTranslation(), data = useDashboardSchema(tableSlug || undefined, menuId);
  if (!tableSlug) return null;
  return <section aria-label={language.startsWith("ru") ? "Поля таблицы" : "Table fields"} className="space-y-3 border-t border-border pt-4">
    <h3 className="text-sm font-semibold">{language.startsWith("ru") ? "Поля таблицы" : "Table fields"}</h3>
    {data.denied ? <p>{t("dashboard.noWidgetAccess")}</p> : data.error ? <p role="alert" className="text-sm text-danger">{data.error}<Button variant="secondary" onClick={data.retry}>{t("dashboard.refresh")}</Button></p> : data.loading || !data.ready ? <p role="status">{t("common.loading")}</p> : data.schema.fields.length ? <div className="grid gap-2 sm:grid-cols-2">{data.schema.fields.map(field => <div key={field.slug} className="min-w-0 rounded border border-border p-2 text-sm"><strong className="block break-words font-medium">{localized(field.labels, language, field.label)}</strong><span className="block break-all text-xs text-fg-muted">{field.slug} · {field.type}</span></div>)}</div> : <p role="status">{language.startsWith("ru") ? "Нет доступных полей" : "No accessible fields"}</p>}
  </section>;
}
