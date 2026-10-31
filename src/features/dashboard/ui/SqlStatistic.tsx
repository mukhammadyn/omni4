import { Tooltip } from "@/shared/ui/tooltip";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { SqlPresentation } from "../model/sql-widget";

/** Shared numeric card presentation; data and reductions remain in the runner. */
export function SqlStatistic({ value, detail, href, view, language, empty }: { value: number | null; detail: unknown; href?: string | undefined; view: SqlPresentation; language: string; empty: string }) {
  const placement = view.detailPlacement ?? "above", inline = placement === "inline";
  const maximumFractionDigits = view.appearance?.decimals ?? 2;
  const formatted = value === null ? empty : value.toLocaleString(language, { maximumFractionDigits, minimumFractionDigits: Math.min(maximumFractionDigits,view.appearance?.minimumDecimals ?? 0) });
  const detailText = typeof detail === "number" ? detail.toLocaleString(language, { maximumFractionDigits: view.detailDecimals ?? view.appearance?.decimals ?? 2 }) : detail === undefined || detail === null ? "" : String(detail);
  const detailSuffix = typeof detail === "number" && !Number.isInteger(detail) ? view.detailSuffixFractional || view.detailSuffix : view.detailSuffix;
  const note = detailText ? <span>{href ? <a href={href} className="hover:underline">{detailText}</a> : detailText}{detailSuffix && <span className={view.appearance?.detailEmphasis ? undefined : "font-normal text-fg-muted"}> {detailSuffix}</span>}</span> : null;
  const label = [formatted, view.suffix, detailText, detailSuffix].filter(Boolean).join(" ");
  const valueBox = useRef<HTMLDivElement>(null), valueText = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const box=valueBox.current, text=valueText.current;
    if(!box || !text) return;
    box.style.setProperty('--stat-value-scale','1');
    const measure=()=>{
      const natural=text.scrollWidth, available=box.getBoundingClientRect().width;
      if(!natural || !available) return;
      const next=Math.min(1,available/natural);
      box.style.setProperty('--stat-value-scale',String(next));box.style.height=`${text.offsetHeight*next}px`;
    };
    const observer=new ResizeObserver(measure);observer.observe(box);observer.observe(text);measure();
    return ()=>observer.disconnect();
  },[label,view.appearance?.valueSize,view.appearance?.detailSize]);
  return <Tooltip label={label}><div tabIndex={0} className={`flex min-h-0 flex-1 flex-col gap-1 ${view.appearance?.statAlign === "start" ? "justify-start" : "justify-center"}`} data-sql-stat>
    {placement === "above" && note && <p className="text-base font-semibold text-fg">{note}</p>}
    {value === null ? <p role="status" className="text-sm text-fg-muted">{empty}</p> : <div ref={valueBox} className="min-w-0 max-w-full" style={{'--stat-value-scale':1} as CSSProperties}><p ref={valueText} data-sql-stat-value style={{fontSize:view.appearance?.valueSize ?? (placement === "above" && note ? 14 : 30),transform:"scale(var(--stat-value-scale))",transformOrigin:"left top",lineHeight:view.appearance?.valueLineHeight ?? ((view.appearance?.valueSize ?? 30) <= 24 ? 4/3 : 1.2)}} className="w-max whitespace-nowrap font-semibold tabular-nums text-fg">{formatted}{view.suffix && <span className={`${view.suffixBelow ? "mt-1 block text-xs font-normal text-fg-muted" : view.suffixJoined ? "" : "ml-1 text-sm font-normal text-fg-muted"}`}>{view.suffix}</span>}{inline && note && <span className="ml-2 font-medium text-fg-subtle">{view.detailSeparator ?? "|"}<span style={{fontSize:view.appearance?.detailSize ?? 14,lineHeight:(view.appearance?.detailSize ?? 14)<=24 ? 4/3 : 1.2}} className={`ml-2 ${view.appearance?.detailEmphasis ? "font-semibold text-fg" : "font-normal text-fg-muted"}`}>{note}</span></span>}</p></div>}
    {placement === "below" && note && <p className="text-xs text-fg-muted">{note}</p>}
  </div></Tooltip>;
}
