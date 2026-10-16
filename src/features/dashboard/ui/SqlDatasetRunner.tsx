import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard, newChart, type ChartConfig } from "@/features/item";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import { useSqlRunner } from "../api/sql-runner";
import type { DatasetParameter } from "../model/datasets";
import { namedSqlParameters } from "../model/sql-assist";
import { sqlCopy } from "../model/sql-copy";
import { sqlSupportIssue } from "../model/sql-query-guidance";
import { queryChartRows, queryFields, type QueryResult } from "../model/query-result";

import type { SqlPresentation } from "../model/sql-widget";
const noop = () => {};

export function SqlDatasetRunner({ menuId, sql, parameters, presentation, onPresentation, autoRun = false, hideResult = false, onResult }: { menuId: string; sql: string; parameters: DatasetParameter[]; presentation?: SqlPresentation | undefined; onPresentation?: ((next: SqlPresentation) => void) | undefined; autoRun?: boolean; hideResult?: boolean; onResult?: ((result: QueryResult | null) => void) | undefined }) {
  const { i18n } = useTranslation(); const copy = sqlCopy(i18n.language);
  const [values, setValues] = useState<Record<string, string>>({}), [limit, setLimit] = useState(100);
  const names = namedSqlParameters(sql);
  const effective = names.map((name) => parameters.find((parameter) => parameter.name === name) ?? { name, type: "text" as const, required: true });
  const runner = useSqlRunner(menuId, sql, effective, values, limit);
  useEffect(() => { onResult?.(runner.result); }, [runner.result, onResult]);
  useEffect(()=>{setValues({});},[runner.scopeKey]);
  const issue = sqlSupportIssue(sql), missing = effective.some((parameter) => !Object.hasOwn(values, parameter.name) || (parameter.type !== "text" && values[parameter.name] === ""));
  useEffect(() => { if (autoRun && !effective.length && runner.enabled && !issue) { void runner.run(); } }, [autoRun, effective.length, runner.enabled, runner.run, issue]);
  return <section aria-label={copy.title} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
    <p className="text-xs text-fg-muted">{copy.supported}</p>
    {issue && <p role="alert" className="text-sm text-danger">{copy.syntax[issue]}</p>}
    {effective.map((parameter) => <Field key={parameter.name} label={`:${parameter.name} · ${parameter.type}`}><Input aria-label={`${copy.value}: ${parameter.name}`} type={parameter.type === "date" ? "date" : "text"} inputMode={parameter.type === "number" ? "decimal" : undefined} placeholder={parameter.type === "boolean" ? "true / false" : undefined} value={Object.hasOwn(values, parameter.name) ? values[parameter.name] ?? "" : ""} onChange={(event) => setValues({ ...values, [parameter.name]: event.target.value })} /></Field>)}
    <div className="flex flex-wrap items-end gap-2">
      <details className="rounded-md border border-border px-2 py-1"><summary className="cursor-pointer text-xs text-fg-muted">{i18n.language.startsWith("ru") ? "Дополнительно" : i18n.language.startsWith("uz") ? "Qo‘shimcha" : "Advanced"}</summary><Field label={copy.limit}><Input aria-label={copy.limit} type="number" min="1" max={runner.maxRows} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></Field></details>
      <Button type="button" size="sm" disabled={!runner.enabled || runner.checking || runner.busy || !sql.trim() || Boolean(issue) || missing || !Number.isInteger(limit) || limit < 1 || limit > runner.maxRows} onClick={() => { void runner.run(); }}>{copy.run}</Button>
      {runner.busy && <Button type="button" size="sm" variant="secondary" onClick={runner.cancel}>{copy.cancel}</Button>}
    </div>
    {runner.checking ? <p role="status" className="text-xs text-fg-muted">{copy.checking}</p> : !runner.enabled && !runner.gateError && <p role="status" className="text-xs text-fg-muted">{copy.disabled}</p>}
    {missing && <p className="text-xs text-fg-muted">{copy.missing}</p>}
    {(runner.error || runner.gateError) && <p role="alert" className="text-sm text-danger">{runner.error || runner.gateError}</p>}
    <p className="text-2xs text-fg-subtle">{copy.source}</p>
    {!hideResult && runner.result && <SqlResultView result={runner.result} language={i18n.language} presentation={presentation} onPresentation={onPresentation} />}
  </section>;
}

