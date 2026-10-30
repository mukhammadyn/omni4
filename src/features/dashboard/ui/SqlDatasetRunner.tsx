import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontalIcon } from "lucide-react";
import { ChartCard, newChart, type ChartConfig } from "@/features/item";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import { Popover } from "@/shared/ui/popover";
import { Icon } from "@/shared/ui/icon";
import { builderFieldOption } from "./BuilderFieldOption";
import { useSqlRunner } from "../api/sql-runner";
import { useSqlCatalog } from "../api/sql-catalog";
import { presentFields, type FieldPresentation } from "../model/field-presentation";
import type { DatasetParameter } from "../model/datasets";
import { namedSqlParameters } from "../model/sql-assist";
import { sqlCopy } from "../model/sql-copy";
import { sqlSupportIssue } from "../model/sql-query-guidance";
import { hasQueryStatistic, labelQueryResult, queryChartRows, queryFields, visibleQueryColumns, type QueryResult } from "../model/query-result";
import { SQL_VISUALIZATIONS, type SqlPresentation } from "../model/sql-widget";
const noop = () => {};

export function SqlDatasetRunner({ menuId, sql, parameters, presentation, onPresentation, autoRun = false, hideResult = false, onResult, active = true, disabled = false, displayOnly = false, fieldPresentation, refreshInterval }: { refreshInterval?: number | undefined; fieldPresentation?: FieldPresentation | undefined; menuId: string; sql: string; parameters: DatasetParameter[]; presentation?: SqlPresentation | undefined; onPresentation?: ((next: SqlPresentation) => void) | undefined; autoRun?: boolean; hideResult?: boolean; onResult?: ((result: QueryResult | null) => void) | undefined; active?: boolean; disabled?: boolean; displayOnly?: boolean }) {
  const { t, i18n } = useTranslation(), copy = sqlCopy(i18n.language);
  const [values, setValues] = useState<Record<string, string>>({}), [limit, setLimit] = useState(autoRun && presentation?.type === "table" ? 1000 : 100);
  const names = namedSqlParameters(sql), catalog = useSqlCatalog(menuId, active);
  const effective: DatasetParameter[] = names.map((name) => parameters.find((parameter) => parameter.name === name) ?? { name, type: "text" as const, required: true });
  const runValues = Object.fromEntries(effective.flatMap((parameter) => Object.hasOwn(values, parameter.name) ? [[parameter.name, values[parameter.name]!]] : parameter.defaultValue !== undefined ? [[parameter.name, parameter.defaultValue]] : []));
  const runner = useSqlRunner(menuId, sql, effective, runValues, limit);
  const result = useMemo(() => runner.result ? labelQueryResult(runner.result, catalog.tables, i18n.language) : null, [runner.result, catalog.tables, i18n.language]);
  useEffect(() => { onResult?.(result); }, [result, onResult]);
  useEffect(() => { setValues({}); }, [runner.scopeKey]);
  const issue = sqlSupportIssue(sql), missing = effective.some((parameter) => !Object.hasOwn(runValues, parameter.name) || (parameter.type !== "text" && runValues[parameter.name] === ""));
  useEffect(() => { if (active && !disabled && autoRun && !missing && runner.enabled && !issue) { void runner.run(); } }, [active, disabled, autoRun, missing, runner.enabled, runner.run, issue]);
  useEffect(() => {
    if (!active || disabled || !autoRun || missing || !runner.enabled || issue || ![900000, 3600000, 86400000].includes(refreshInterval ?? 0)) return;
    const timer = setInterval(() => { void runner.run(); }, refreshInterval);
    return () => clearInterval(timer);
  }, [active, disabled, autoRun, missing, runner.enabled, runner.run, issue, refreshInterval]);
  if (displayOnly) return <div data-sql-saved-widget className="flex min-h-0 flex-1 flex-col">
    {runner.error || runner.gateError ? <div role="alert" className="text-sm text-danger"><span>{i18n.language.startsWith("ru") ? "Не удалось загрузить данные." : i18n.language.startsWith("uz") ? "Ma’lumot yuklanmadi." : "Could not load data."}</span><Button type="button" size="sm" variant="ghost" onClick={() => { void runner.run(); }}>{t("dashboard.refresh")}</Button></div> : !runner.enabled ? <p className="text-sm text-fg-muted">{t("dashboard.noWidgetAccess")}</p> : result ? <SqlResultView result={result} language={i18n.language} presentation={presentation} fieldPresentation={fieldPresentation} displayOnly /> : <p role="status" className="text-sm text-fg-muted">{runner.busy ? t("common.loading") : copy.empty}</p>}
  </div>;
  return <section aria-label={copy.title} className="flex min-w-0 flex-col gap-2">
    {issue && <p role="alert" className="text-sm text-danger">{copy.syntax[issue]}</p>}
    {effective.map((parameter) => <Field key={parameter.name} label={`:${parameter.name}`}><Input aria-label={`${copy.value}: ${parameter.name}`} type={parameter.type === "date" ? "date" : "text"} inputMode={parameter.type === "number" ? "decimal" : undefined} placeholder={parameter.type === "boolean" ? "true / false" : undefined} value={runValues[parameter.name] ?? ""} onChange={(event) => setValues({ ...values, [parameter.name]: event.target.value })} /></Field>)}
    <div className="flex flex-wrap items-end gap-2"><Button type="button" size="sm" disabled={disabled || !active || !runner.enabled || runner.checking || runner.busy || !sql.trim() || Boolean(issue) || missing || !Number.isInteger(limit) || limit < 1 || limit > runner.maxRows} onClick={() => { void runner.run(); }}>{copy.run}</Button>{runner.busy && <Button type="button" size="sm" variant="secondary" onClick={runner.cancel}>{copy.cancel}</Button>}<Popover trigger={({ toggle }) => <Button type="button" size="sm" variant="ghost" aria-label={copy.limit} onClick={toggle}><Icon as={SlidersHorizontalIcon} size={15} /></Button>}>{() => <div className="p-2"><Field label={copy.limit}><Input aria-label={copy.limit} type="number" min="1" max={runner.maxRows} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></Field></div>}</Popover></div>
    {runner.checking && <p role="status" className="text-xs text-fg-muted">{copy.checking}</p>}
    {missing && <p className="text-xs text-fg-muted">{copy.missing}</p>}
    {(runner.error || runner.gateError) && <p role="alert" className="text-sm text-danger">{runner.error || runner.gateError}</p>}
    {!hideResult && result && <SqlResultView result={result} language={i18n.language} presentation={presentation} onPresentation={onPresentation} fieldPresentation={fieldPresentation} />}
  </section>;
}

