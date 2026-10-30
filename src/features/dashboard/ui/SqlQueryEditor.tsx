import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { useSavedQueries } from "@/features/settings";
import { useSqlCatalog } from "../api/sql-catalog";
import type { Dataset, DatasetParameter } from "../model/datasets";
import { joinSqlGuidance, namedSqlParameters, type SqlSuggestion } from "../model/sql-assist";
import { boundedSqlSuggestions, supportedSqlExamples } from "../model/sql-query-guidance";
import { sqlCopy } from "../model/sql-copy";
import { sqlEditorCopy } from "../model/sql-editor-copy";
import { SqlJoinBuilder } from "./SqlJoinBuilder";

/** Schema controls only suggest snippets; they never rewrite the current query. */
export function SqlQueryEditor({ dataset, menuId, onChange, active = true }: { active?: boolean; dataset: Dataset; menuId: string; onChange: (next: Dataset) => void }) {
  const { t, i18n } = useTranslation();
  const copy = sqlEditorCopy(i18n.language), base = sqlCopy(i18n.language), id = useId();
  const [context, setContext] = useState(""), [caret, setCaret] = useState(0), [suggesting, setSuggesting] = useState(false), [selected, setSelected] = useState(0), [example, setExample] = useState("");
  const input = useRef<HTMLTextAreaElement>(null), access = useSqlCatalog(menuId, active);
  const saved = useSavedQueries({ enabled: active, skipAuthRefresh: true }), [savedId, setSavedId] = useState("");
  const savedQuery = saved.queries.find((query) => query.id === savedId);
  const catalog = context ? [...access.tables.filter((table) => table.slug === context), ...access.tables.filter((table) => table.slug !== context)] : access.tables;
  const picker = <Dropdown ariaLabel={base.table} value={context} items={access.tables.map((table) => ({ value: table.slug, label: table.label }))} onChange={setContext} />;
  if (dataset.source.kind !== "sql") return null;
  const source = dataset.source, sql = source.sql;
  const suggestions = suggesting ? boundedSqlSuggestions(sql, caret, catalog) : [];
  const changeSql = (value: string) => onChange({ ...dataset, source: { ...source, sql: value, parameters: namedSqlParameters(value).map((name) => source.parameters.find((p) => p.name === name) ?? { name, type: "text", required: true }) } });
  const choose = (suggestion: SqlSuggestion) => {
    changeSql(sql.slice(0, suggestion.replaceFrom) + suggestion.value + sql.slice(suggestion.replaceTo)); setSuggesting(false);
    const at = suggestion.replaceFrom + suggestion.value.length;
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(at, at); });
  };
  return <div className="flex min-w-0 flex-col gap-2">
    <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm text-fg-muted">{t("sql.savedList")}</summary><div className="mt-2 flex flex-col gap-2"><Dropdown ariaLabel={t("sql.savedList")} value={savedId} items={saved.queries.map((query) => ({ value: query.id, label: query.name }))} onChange={setSavedId} />{saved.error && <p className="text-xs text-fg-muted">{saved.error}</p>}<Button size="sm" variant="secondary" disabled={!savedQuery} onClick={() => { if (savedQuery) { changeSql(savedQuery.sql); setSuggesting(false); } }}>{copy.useSaved}</Button></div></details>
    <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">{i18n.language.startsWith("ru") ? "Собрать JOIN" : i18n.language.startsWith("uz") ? "JOIN tuzish" : "Build JOIN"}</summary><div className="mt-2 flex flex-col gap-2">{picker}{catalog.length > 0 ? <SqlJoinBuilder key={context} catalog={catalog} onUse={(value) => { changeSql(value); setSuggesting(false); }} /> : <p className="text-xs text-fg-muted">{access.checking ? t("common.loading") : copy.missingSchema}</p>}</div></details>
    <label htmlFor={id} className="text-sm font-medium">{copy.editor}</label>
    <textarea id={id} ref={input} aria-describedby={`${id}-hint`} value={sql} spellCheck={false} className="h-44 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent" onChange={(event) => { changeSql(event.target.value); setCaret(event.target.selectionStart); setSuggesting(true); setSelected(0); }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); setCaret(event.currentTarget.selectionStart); setSuggesting(true); setSelected(0); }
      if (event.key === "Escape" && suggesting) { event.preventDefault(); event.stopPropagation(); setSuggesting(false); }
      if (suggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSelected((at) => (at + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
      if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); choose(suggestions[selected % suggestions.length]!); }
    }} />
    <p id={`${id}-hint`} className="text-2xs text-fg-muted">{copy.help}</p>
    {suggestions.length > 0 && <div role="listbox" aria-label={t("dashboard.sqlSuggestions")} className="max-h-32 overflow-auto rounded-md border border-border">{suggestions.map((suggestion, index) => <button key={suggestion.value} type="button" role="option" aria-selected={index === selected} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)} className={`flex w-full justify-between gap-2 px-2 py-1 text-left text-xs ${index === selected ? "bg-accent-subtle" : "hover:bg-surface-hover"}`}><span className="font-mono">{suggestion.label}</span><span className="truncate text-fg-muted">{suggestion.detail}</span></button>)}</div>}
    <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm text-fg-muted">{copy.schema}</summary><div className="mt-2 flex flex-col gap-2"><p className="text-xs text-fg-muted">{copy.schemaHint}</p>{picker}
      {access.checking && <p role="status" className="text-xs text-fg-muted">{t("common.loading")}</p>}{access.error && <p role="alert" className="text-xs text-danger">{access.error.message}</p>}
      {!context && <p className="text-xs text-fg-muted">{copy.missingSchema}</p>}
      {catalog.map((table) => <div key={table.slug}><p className="text-xs font-medium">{table.label} <code className="text-fg-muted">{table.slug}</code></p><p className="break-words font-mono text-2xs text-fg-muted">{table.fields.map((field) => field.slug).join(" · ")}</p></div>)}
      <p className="text-xs font-medium">{copy.joins}</p><p className="text-xs text-fg-muted">{copy.joinHint}</p>
      {joinSqlGuidance(catalog).map((join) => <textarea key={join} readOnly aria-label={t("dashboard.joinSnippet")} value={join} onFocus={(event) => event.currentTarget.select()} className="h-20 w-full rounded-md border border-border bg-surface p-2 font-mono text-2xs" />)}
      <p className="text-xs font-medium">{copy.examples}</p><div className="flex flex-wrap gap-1">{supportedSqlExamples(catalog).map((item) => <Button key={item.kind} size="sm" variant="secondary" onClick={() => setExample(item.sql)}>{item.kind === "table" ? base.tableExample : item.kind === "totals" ? base.totalsExample : base.joinExample}</Button>)}</div>
      {example && <div className="flex flex-col gap-2 rounded-md border border-border p-2"><p className="text-xs text-fg-muted">{copy.exampleHint}</p><pre className="max-h-44 overflow-auto whitespace-pre-wrap text-2xs">{example}</pre><Button size="sm" variant="secondary" onClick={() => { changeSql(example); setExample(""); setSuggesting(false); }}>{copy.useExample}</Button><Button size="sm" variant="ghost" onClick={() => setExample("")}>{copy.dismiss}</Button></div>}
    </div></details>
    {namedSqlParameters(sql).length > 0 && <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm text-fg-muted">{copy.parameters}</summary><div className="mt-2 flex flex-col gap-2">{namedSqlParameters(sql).map((name) => <div key={name} className="flex items-center gap-2 text-xs"><code>:{name}</code><Dropdown ariaLabel={`${t("dashboard.parameterType")}: ${name}`} value={source.parameters.find((p) => p.name === name)?.type ?? "text"} items={["text", "number", "date", "boolean"].map((type) => ({ value: type, label: type }))} onChange={(type) => onChange({ ...dataset, source: { ...source, parameters: [...source.parameters.filter((p) => p.name !== name), { ...source.parameters.find((p) => p.name === name), name, type: type as DatasetParameter["type"], required: true }] } })} /></div>)}</div></details>}
  </div>;
}
