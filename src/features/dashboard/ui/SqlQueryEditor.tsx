import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { useSqlCatalog } from "../api/sql-catalog";
import type { Dataset } from "../model/datasets";
import { namedSqlParameters, type SqlSuggestion } from "../model/sql-assist";
import { boundedSqlSuggestions } from "../model/sql-query-guidance";
import { buildJoinSql, completeJoinColumns, initialJoinDraft, type JoinDraft } from "../model/sql-join-builder";
import { syncVisualSql } from "../model/sql-visual-source";
import { SqlJoinBuilder } from "./SqlJoinBuilder";

export function SqlQueryEditor({ dataset, menuId, tableSlug = "", onChange, active = true }: { active?: boolean; dataset: Dataset; menuId: string; tableSlug?: string; onChange: (next: Dataset) => void }) {
  const { t, i18n } = useTranslation(), id = useId();
  const [caret, setCaret] = useState(0), [suggesting, setSuggesting] = useState(false), [selected, setSelected] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null), access = useSqlCatalog(menuId, active);
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
    {access.checking && <p role="status" className="text-xs text-fg-muted">{t("common.loading")}</p>}
    {access.error && <p role="alert" className="text-xs text-danger">{access.error.message}</p>}
    {base && <details><summary className="cursor-pointer text-xs text-fg-muted">{i18n.language.startsWith("ru") ? "Связи таблиц" : "Table joins"}</summary><SqlJoinBuilder catalog={access.tables} plan={plan} onChange={changePlan} />
    {source.sqlMode !== "visual" && <Button type="button" size="sm" variant="secondary" disabled={Boolean(buildJoinSql(completeJoinColumns(plan, access.tables), access.tables).issue)} onClick={() => changePlan(plan, true)}>{i18n.language.startsWith("ru") ? "Заменить SQL" : "Replace SQL"}</Button>}</details>}
    <label htmlFor={id} className="text-sm font-medium">SQL</label>
    <textarea id={id} ref={input} aria-label="SQL" value={sql} spellCheck={false} className="h-44 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent" onChange={(event) => { changeSql(event.target.value); setCaret(event.target.selectionStart); setSuggesting(true); setSelected(0); }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); setCaret(event.currentTarget.selectionStart); setSuggesting(true); setSelected(0); }
      if (event.key === "Escape" && suggesting) { event.preventDefault(); event.stopPropagation(); setSuggesting(false); }
      if (suggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSelected((at) => (at + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
      if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); choose(suggestions[selected % suggestions.length]!); }
    }} />
    {suggestions.length > 0 && <div role="listbox" aria-label={t("dashboard.sqlSuggestions")} className="max-h-32 overflow-auto rounded-md border border-border">{suggestions.map((suggestion, index) => <button key={suggestion.value} type="button" role="option" aria-selected={index === selected} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)} className={`block w-full px-2 py-1 text-left text-xs ${index === selected ? "bg-accent-subtle" : "hover:bg-surface-hover"}`}>{suggestion.label}</button>)}</div>}

  </div>;
}