export function SqlResultView({ result, language, presentation, onPresentation, hidePicker = false, allowColumnSelection = !hidePicker, displayOnly = false, fieldPresentation }: { fieldPresentation?: FieldPresentation | undefined; result: QueryResult; language: string; presentation?: SqlPresentation | undefined; onPresentation?: ((next: SqlPresentation) => void) | undefined; hidePicker?: boolean; allowColumnSelection?: boolean; displayOnly?: boolean }) {
  const { t } = useTranslation(), copy = sqlCopy(language), fields = presentFields(queryFields(result), fieldPresentation);
  const dimensions = result.columns.filter((column) => !["int2", "int4", "int8", "numeric", "float4", "float8"].includes(column.type));
  const numbers = fields.filter((field) => field.type === "NUMBER");
  const [localView, setView] = useState<SqlPresentation>(presentation ?? { type: "table", kind: "bar", group: dimensions[0]?.key ?? "", value: numbers[0]?.slug ?? "", split: "" });
  const view = displayOnly || hidePicker || onPresentation ? presentation ?? localView : localView;
  const update = (patch: Partial<SqlPresentation>) => { const next = { ...view, ...patch }; setView(next); onPresentation?.(next); };
  const visible = visibleQueryColumns(result, view.columns).filter((column) => !fieldPresentation?.[column.key]?.hidden);
  let chartRows: ReturnType<typeof queryChartRows> = [], precision = false;
  try { chartRows = queryChartRows(result); } catch { precision = true; }
  const ready = (view.kind === "stat" || fields.some((field) => field.slug === view.group)) && numbers.some((field) => field.slug === view.value);
  const config: ChartConfig = { ...newChart(), kind: view.kind, groupSlug: view.group, valueSlug: view.value, splitSlug: view.split !== view.group && fields.some((field) => field.slug === view.split) ? view.split : "", aggregation: "sum", title: copy.title, ...(view.sorts ? { sorts: view.sorts } : {}), ...(view.showLegend !== undefined ? { showLegend: view.showLegend } : {}), ...(view.showGrid !== undefined ? { showGrid: view.showGrid } : {}), ...(view.stacked !== undefined ? { stacked: view.stacked } : {}) };
  const chart = precision ? <p role="alert" className="text-sm text-danger">{copy.precision}</p> : !ready ? <p className="text-sm text-fg-muted">{copy.chartHint}</p> : view.kind === "stat" && !hasQueryStatistic(result, view.value) ? <p role="status" className="text-sm text-fg-muted">{copy.empty}</p> : <div className="min-h-[220px]" aria-label={copy.chart}><ChartCard config={config} columns={fields} relations={[]} rows={chartRows} language={language} editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} hideHeader plain showRowCount={false} /></div>;
  if (displayOnly) return <div data-sql-result data-sql-readonly className="flex min-h-0 flex-1 flex-col">{view.type === "table" ? <SqlResultTable result={{ ...result, columns: visible }} language={language} fieldPresentation={fieldPresentation} /> : chart}</div>;
  return <div className="flex min-w-0 flex-col gap-3" data-sql-result>
    <div className="flex flex-wrap items-center gap-2">{!hidePicker && <><Button type="button" size="sm" variant="secondary" aria-pressed={view.type === "table"} onClick={() => update({ type: "table" })}>{copy.table}</Button><Button type="button" size="sm" variant="secondary" aria-pressed={view.type === "chart"} onClick={() => update({ type: "chart" })}>{copy.chart}</Button></>}<span role="status" className="text-xs text-fg-muted">{result.rows.length} {copy.returned}</span>{view.type === "table" && allowColumnSelection && <div className="ml-auto"><Popover align="end" trigger={({ toggle }) => <Button type="button" size="sm" variant="secondary" aria-label={t("dashboard.columns")} onClick={toggle}><Icon as={SlidersHorizontalIcon} size={14} />{t("dashboard.columns")}</Button>}>{() => <div className="flex max-h-64 flex-col gap-2 overflow-auto p-3">{result.columns.map((column) => { const checked = visible.some((item) => item.key === column.key); return <label key={column.key} className="flex items-center gap-2 text-sm"><Checkbox checked={checked} disabled={checked && visible.length === 1} onChange={() => update({ columns: checked ? visible.filter((item) => item.key !== column.key).map((item) => item.key) : result.columns.filter((item) => item.key === column.key || visible.some((selected) => selected.key === item.key)).map((item) => item.key) })} />{fieldPresentation?.[column.key]?.label || column.label || column.key}</label>; })}</div>}</Popover></div>}</div>
    {result.truncated && <p role="status" className="text-sm text-warning">{copy.truncated}</p>}
    {view.type === "table" ? <SqlResultTable result={{ ...result, columns: visible }} language={language} fieldPresentation={fieldPresentation} /> : <>
      {!hidePicker && <div className="grid gap-2 sm:grid-cols-3"><Field label={copy.chart}><Dropdown ariaLabel={copy.chart} value={view.kind} items={SQL_VISUALIZATIONS.filter((kind) => kind !== "records").map((kind) => ({ value: kind, label: t(`chart.kind.${kind}`) }))} onChange={(kind) => update({ kind: kind as SqlPresentation["kind"] })} /></Field><Field label={copy.group}><Dropdown ariaLabel={copy.group} value={view.group} items={fields.map((field) => builderFieldOption(field, language))} onChange={(group) => update({ group })} /></Field><Field label={copy.measure}><Dropdown ariaLabel={copy.measure} value={view.value} items={numbers.map((field) => builderFieldOption(field, language))} onChange={(value) => update({ value })} /></Field></div>}
      {chart}
    </>}
  </div>;
}

