import { Tooltip } from "@/shared/ui/tooltip";
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
  return <Tooltip label={label}><div tabIndex={0} className={`flex min-h-0 flex-1 flex-col gap-1 ${view.appearance?.statAlign === "start" ? "justify-start" : "justify-center"}`} data-sql-stat>
    {placement === "above" && note && <p className="text-base font-semibold text-fg">{note}</p>}
    {value === null ? <p role="status" className="text-sm text-fg-muted">{empty}</p> : <p style={view.appearance?.valueSize || view.appearance?.valueLineHeight ? {fontSize:view.appearance.valueSize,lineHeight:view.appearance.valueLineHeight ?? ((view.appearance.valueSize ?? 30) <= 24 ? 4/3 : 1.2)} : undefined} className={`${placement === "above" && note ? "text-sm" : "text-3xl font-semibold"} tabular-nums text-fg`}>{formatted}{view.suffix && <span className={`${view.suffixBelow ? "mt-1 block text-xs font-normal text-fg-muted" : view.suffixJoined ? "" : "ml-1 text-sm font-normal text-fg-muted"}`}>{view.suffix}</span>}{inline && note && <span className="ml-2 text-lg font-medium text-fg-subtle">{view.detailSeparator ?? "|"}<span style={{fontSize:view.appearance?.detailSize ?? 14,lineHeight:(view.appearance?.detailSize ?? 14)<=24 ? 4/3 : 1.2}} className={`ml-2 ${view.appearance?.detailEmphasis ? "font-semibold text-fg" : "font-normal text-fg-muted"}`}>{note}</span></span>}</p>}
    {placement === "below" && note && <p className="text-xs text-fg-muted">{note}</p>}
  </div></Tooltip>;
}
