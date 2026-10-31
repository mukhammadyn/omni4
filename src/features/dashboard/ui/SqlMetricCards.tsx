import { Tooltip } from "@/shared/ui/tooltip";
import type { QueryResult } from "../model/query-result";
import type { SqlRecordOptions } from "../model/sql-record-options";

/** Editable record cards for a measured value against a limit or target. */
export function SqlMetricCards({ result, options, language }: { result: QueryResult; options: SqlRecordOptions; language: string }) {
  const decimals = options.progressDecimals ?? 1;
  const format = (value: number | null) => value === null ? "—" : value.toLocaleString(language, {maximumFractionDigits:decimals,minimumFractionDigits:decimals});
  return <div data-sql-metric-cards style={{containerType:"inline-size"}}><div className="sql-record-card-grid grid grid-cols-1 items-stretch gap-4" data-sql-card-cols={options.columns ?? 3}>{result.rows.map((row,index) => {
    const text = (field?: string) => field && row[field] !== null && row[field] !== undefined ? String(row[field]) : "";
    const number = (field?: string) => { const value = field ? row[field] : null; if (value === null || value === undefined || value === "" || typeof value === "boolean") return null; const n = Number(value); return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null; };
    const value = number(options.progressValueField), max = number(options.progressMaxField);
    const percent = value !== null && max !== null && max > 0 ? value / max * 100 : null;
    const percentText = percent === null ? "—" : `${percent.toLocaleString(language,{maximumFractionDigits:1})}%`;
    const color = percent !== null && percent >= 100 ? "text-danger" : percent !== null && percent >= 80 ? "text-warning" : "text-success";
    const label = `${format(value)} / ${format(max)} ${options.progressUnit ?? ""} · ${percentText}`;
    const highlighted = options.highlightField && [true,1,"true","t","1"].includes(row[options.highlightField] as string|number|boolean);
    return <article key={index} className="flex min-h-44 min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-fg">{text(options.titleField)}</h3><p className="text-2xs text-fg-muted">{text(options.subtitleField)}</p></div>{options.badgeField && <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium ${highlighted ? "bg-success-subtle text-success" : "bg-surface-soft text-fg-muted"}`}>{text(options.badgeField)}</span>}</header>
      <div><p className="text-2xs text-fg-subtle">{options.progressCaption}</p><div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2"><p className="text-lg font-semibold tabular-nums text-fg">{format(value)}<span className="text-xs font-normal text-fg-muted"> / {format(max)} {options.progressUnit}</span></p><span className={`text-sm font-semibold tabular-nums ${color}`}>{percentText}</span></div><Tooltip label={label}><div tabIndex={0} className={`mt-2 h-2 overflow-hidden rounded-full bg-surface-soft ${color}`} {...(percent !== null ? {role:"progressbar","aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":Math.max(0,Math.min(100,percent)),"aria-valuetext":label,"aria-label":text(options.titleField)} : {"aria-label":label})}>{percent !== null && <div className="h-full rounded-full bg-current" style={{width:`${Math.max(0,Math.min(100,percent))}%`}}/>}</div></Tooltip></div>
      <footer className="mt-auto flex flex-wrap justify-between gap-2 text-2xs"><span className="text-fg-muted">{text(options.footerField)}</span><span className="font-medium text-warning">{text(options.secondaryField)}</span></footer>
    </article>;
  })}</div></div>;
}