function SqlResultTable({ result, language, fieldPresentation }: { fieldPresentation?: FieldPresentation | undefined; result: QueryResult; language: string }) {
  const copy = sqlCopy(language), [page, setPage] = useState(1), pages = Math.max(1, Math.ceil(result.rows.length / 50)), currentPage = Math.min(page, pages);
  return <><div className="max-h-[320px] min-w-0 overflow-auto"><table aria-label={copy.title} className="w-full border-collapse text-sm"><thead><tr>{result.columns.map((column) => <th key={column.key} scope="col" className="sticky top-0 border-b border-border bg-surface-soft px-3 py-2 text-left font-medium">{fieldPresentation?.[column.key]?.label || column.label || column.key}</th>)}</tr></thead><tbody>{result.rows.slice((currentPage - 1) * 50, currentPage * 50).map((row, index) => <tr key={index} className="hover:bg-surface-hover">{result.columns.map((column) => <td key={column.key} className="border-b border-border px-3 py-2">{row[column.key] === null ? "—" : String(row[column.key])}</td>)}</tr>)}{!result.rows.length && <tr><td colSpan={result.columns.length} className="p-4 text-fg-muted">{copy.empty}</td></tr>}</tbody></table></div>{pages > 1 && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" type="button" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>←</Button><span>{currentPage} / {pages}</span><Button size="sm" type="button" variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>→</Button></div>}</>;
}
