import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { useSavedQueries } from "@/features/settings";
import { useSqlCatalog } from "../api/sql-catalog";
import type { Dataset, DatasetParameter } from "../model/datasets";
import { namedSqlParameters, type SqlSuggestion } from "../model/sql-assist";
import { boundedSqlSuggestions } from "../model/sql-query-guidance";
import { buildJoinSql, completeJoinColumns, initialJoinDraft, type JoinDraft } from "../model/sql-join-builder";
import { syncVisualSql } from "../model/sql-visual-source";
import { SqlJoinBuilder } from "./SqlJoinBuilder";

export function SqlQueryEditor({ dataset, menuId, tableSlug = "", onChange, active = true }: { active?: boolean; dataset: Dataset; menuId: string; tableSlug?: string; onChange: (next: Dataset) => void }) {
  const { t, i18n } = useTranslation(), id = useId();
  const [savedId, setSavedId] = useState("");
  const [caret, setCaret] = useState(0), [suggesting, setSuggesting] = useState(false), [selected, setSelected] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null), access = useSqlCatalog(menuId, active);
  const saved = useSavedQueries({ enabled: active, skipAuthRefresh: true });
  const source = dataset.source.kind === "sql" ? dataset.source : undefined;
  const base = tableSlug || source?.visual?.base.table || "";
  const synced = syncVisualSql(dataset, base, access.tables);
  useEffect(() => { if (active && base && synced !== dataset) onChange(synced); }, [active, base, synced, dataset, onChange]);
  if (!source) return null;
  const sql = source.sql, plan = source.visual?.base.table === base ? source.visual : initialJoinDraft(base);
  const suggestions = suggesting ? boundedSqlSuggestions(sql, caret, access.tables) : [];
  const changeSql = (value: string) => onChange({ ...dataset, source: { ...source, sql: value, sqlMode: "manual", parameters: namedSqlParameters(value).map((name) => source.parameters.find((p) => p.name === name) ?? { name, type: "text", required: true }) } });
  const changePlan = (next: JoinDraft, replace = false) => onChange(syncVisualSql(dataset, next.base.table, access.tables, next, replace));
  const choose = (suggestion: SqlSuggestion) => {
    changeSql(sql.slice(0, suggestion.replaceFrom) + suggestion.value + sql.slice(suggestion.replaceTo)); setSuggesting(false);
    const at = suggestion.replaceFrom + suggestion.value.length;
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(at, at); });
  };
  return <div className="flex min-w-0 flex-col gap-2">
    {!base && <Dropdown ariaLabel={t("menuForm.table")} value="" items={access.tables.map((table) => ({ value: table.slug, label: table.label }))} onChange={(table) => changePlan(initialJoinDraft(table))} />}
    {access.checking && <p role="status" className="text-xs text-fg-muted">{t("common.loading")}</p>}
    {access.error && <p role="alert" className="text-xs text-danger">{access.error.message}</p>}
    {base && <SqlJoinBuilder catalog={access.tables} plan={plan} onChange={changePlan} />}
    {source.sqlMode !== "visual" && base && <Button type="button" size="sm" variant="secondary" disabled={Boolean(buildJoinSql(completeJoinColumns(plan, access.tables), access.tables).issue)} onClick={() => changePlan(plan, true)}>{i18n.language.startsWith("ru") ? "Заменить SQL" : i18n.language.startsWith("uz") ? "SQLni almashtirish" : "Replace SQL"}</Button>}
    <div className="flex items-center justify-between gap-2"><label htmlFor={id} className="text-sm font-medium">SQL</label>{saved.queries.length > 0 && <Dropdown ariaLabel={t("sql.savedList")} value={savedId} placeholder={t("sql.savedList")} items={saved.queries.map((query) => ({ value: query.id, label: query.name }))} onChange={setSavedId} />}</div>
    {savedId && <Button type="button" size="sm" variant="secondary" onClick={() => { const query = saved.queries.find((item) => item.id === savedId); if (query) changeSql(query.sql); setSavedId(""); }}>{i18n.language.startsWith("ru") ? "Заменить SQL" : i18n.language.startsWith("uz") ? "SQLni almashtirish" : "Replace SQL"}</Button>}
    <textarea id={id} ref={input} aria-label="SQL" value={sql} spellCheck={false} className="h-44 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent" onChange={(event) => { changeSql(event.target.value); setCaret(event.target.selectionStart); setSuggesting(true); setSelected(0); }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); setCaret(event.currentTarget.selectionStart); setSuggesting(true); setSelected(0); }
      if (event.key === "Escape" && suggesting) { event.preventDefault(); event.stopPropagation(); setSuggesting(false); }
      if (suggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSelected((at) => (at + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
      if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); choose(suggestions[selected % suggestions.length]!); }
    }} />
    {suggestions.length > 0 && <div role="listbox" aria-label={t("dashboard.sqlSuggestions")} className="max-h-32 overflow-auto rounded-md border border-border">{suggestions.map((suggestion, index) => <button key={suggestion.value} type="button" role="option" aria-selected={index === selected} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)} className={`block w-full px-2 py-1 text-left text-xs ${index === selected ? "bg-accent-subtle" : "hover:bg-surface-hover"}`}>{suggestion.label}</button>)}</div>}
    {source.parameters.map((parameter) => <div key={parameter.name} className="flex items-center gap-2 text-xs"><span>:{parameter.name}</span><Dropdown ariaLabel={`${t("dashboard.parameterType")}: ${parameter.name}`} value={parameter.type} items={["text", "number", "date", "boolean"].map((type) => ({ value: type, label: type }))} onChange={(type) => onChange({ ...dataset, source: { ...source, parameters: source.parameters.map((p) => p.name === parameter.name ? { ...p, type: type as DatasetParameter["type"] } : p) } })} /></div>)}
  </div>;
}
