import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { localized, useTables, type Field } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Dropdown } from "@/shared/ui/dropdown";
import type { Dataset, DatasetParameter } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import type { DashFilter, FilterValues } from "../model/filters";
import { namedSqlParameters } from "../model/sql-assist";
import { useWidgetData } from "../api/widget-data";
import { WidgetContents, WidgetStatus } from "./WidgetContents";


export function BuilderSources({ value, language, onPick }: { value: string; language: string; onPick: (slug: string) => void }) {
  const { t } = useTranslation(); const [search, setSearch] = useState("");
  const tables = useTables(search), permissionOf = useTablePermissions();
  return <div className="space-y-3"><label className="flex max-w-sm items-center gap-2 rounded-md border border-border px-3"><Icon as={SearchIcon} size={15} /><input className="min-w-0 w-full bg-transparent py-2 text-sm" aria-label={t("menuForm.tableSearch")} placeholder={t("menuForm.tableSearch")} value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={t("menuForm.table")}>{tables.items.filter((table) => permissionOf(table.slug).read).map((table) => <button key={table.slug} type="button" aria-pressed={value === table.slug} onClick={() => onPick(table.slug)} className={`flex items-start gap-2 rounded-lg border p-3 text-left ${value === table.slug ? "border-accent bg-accent-subtle ring-1 ring-accent" : "border-border hover:bg-surface-hover"}`}><span className={`mt-1 size-3 shrink-0 rounded-full border ${value === table.slug ? "border-4 border-accent" : "border-border"}`} /><span className="min-w-0"><strong className="block truncate text-sm font-semibold">{localized(table.labels, language, table.label)}</strong><code className="mt-1 block truncate text-xs text-fg-muted">{table.slug}</code></span></button>)}</div>{tables.isLoading && <p role="status">{t("common.loading")}</p>}{tables.hasMore && <Button variant="secondary" onClick={tables.loadMore}>{t("action.more", { defaultValue: "…" })}</Button>}</div>;
}
export function BuilderParameters({ dataset, onChange, language }: { dataset: Dataset; onChange: (dataset: Dataset) => void; language: string }) {
  const { t } = useTranslation(); const ru = language.startsWith("ru");
  if (dataset.source.kind !== "sql") return null;
  const source = dataset.source, names = namedSqlParameters(source.sql);
  return <div className="space-y-5"><h2 className="text-lg font-semibold">{ru ? "Параметры" : "Parameters"}</h2><p className="text-sm leading-relaxed text-fg-muted">{ru ? "Именованные параметры SQL-запроса. Используйте :имя в запросе. Типы сохраняются с SQL; значения для запуска задаются ниже и остаются в текущей сессии." : "Use :name in the SQL query. Types are saved with SQL; run values below remain in this session."}</p><div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="text-fg-muted"><tr><th className="border-b border-border p-3 font-normal">{ru ? "Имя параметра" : "Parameter name"}</th><th className="border-b border-border p-3 font-normal">{t("dashboard.parameterType")}</th><th className="border-b border-border p-3 font-normal">SQL</th></tr></thead><tbody>{names.map((name) => <tr key={name} className="border-b border-border"><td className="p-3 font-mono">:{name}</td><td className="p-3"><Dropdown ariaLabel={`${t("dashboard.parameterType")}: ${name}`} value={source.parameters.find((p) => p.name === name)?.type ?? "text"} items={["text", "number", "date", "boolean"].map((type) => ({ value: type, label: type }))} onChange={(type) => onChange({ ...dataset, source: { ...source, parameters: [...source.parameters.filter((p) => p.name !== name), { name, type: type as DatasetParameter["type"], required: true }] } })} /></td><td className="p-3 text-fg-muted">:{name}</td></tr>)}</tbody></table></div>{!names.length && <p className="text-sm text-fg-muted">{ru ? "Добавьте :параметр в SQL-запрос, чтобы настроить его тип." : "Add a :parameter to the SQL query to configure its type."}</p>}</div>;
}
export function BuilderRowsPreview({ widget, fields, filters, values, menuId, datasets, language }: { widget: Widget; fields: Field[]; filters: DashFilter[]; values: FilterValues; menuId: string; datasets: Dataset[]; language: string }) {
  const [page, setPage] = useState(1);
  const records: Widget = { ...widget, type: "records", columns: fields.map((field) => field.slug), pageSize: 10 };
  const data = useWidgetData(records, filters, values, menuId, {}, page, widget.sorts ?? [], datasets);
  return <div className="min-h-0 overflow-auto p-3"><WidgetStatus widget={records} data={data} compact /><WidgetContents widget={records} data={data} language={language} page={page} sorts={widget.sorts ?? []} onPage={setPage} /></div>;
}
