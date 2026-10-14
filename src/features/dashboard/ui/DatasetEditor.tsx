import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "@/features/item";
import { localized, useTables } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import { Modal } from "@/shared/ui/modal";
import { useDashboardSchema } from "../api/schema";
import { TablePicker } from "./WidgetEditor";
import type { Dataset, DatasetParameter, DatasetTable } from "../model/datasets";
import { insertJoinGuidance, joinSqlGuidance, namedSqlParameters, quoteSqlName, sqlSuggestions, type SqlSuggestion } from "../model/sql-assist";

const fresh = (): Dataset => ({ id: crypto.randomUUID(), name: "", source: { kind: "table", tableSlug: "", fields: [], filters: {}, joins: [] } });
export function DatasetEditor({ datasets, menuId, onSave, onClose }: { datasets: Dataset[]; menuId: string; onSave: (datasets: Dataset[]) => Promise<boolean>; onClose: () => void }) {
  const dialog = useDialogFocus(onClose);
  const { t } = useTranslation(), { current: language } = useDataLanguages();
  const [drafts, setDrafts] = useState(datasets), [current, setCurrent] = useState<Dataset>(fresh), [context, setContext] = useState("");
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [suggesting, setSuggesting] = useState(false), [caret, setCaret] = useState(0), [selected, setSelected] = useState(0);
  const [manualJoin, setManualJoin] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const tables = useTables("");
  const slug = current.source.kind === "table" ? current.source.tableSlug : context;
  const access = useDashboardSchema(slug || undefined, menuId), { schema } = access;
  const catalog: DatasetTable[] = !access.ready || access.denied || access.error ? [] : [{ slug, label: tables.items.find((table) => table.slug === slug)?.label ?? slug, fields: [{ slug: "guid", label: "ID", type: "UUID" }, ...schema.fields.map((field) => {
    const relation = schema.relations.find((relation) => relation.id === field.relationId);
    const target = relation?.toSlug;
    return { slug: field.slug, label: localized(field.labels, language, field.label), type: field.type, ...(target ? { target, joinable: relation?.type === "Many2One" && relation.direction === "outgoing" && relation.fieldFrom === field.slug } : {}) };
  })] }, ...Object.entries(access.relatedFields).map(([table, fields]) => ({ slug: table, label: tables.items.find((item) => item.slug === table)?.label ?? table, fields: [{ slug: "guid", label: "ID", type: "UUID" }, ...fields.map((field) => ({ slug: field.slug, label: localized(field.labels, language, field.label), type: field.type }))] }))];
  const sql = current.source.kind === "sql" ? current.source.sql : "";
  useEffect(() => { setManualJoin(""); }, [sql, current.id, context]);
  const suggestions = suggesting ? sqlSuggestions(sql, caret, catalog) : [];
  const joins = joinSqlGuidance(catalog);
  const choose = (suggestion: SqlSuggestion) => {
    if (current.source.kind !== "sql") return;
    const next = sql.slice(0, suggestion.replaceFrom) + suggestion.value + sql.slice(suggestion.replaceTo);
    setCurrent({ ...current, source: { ...current.source, sql: next } }); setSuggesting(false);
    const at = suggestion.replaceFrom + suggestion.value.length;
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(at, at); });
  };
  const valid = Boolean(current.name.trim() && (current.source.kind === "sql" ? sql.trim() : current.source.tableSlug && current.source.fields.length && access.ready && !access.error && !access.denied));
  const normalized = (): Dataset => current.source.kind === "sql" ? { ...current, name: current.name.trim(), source: { ...current.source, parameters: namedSqlParameters(sql).map((name) => current.source.kind === "sql" ? current.source.parameters.find((p) => p.name === name) ?? { name, type: "text" as const, required: true } : { name, type: "text" as const, required: true }) } } : { ...current, name: current.name.trim() };
  const activeEdit = Boolean(current.name.trim() || (current.source.kind === "sql" ? sql.trim() : current.source.tableSlug));
  const stage = () => {
    if (!valid) return;
    const next = normalized();
    setDrafts((items) => items.some((item) => item.id === next.id) ? items.map((item) => item.id === next.id ? next : item) : [...items, next]);
    setCurrent(fresh());
  };
  return <Modal onClose={onClose} className="flex items-start justify-center px-4 pt-[6vh]"><div ref={dialog} role="dialog" aria-modal="true" aria-label={t("dashboard.datasets")} className="flex max-h-[88vh] w-[960px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
    <header className="px-6 pt-5"><h2 className="text-xl font-semibold">{t("dashboard.datasets")}</h2><p className="mt-1 text-sm text-fg-muted">{t("dashboard.datasetHint")}</p></header>
    <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-6 md:grid-cols-[200px_1fr]">
      <div className="flex flex-col gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setCurrent(fresh())}>{t("dashboard.newDataset")}</Button>{drafts.map((dataset) => <button key={dataset.id} type="button" onClick={() => setCurrent(dataset)} className={`rounded-md border px-3 py-2 text-left text-sm ${current.id === dataset.id ? "border-accent bg-accent-subtle" : "border-border hover:bg-surface-hover"}`}><span className="block truncate">{dataset.name}</span><span className="text-2xs text-fg-muted">{t(dataset.source.kind === "table" ? "dashboard.tableDataset" : "dashboard.sqlDraft")}</span></button>)}</div>
      <div className="flex min-w-0 flex-col gap-3">
        <Field label={t("dashboard.datasetName")}><Input data-autofocus value={current.name} onChange={(event) => setCurrent({ ...current, name: event.target.value })} /></Field>
        <Field label={t("dashboard.sourceKind")}><Dropdown ariaLabel={t("dashboard.sourceKind")} value={current.source.kind} items={[{ value: "table", label: t("dashboard.tableDataset") }, { value: "sql", label: t("dashboard.sqlDraft") }]} onChange={(kind) => { setCurrent({ ...current, source: kind === "table" ? { kind: "table", tableSlug: "", fields: [], filters: {}, joins: [] } : { kind: "sql", sql: "", parameters: [], columns: [] } }); setSuggesting(false); }} /></Field>
        {current.source.kind === "sql" && <p className="text-xs text-fg-muted">{t("dashboard.sqlSchemaContext")}</p>}
        <TablePicker value={slug} onPick={(tableSlug) => { if (current.source.kind === "table") setCurrent({ ...current, source: { kind: "table", tableSlug, fields: [], filters: {}, joins: [] } }); else setContext(tableSlug); }} />
        {access.loading && <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>}
        {access.error && <p role="alert" className="text-sm text-danger">{access.error}<Button type="button" size="sm" variant="secondary" onClick={access.retry}>{t("dashboard.refresh")}</Button></p>}
        {current.source.kind === "table" ? <>
          <fieldset className="flex flex-wrap gap-2"><legend className="mb-1 text-xs text-fg-muted">{t("dashboard.columns")}</legend>{schema.fields.map((field) => <label key={field.slug} className="flex items-center gap-1 text-xs"><Checkbox checked={current.source.kind === "table" && current.source.fields.includes(field.slug)} onChange={(event) => { if (current.source.kind !== "table") return; setCurrent({ ...current, source: { ...current.source, fields: event.target.checked ? [...current.source.fields, field.slug] : current.source.fields.filter((slug) => slug !== field.slug) } }); }} />{localized(field.labels, language, field.label)}</label>)}</fieldset>
          <FilterBar columns={schema.fields} relations={schema.relations} language={language} filters={current.source.filters} sorts={[]} onFilters={(filters) => { if (current.source.kind === "table") setCurrent({ ...current, source: { ...current.source, filters } }); }} onSorts={() => {}} />
        </> : <>
          <div className="rounded-md bg-surface-soft p-2 text-xs text-fg-muted"><p>{t("dashboard.sqlExecutionUnavailable")}</p><details className="mt-1"><summary className="cursor-pointer">{t("dashboard.sqlPrerequisites")}</summary><p className="mt-1">{t("dashboard.sqlPrerequisitesDetail")}</p></details></div>
          <label className="text-sm font-medium" htmlFor="dataset-sql">SQL</label>
          <textarea id="dataset-sql" ref={input} value={sql} aria-describedby="sql-assist-hint" spellCheck={false} className="h-44 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent" onChange={(event) => { if (current.source.kind === "sql") setCurrent({ ...current, source: { ...current.source, sql: event.target.value } }); setCaret(event.target.selectionStart); setSuggesting(true); setSelected(0); }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); setCaret(event.currentTarget.selectionStart); setSuggesting(true); return; }
            if (event.key === "Escape" && suggesting) { event.preventDefault(); event.stopPropagation(); setSuggesting(false); }
            if (suggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSelected((at) => (at + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
            if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); choose(suggestions[selected % suggestions.length]!); }
          }} />
          <p id="sql-assist-hint" className="text-2xs text-fg-muted">{t("dashboard.sqlAssistHint")}</p>
          {suggestions.length > 0 && <div role="listbox" aria-label={t("dashboard.sqlSuggestions")} className="max-h-40 overflow-auto rounded-md border border-border">{suggestions.map((suggestion, index) => <button type="button" role="option" aria-selected={index === selected} key={suggestion.value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)} className={`flex w-full justify-between gap-2 px-2 py-1 text-left text-xs ${index === selected ? "bg-accent-subtle" : "hover:bg-surface-hover"}`}><span className="font-mono">{suggestion.label}</span><span className="text-fg-muted">{suggestion.detail}</span></button>)}</div>}
          {namedSqlParameters(sql).map((name) => <div key={name} className="flex items-center gap-2 text-xs"><span className="w-28 truncate">:{name}</span><Dropdown ariaLabel={`${t("dashboard.parameterType")}: ${name}`} value={current.source.kind === "sql" ? current.source.parameters.find((p) => p.name === name)?.type ?? "text" : "text"} items={["text", "number", "date", "boolean"].map((type) => ({ value: type, label: type }))} onChange={(type) => { if (current.source.kind === "sql") setCurrent({ ...current, source: { ...current.source, parameters: [...current.source.parameters.filter((p) => p.name !== name), { name, type: type as DatasetParameter["type"], required: true }] } }); }} /></div>)}
          {joins.length > 0 && <div><p className="mb-1 text-xs text-fg-muted">{t("dashboard.joinGuidanceHint")}</p>{joins.map((join) => <button key={join} type="button" className="block max-w-full truncate py-1 text-left font-mono text-2xs text-accent-text" title={join} onClick={() => { if (current.source.kind !== "sql") return; setSuggesting(false); const next = insertJoinGuidance(sql, join, slug); if (next === null) setManualJoin(join); else { setManualJoin(""); setCurrent({ ...current, source: { ...current.source, sql: next } }); } }}>{join}</button>)}</div>}
          {manualJoin && <div role="status" className="rounded-md border border-border p-2"><p className="mb-1 text-xs text-fg-muted">{t("dashboard.joinManualHint")}</p><textarea readOnly aria-label={t("dashboard.joinSnippet")} value={manualJoin} onFocus={(event) => event.currentTarget.select()} className="h-20 w-full rounded-md border border-border bg-surface p-2 font-mono text-2xs text-fg" /></div>}
          {!sql && slug && <Button type="button" size="sm" variant="secondary" onClick={() => { if (current.source.kind === "sql") setCurrent({ ...current, source: { ...current.source, sql: `SELECT * FROM ${quoteSqlName(slug)} LIMIT 100` } }); }}>{t("dashboard.sqlStarter")}</Button>}
        </>}
        <Button type="button" size="sm" variant="secondary" disabled={!valid} onClick={stage}>{t("dashboard.applyDatasetDraft")}</Button>
      </div>
    </div>
    <footer className="flex items-center justify-end gap-2 px-6 pb-5">{failed && <p role="alert" className="mr-auto text-xs text-danger">{t("dashboard.saveFailed")}</p>}<Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t("action.cancel")}</Button><Button type="button" disabled={busy || (activeEdit && !valid)} onClick={async () => { setBusy(true); const saved = await onSave(valid ? drafts.some((dataset) => dataset.id === current.id) ? drafts.map((dataset) => dataset.id === current.id ? normalized() : dataset) : [...drafts, normalized()] : drafts); setBusy(false); setFailed(!saved); if (saved) onClose(); }}>{t("dashboard.saveDatasets")}</Button></footer>
  </div></Modal>;
}