export function SqlResultView({ result, language, presentation, onPresentation, hidePicker = false }: { result: QueryResult; language: string; presentation?: SqlPresentation | undefined; onPresentation?: ((next: SqlPresentation) => void) | undefined; hidePicker?: boolean }) {
  const copy = sqlCopy(language), fields = queryFields(result);
  const dimensions = result.columns.filter((column) => !["int2", "int4", "int8", "numeric", "float4", "float8"].includes(column.type));
  const numbers = fields.filter((field) => field.type === "NUMBER");
  const [localView, setView] = useState<SqlPresentation>(presentation ?? { type: "table", kind: "bar", group: dimensions[0]?.key ?? "", value: numbers[0]?.slug ?? "", split: result.columns.find((column) => column.key === "currency")?.key ?? "" });
  const view = hidePicker || onPresentation ? presentation ?? localView : localView;
  const update = (patch: Partial<SqlPresentation>) => { const next = { ...view, ...patch }; setView(next); onPresentation?.(next); };
  let chartRows: ReturnType<typeof queryChartRows> = [], precision = false;
  try { chartRows = queryChartRows(result); } catch { precision = true; }
  const ready = (view.kind === "stat" || fields.some((field) => field.slug === view.group)) && numbers.some((field) => field.slug === view.value);
  const config: ChartConfig = { ...newChart(), kind: view.kind, groupSlug: view.group, valueSlug: view.value, splitSlug: view.split !== view.group && fields.some((field) => field.slug === view.split) ? view.split : "", aggregation: "sum", title: copy.title };
  return <div className="flex min-w-0 flex-col gap-3" data-sql-result>
    <div className="flex flex-wrap items-center gap-2">{!hidePicker && <><Button type="button" size="sm" variant="secondary" aria-pressed={view.type === "table"} onClick={() => update({ type: "table" })}>{copy.table}</Button><Button type="button" size="sm" variant="secondary" aria-pressed={view.type === "chart"} onClick={() => update({ type: "chart" })}>{copy.chart}</Button></>}<span role="status" className="text-xs text-fg-muted">{result.rows.length} {copy.returned} · {copy.limit}: {result.limit}</span></div>
    {result.truncated && <p role="status" className="text-sm text-warning">{copy.truncated}</p>}
    {view.type === "table" ? <SqlResultTable result={result} language={language} /> : <>
      {!hidePicker && <div className="grid gap-2 sm:grid-cols-3"><Field label={copy.chart}><Dropdown ariaLabel={copy.chart} value={view.kind} items={[{ value: "bar", label: copy.bar }, { value: "line", label: copy.line }, { value: "donut", label: copy.donut }]} onChange={(kind) => update({ kind: kind as SqlPresentation["kind"] })} /></Field><Field label={copy.group}><Dropdown ariaLabel={copy.group} value={view.group} items={fields.map((field) => ({ value: field.slug, label: field.label }))} onChange={(group) => update({ group })} /></Field><Field label={copy.measure}><Dropdown ariaLabel={copy.measure} value={view.value} items={numbers.map((field) => ({ value: field.slug, label: field.label }))} onChange={(value) => update({ value })} /></Field></div>}
      {precision ? <p role="alert" className="text-sm text-danger">{copy.precision}</p> : !ready ? <p className="text-sm text-fg-muted">{copy.chartHint}</p> : <div className="min-h-[220px]" aria-label={copy.chart}><ChartCard config={config} columns={fields} relations={[]} rows={chartRows} language={language} editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} hideHeader plain showRowCount={false} /></div>}
      <p className="text-2xs text-fg-muted">{copy.grain}</p>
    </>}
  </div>;
}

function SqlResultTable({ result, language }: { result: QueryResult; language: string }) {
  const copy = sqlCopy(language), [page, setPage] = useState(1), pages = Math.max(1, Math.ceil(result.rows.length / 50));
  return <><div className="max-h-[320px] min-w-0 overflow-auto"><table aria-label={copy.title} className="w-full border-collapse text-sm"><thead><tr>{result.columns.map((column) => <th key={column.key} scope="col" className="sticky top-0 border-b border-border bg-surface-soft px-3 py-2 text-left font-medium">{column.key}</th>)}</tr></thead><tbody>{result.rows.slice((page - 1) * 50, page * 50).map((row, index) => <tr key={index} className="hover:bg-surface-hover">{result.columns.map((column) => <td key={column.key} className="border-b border-border px-3 py-2">{row[column.key] === null ? "—" : String(row[column.key])}</td>)}</tr>)}{!result.rows.length && <tr><td colSpan={result.columns.length} className="p-4 text-fg-muted">{copy.empty}</td></tr>}</tbody></table></div>{pages > 1 && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button><span>{page} / {pages}</span><Button size="sm" type="button" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</Button></div>}</>;
}
