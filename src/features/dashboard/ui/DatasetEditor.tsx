import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterBar } from "@/features/item";
import { localized } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field, Input } from "@/shared/ui/input";
import { Tabs } from "@/shared/ui/tabs";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import { Modal } from "@/shared/ui/modal";
import { useDashboardSchema } from "../api/schema";
import { TablePicker } from "./WidgetEditor";
import type { Widget } from "../model/dashboard";
import { sqlWidgetFrom, type SqlPresentation } from "../model/sql-widget";
import type { Dataset } from "../model/datasets";
import { namedSqlParameters } from "../model/sql-assist";
import { syncVisualSql } from "../model/sql-visual-source";
import { SqlQueryEditor } from "./SqlQueryEditor";
import { SqlDatasetRunner } from "./SqlDatasetRunner";
import { sqlSupportIssue } from "../model/sql-query-guidance";
import type { QueryResult } from "../model/query-result";

const fresh = (): Dataset => ({ id: crypto.randomUUID(), name: "", source: { kind: "table", tableSlug: "", fields: [], filters: {}, joins: [] } });
export function DatasetEditor({ datasets, menuId, onSave, onClose, onCreateWidget }: { datasets: Dataset[]; onCreateWidget?: ((datasets: Dataset[], widget: Widget) => Promise<boolean>) | undefined; menuId: string; onSave: (datasets: Dataset[]) => Promise<boolean>; onClose: () => void }) {
  const dialog = useDialogFocus(onClose), { t } = useTranslation(), { current: language } = useDataLanguages();
  const [drafts, setDrafts] = useState(datasets), [current, setCurrent] = useState<Dataset>(fresh), [context, setContext] = useState("");
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [presentation, setPresentation] = useState<SqlPresentation>();
  const sources = useRef(new Map<string, Dataset["source"]>());
  const slug = current.source.kind === "table" ? current.source.tableSlug : context;
  const access = useDashboardSchema(current.source.kind === "table" ? slug || undefined : undefined, menuId), { schema } = access;
  const sql = current.source.kind === "sql" ? current.source.sql : "", signature = JSON.stringify([current.id, sql, current.source.kind === "sql" ? current.source.parameters : []]);
  const [preview, setPreview] = useState<{ signature: string; result: QueryResult | null }>();
  const receive = useCallback((result: QueryResult | null) => setPreview({ signature, result }), [signature]);
  const valid = Boolean(current.name.trim() && (current.source.kind === "sql" ? sql.trim() && !sqlSupportIssue(sql) : current.source.tableSlug && current.source.fields.length && access.ready && !access.error && !access.denied));
  const normalized = (): Dataset => current.source.kind === "sql" ? { ...current, name: current.name.trim(), source: { ...current.source, parameters: namedSqlParameters(sql).map((name) => current.source.kind === "sql" ? current.source.parameters.find((p) => p.name === name) ?? { name, type: "text" as const, required: true } : { name, type: "text" as const, required: true }) } } : { ...current, name: current.name.trim() };
  const listWith = (next: Dataset) => drafts.some((item) => item.id === next.id) ? drafts.map((item) => item.id === next.id ? next : item) : [...drafts, next];
  const activeEdit = Boolean(current.name.trim() || (current.source.kind === "sql" ? sql.trim() : current.source.tableSlug));
  const switchSource = (kind: string) => {
    sources.current.set(`${current.id}:${current.source.kind}`, current.source);
    const table = current.source.kind === "table" ? current.source.tableSlug : current.source.visual?.base.table ?? context;
    setContext(table);
    const source = sources.current.get(`${current.id}:${kind}`) ?? (kind === "table" ? { kind: "table" as const, tableSlug: table, fields: [], filters: {}, joins: [] } : { kind: "sql" as const, sql: "", sqlMode: "visual" as const, parameters: [], columns: [] });
    setCurrent(kind === "sql" ? syncVisualSql({ ...current, source }, table, []) : { ...current, source }); setPresentation(undefined);
  };
  return <Modal onClose={onClose} className="flex items-start justify-center px-4 pt-[6vh]"><div ref={dialog} role="dialog" aria-modal="true" aria-label={t("dashboard.datasets")} className="flex max-h-[88vh] w-[960px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
    <header className="px-6 pt-5"><h2 className="text-xl font-semibold">{t("dashboard.datasets")}</h2></header>
    <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-6 md:grid-cols-[200px_1fr]">
      <div className="flex flex-col gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => { setCurrent(fresh()); setContext(""); }}>{t("dashboard.newDataset")}</Button>{drafts.map((dataset) => <button key={dataset.id} type="button" onClick={() => { setCurrent(dataset); setContext(dataset.source.kind === "table" ? dataset.source.tableSlug : dataset.source.visual?.base.table ?? ""); }} className={`rounded-md border px-3 py-2 text-left text-sm ${current.id === dataset.id ? "border-accent bg-accent-subtle" : "border-border hover:bg-surface-hover"}`}><span className="block truncate">{dataset.name}</span></button>)}</div>
      <div className="flex min-w-0 flex-col gap-3">
        <Field label={t("dashboard.datasetName")}><Input data-autofocus value={current.name} onChange={(event) => setCurrent({ ...current, name: event.target.value })} /></Field>
        <Tabs variant="module" panelPrefix="dataset-source" ariaLabel={t("dashboard.sourceKind")} tabs={[{ id: "table", label: t("dashboard.plainTable") }, { id: "sql", label: "SQL" }]} activeId={current.source.kind} onSelect={switchSource} />
        <div id={`dataset-source-panel-${current.source.kind}`} role="tabpanel" aria-labelledby={`dataset-source-${current.source.kind}`} className="flex min-w-0 flex-col gap-3">
        {current.source.kind === "table" ? <>
          <TablePicker value={slug} onPick={(tableSlug) => setCurrent({ ...current, source: { kind: "table", tableSlug, fields: [], filters: {}, joins: [] } })} />
          {access.loading && <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>}
          {access.error && <p role="alert" className="text-sm text-danger">{access.error}<Button type="button" size="sm" variant="secondary" onClick={access.retry}>{t("dashboard.refresh")}</Button></p>}
          <fieldset className="flex flex-wrap gap-2"><legend className="mb-1 text-xs text-fg-muted">{t("dashboard.columns")}</legend>{schema.fields.map((field) => <label key={field.slug} className="flex items-center gap-1 text-xs"><Checkbox checked={current.source.kind === "table" && current.source.fields.includes(field.slug)} onChange={(event) => { if (current.source.kind === "table") setCurrent({ ...current, source: { ...current.source, fields: event.target.checked ? [...current.source.fields, field.slug] : current.source.fields.filter((slug) => slug !== field.slug) } }); }} />{localized(field.labels, language, field.label)}</label>)}</fieldset>
          <FilterBar columns={schema.fields} relations={schema.relations} language={language} filters={current.source.filters} sorts={[]} onFilters={(filters) => { if (current.source.kind === "table") setCurrent({ ...current, source: { ...current.source, filters } }); }} onSorts={() => {}} />
        </> : <>
          <SqlQueryEditor dataset={current} menuId={menuId} tableSlug={context} onChange={setCurrent} />
          <SqlDatasetRunner key={current.id} menuId={menuId} sql={sql} parameters={current.source.parameters} onPresentation={setPresentation} onResult={receive} />
          {onCreateWidget && <Button type="button" variant="secondary" size="sm" disabled={!valid || busy || preview?.signature !== signature || !preview.result} onClick={async () => { setBusy(true); const next = normalized(); const saved = await onCreateWidget(listWith(next), sqlWidgetFrom(next, presentation)); setBusy(false); setFailed(!saved); if (saved) onClose(); }}>{t("dashboard.addWidget")} · SQL</Button>}
        </>}
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!valid} onClick={() => { setDrafts(listWith(normalized())); setCurrent(fresh()); setContext(""); }}>{t("dashboard.applyDatasetDraft")}</Button>
      </div>
    </div>
    <footer className="flex items-center justify-end gap-2 px-6 pb-5">{failed && <p role="alert" className="mr-auto text-xs text-danger">{t("dashboard.saveFailed")}</p>}<Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t("action.cancel")}</Button><Button type="button" disabled={busy || (activeEdit && !valid)} onClick={async () => { setBusy(true); const saved = await onSave(valid ? listWith(normalized()) : drafts); setBusy(false); setFailed(!saved); if (saved) onClose(); }}>{t("dashboard.saveDatasets")}</Button></footer>
  </div></Modal>;
}
