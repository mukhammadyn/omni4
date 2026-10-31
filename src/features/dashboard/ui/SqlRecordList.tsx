import "./sql-record-list.css";
import { Tooltip } from "@/shared/ui/tooltip";
import { useEffect, useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";
import { queryImageHref, queryRecordHref, type QueryResult } from "../model/query-result";
import type { SqlPresentation } from "../model/sql-widget";

/** Generic SQL lists/calendar groups. The query supplies every label, value and ordering. */
export function SqlRecordList({ result, view, empty, language }: { result: QueryResult; view: SqlPresentation; empty: string; language: string }) {
  const options = view.records!, rowHeight=Math.max(40,Math.min(120,view.rowHeight ?? 57));
  const [selected,setSelected] = useState<string | null>(null);
  const text = (row: QueryResult["rows"][number], field?: string) => field && row[field] !== null && row[field] !== undefined ? String(row[field]) : "";
  const groups = (() => {
    const map = new Map<string,{key:string;label:string;filterLabel:string;rows:QueryResult["rows"]}>();
    for (const row of result.rows) {
      const key = options.groupField ? String(row[options.groupField] ?? "") : "";
      if (!map.has(key)) map.set(key,{key,label:text(row,options.groupLabelField) || key,filterLabel:text(row,options.filterLabelField) || text(row,options.groupLabelField) || key,rows:[]});
      if (text(row,options.titleField)) map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  })();
  const groupKey = groups.map(group=>group.key).join("\u0000");
  useEffect(()=>{setSelected(null);},[groupKey,options.groupFilter]);
  const missing = [options.highlightField, options.titleField, options.groupField, options.subtitleField, options.badgeField, options.secondaryField, options.groupLabelField, options.filterLabelField, options.photoField].filter(Boolean).some(key => !result.columns.some(column=>column.key===key));
  const shown = options.groupFilter && selected !== null ? groups.filter(group=>group.key===selected) : groups;
  const list = (rows:QueryResult["rows"]) => rows.length ? <ul className="divide-y divide-border">{rows.map((row,index)=>{
    const title=text(row,options.titleField), href=queryRecordHref(view.linkTemplate,view.linkField ? row[view.linkField] : undefined);
    const photo=options.photoField ? queryImageHref(row[options.photoField],import.meta.env.VITE_CDN_URL,typeof window === "undefined" ? "https://localhost" : window.location.origin) : undefined;
    const highlighted=Boolean(options.highlightField && [true,1,"true","t","1"].includes(row[options.highlightField] as string|number|boolean));
    const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toLocaleUpperCase();
    return <li key={view.linkField ? String(row[view.linkField] ?? index) : index} style={{height:rowHeight-(index===0?1:0),minHeight:rowHeight-(index===0?1:0),paddingTop:Math.min(10,(rowHeight-37)/2),paddingBottom:Math.min(10,(rowHeight-37)/2)}} className={`flex items-center gap-3 px-4 ${highlighted ? "bg-accent-subtle" : ""}`}>
      {options.avatar && <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-xs font-semibold text-accent-text">{initials}{photo && <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={event=>{event.currentTarget.style.display="none";}}/>}</span>}
      <Tooltip label={[title,text(row,options.subtitleField)].filter(Boolean).join(" · ")}><span tabIndex={0} className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-fg">{href ? <a href={href} className="hover:underline">{title}</a> : title}</span>{options.subtitleField && <span className="block truncate text-xs text-fg-muted">{text(row,options.subtitleField)}</span>}</span></Tooltip>
      <span className="shrink-0 text-right">{options.badgeField && <Tooltip label={text(row,options.badgeField)}><span tabIndex={0} className={options.badgeStyle === "pill" ? `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${highlighted ? "bg-accent-solid text-accent-fg" : "bg-surface-soft text-fg-muted"}` : "block text-sm font-semibold text-fg"}>{text(row,options.badgeField)}</span></Tooltip>}{options.secondaryField && <span className="block text-xs text-fg-subtle">{text(row,options.secondaryField)}</span>}</span>
    </li>;
  })}</ul> : <p className="flex flex-1 items-center justify-center px-4 py-6 text-xs text-fg-subtle">{options.emptyLabel || empty}</p>;
  if (missing || !options.titleField) return <p role="alert" className="text-sm text-warning">{language.startsWith("ru") ? "Выберите поля списка в настройках виджета." : "Choose valid list fields in the widget editor."}</p>;
  if (!result.rows.length || options.emptyDatasetLabel && groups.every(group=>!group.rows.length)) return <p role="status" className="p-4 text-sm text-fg-muted">{options.emptyDatasetLabel || options.emptyLabel || empty}</p>;
  return <div data-sql-record-list style={{containerType:"inline-size"}} className="flex min-w-0 shrink-0 flex-col gap-4">
    {options.groupFilter && options.groupField && <div className="flex flex-wrap gap-2" aria-label={language.startsWith("ru") ? "Группы" : "Groups"}><button type="button" aria-pressed={selected===null} onClick={()=>setSelected(null)} className={`h-8 rounded-lg border px-3 text-xs font-medium ${selected===null ? "border-accent bg-accent-solid text-accent-fg" : "border-border bg-surface text-fg-muted"}`}>{options.allLabel || (language.startsWith("ru") ? "Все" : "All")}</button>{groups.map(group=><button key={group.key} type="button" aria-pressed={selected===group.key} onClick={()=>setSelected(current=>current===group.key?null:group.key)} className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${selected===group.key ? "border-accent bg-accent-solid text-accent-fg" : "border-border bg-surface text-fg-muted"}`}>{group.filterLabel}<span className="rounded bg-surface-hover px-1 text-fg-muted">{group.rows.length}</span></button>)}</div>}
    {options.layout === "cards" ? <div data-sql-card-cols={options.columns ?? 3} className="sql-record-card-grid grid grid-cols-1 items-stretch gap-4">{shown.map(group=><article key={group.key} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface"><header className="flex min-h-[53px] items-center justify-between gap-2 border-b border-border px-4 py-3"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">{options.calendarIcon && <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-accent-subtle bg-accent-subtle text-accent-text"><Icon as={CalendarDaysIcon} size={14}/></span>}<span className="truncate">{group.label}</span></h3><span className="rounded-lg bg-surface-soft px-2 py-0.5 text-xs font-medium text-fg-muted">{group.rows.length}</span></header>{list(group.rows)}</article>)}</div> : list(shown.flatMap(group=>group.rows))}
  </div>;
}
