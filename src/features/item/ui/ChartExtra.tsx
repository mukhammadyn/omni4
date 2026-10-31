import { Tooltip } from "@/shared/ui/tooltip";
import { useTranslation } from "react-i18next";
import type { ChartConfig, ChartSeries } from "../model/chart";
import { linearDomain, niceChartTicks, normalizedBands, scaleY, stackedBands, treemapRects, xyPoints, type XYPoint } from "../model/chart-geometry";
import type { Item } from "../model/types";

const colors = ["fill-chart-1 stroke-chart-1", "fill-chart-2 stroke-chart-2", "fill-chart-3 stroke-chart-3", "fill-chart-4 stroke-chart-4", "fill-chart-5 stroke-chart-5", "fill-chart-6 stroke-chart-6", "fill-chart-7 stroke-chart-7", "fill-chart-other stroke-chart-other"];
const color = (index: number) => colors[index] ?? colors[7];
const show = (n: number, locale: string) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

/** Columns, area and combination charts share scales; right-axis measures use an explicit second scale. */
export function CartesianChart({ config, series, locale, onPick, selectedKey }: { selectedKey?: string | undefined; onPick?: ((key: string) => void) | undefined; config: ChartConfig; series: ChartSeries; locale: string }) {
  const { t } = useTranslation();
  const normalized = config.kind === "column100" || config.kind === "area100";
  const area = config.kind === "area" || config.kind === "area100";
  const splits = series.splits.length ? series.splits : [{ key: "", label: "" }];
  const value = (at: number, key: string) => series.points[at]?.cells.size ? series.points[at]!.cells.get(key) ?? 0 : series.points[at]?.value ?? 0;
  const stacked = config.stacked === true && ["column", "area"].includes(config.kind) && splits.every((split) => split.axis !== "right");
  const bands = normalized ? normalizedBands(series) : stackedBands(series);
  const domain = (axis: "left" | "right") => normalized ? { min: 0, max: 100 } : stacked ? linearDomain(bands.flatMap((point) => point.bands.flatMap((band) => [band.start, band.end]))) : linearDomain(series.points.flatMap((_, at) => splits.filter((split) => (split.axis ?? "left") === axis).map((split) => value(at, split.key))));
  const initialLeft = domain("left"), right = domain("right"), ticks = config.appearance?.axisTicks ? niceChartTicks(initialLeft.min, initialLeft.max) : [initialLeft.min, initialLeft.max];
  const left = { min: ticks[0]!, max: ticks.at(-1)! };
  const format = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: config.appearance?.decimals ?? 2 });
  const fill = (index: number) => config.appearance?.neutral && index === 0 ? "fill-fg stroke-fg" : color(index);
  const n = series.points.length, step = 100 / Math.max(n, 1);
  const x = (at: number) => (at + 0.5) * step;
  const y = (v: number, axis?: string) => 4 + scaleY(v, axis === "right" ? right : left) * 0.92;
  const columnSplits = splits.filter((split) => config.kind !== "combo" || split.display !== "line");
  const pointsFor = (index: number, upper: boolean) => series.points.map((_, at) => `${x(at)},${y(normalized || stacked ? upper ? bands[at]!.bands[index]!.end : bands[at]!.bands[index]!.start : upper ? value(at, splits[index]!.key) : 0, splits[index]!.axis)}`);
  return <div className="flex h-full min-h-[150px] flex-col gap-1">
    <div className="flex min-h-0 flex-1 gap-2">
      <div style={config.appearance?.axisLabelWidth ? { width: config.appearance.axisLabelWidth } : undefined} className="flex w-14 shrink-0 flex-col justify-between text-right text-2xs tabular-nums text-fg-subtle">{[...ticks].reverse().map((tick) => <span key={tick}>{format(tick)}{normalized ? "%" : ""}</span>)}</div>
      <svg role="img" aria-label={t(`chart.kind.${config.kind}` as "chart.kind.column")} viewBox="0 0 100 100" preserveAspectRatio="none" className="min-w-0 flex-1 overflow-visible border-b border-chart-grid">
        {config.showGrid === true && (config.appearance?.axisTicks ? ticks.map((tick) => y(tick)) : [4, 27, 50, 73, 96]).map((position) => <line key={position} data-chart-grid x1="0" x2="100" y1={position} y2={position} className="stroke-chart-grid" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="stroke-chart-grid" vectorEffect="non-scaling-stroke" />
        {splits.map((split, index) => area ? <polygon key={split.key} points={[...pointsFor(index, true), ...pointsFor(index, false).reverse()].join(" ")} className={color(index)} fillOpacity={normalized ? 0.75 : 0.25} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : config.kind === "combo" && split.display === "line" ? <polyline key={split.key} points={pointsFor(index, true).join(" ")} className={color(index)} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : series.points.map((point, at) => {
          const band = bands[at]!.bands[index]!, top = y(normalized || stacked ? band.end : value(at, split.key), split.axis), bottom = y(normalized || stacked ? band.start : 0, split.axis);
          const width = normalized || stacked ? step * ((config.appearance?.columnWidth ?? 72) / 100) : step * ((config.appearance?.columnWidth ?? 72) / 100) / Math.max(columnSplits.length, 1);
          const offset = normalized || stacked ? 0 : columnSplits.indexOf(split) * width;
          const markX = at * step + step * (1 - (config.appearance?.columnWidth ?? 72) / 100) / 2 + offset;
          const markWidth = width * (normalized || stacked || columnSplits.length === 1 ? 1 : 0.92);
          const label = `${point.label}${split.label ? ` · ${split.label}` : ""}: ${show(value(at, split.key), locale)}${normalized ? ` (${show(band.end - band.start, locale)}%)` : ""}`;
          return <Tooltip as="g" key={`${split.key}-${point.key}`} label={label}><g data-chart-mark role={onPick ? "button" : undefined} tabIndex={0} aria-label={label} aria-pressed={onPick ? selectedKey === point.key : undefined} onClick={() => onPick?.(point.key)} onKeyDown={event => { if (onPick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPick(point.key); } }} style={onPick ? { cursor: "pointer" } : undefined} className="outline-none focus-visible:stroke-accent"><rect x={markX} y={Math.min(top,bottom)} width={markWidth} height={Math.abs(bottom-top)} rx={config.appearance?.rounded ? 0.7 : 0} ry={config.appearance?.rounded ? 1.5 : 0} className={selectedKey !== undefined && selectedKey !== point.key ? "fill-border-strong stroke-border-strong" : fill(index)} /><rect x={markX} y={Math.min(top,bottom)} width={markWidth} height={Math.max(4,Math.abs(bottom-top))} fill="transparent" /></g></Tooltip>;
        }))}
        {(area || config.kind === "combo") && series.points.map((point, at) => <Tooltip as="g" key={`point-${point.key}`} label={`${point.label}: ${splits.map(split => `${split.label ? `${split.label}: ` : ""}${show(value(at, split.key), locale)}`).join(" · ")}`}><rect x={at * step} y={0} width={step} height={100} fill="transparent" role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-label={point.label} aria-pressed={onPick ? selectedKey === point.key : undefined} onClick={() => onPick?.(point.key)} onKeyDown={event => { if (onPick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPick(point.key); } }} /></Tooltip>)}
      </svg>
      {splits.some((split) => split.axis === "right") && <div className="flex w-14 shrink-0 flex-col justify-between text-2xs tabular-nums text-fg-subtle"><span>{show(right.max, locale)}</span><span>{show(right.min, locale)}</span></div>}
    </div>
    <div style={config.appearance?.axisLabelWidth ? { paddingLeft: config.appearance.axisLabelWidth + 8 } : undefined} className="flex pl-16 text-2xs text-fg-muted">{series.points.filter((_, at) => config.appearance?.axisTicks || onPick || n <= 8 || at === 0 || at === n - 1).map((point) => <span key={point.key} role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} onClick={onPick ? () => onPick(point.key) : undefined} onKeyDown={onPick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(point.key); } } : undefined} style={{ width: `${step}%` }} className={`min-w-0 truncate text-center ${onPick ? "cursor-pointer" : ""}`} title={point.label}>{point.label}</span>)}</div>
  </div>;
}

export function PieChart({ series, locale, showLegend = true, appearance, onPick, selectedKey }: { series: ChartSeries; locale: string; showLegend?: boolean; appearance?: ChartConfig["appearance"] | undefined; onPick?: ((key: string) => void) | undefined; selectedKey?: string | undefined }) {
  let start = -Math.PI / 2;
  const bottom = appearance?.legendPosition === "bottom", size = appearance?.pieSize ?? 144;
  const paint = (index: number, key: string) => selectedKey !== undefined && selectedKey !== key ? "var(--color-border-strong)" : appearance?.palette === "cool" && index < 3 ? `var(--color-chart-cool-${index + 1})` : `var(--color-chart-${index < 7 ? index + 1 : "other"})`;
  const pick = (key: string) => onPick?.(key);
  return <div data-chart-pie className={`flex h-full min-w-0 items-center justify-center gap-4 ${bottom ? "flex-col" : "flex-wrap"}`}><svg viewBox="0 0 100 100" style={{ width: size, maxWidth: "100%", maxHeight: bottom ? "calc(100% - 40px)" : "100%", aspectRatio: "1", flexShrink: 1 }} role="img" aria-label="Pie chart">{series.points.filter((point) => point.value > 0).map((point) => {
    const index = series.points.indexOf(point), angle = point.value / series.total * Math.PI * 2, end = start + angle;
    const path = `M50,50 L${50 + 48 * Math.cos(start)},${50 + 48 * Math.sin(start)} A48,48 0 ${angle > Math.PI ? 1 : 0},1 ${50 + 48 * Math.cos(end)},${50 + 48 * Math.sin(end)} Z`; start = end;
    const title = `${point.label}: ${show(point.value, locale)} (${show(point.value / series.total * 100, locale)}%)`;
    return <Tooltip as="g" key={point.key} label={title}><g role={onPick ? "button" : undefined} tabIndex={0} aria-label={title} aria-pressed={onPick ? selectedKey === point.key : undefined} onClick={() => pick(point.key)} onKeyDown={event => { if (onPick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); pick(point.key); } }} className="outline-none focus-visible:stroke-accent" style={{ fill: paint(index, point.key), cursor: onPick ? "pointer" : undefined }}>{angle >= Math.PI * 2 - 1e-8 ? <circle cx="50" cy="50" r="48" /> : <path d={path} />}</g></Tooltip>;
  })}</svg><ul className={showLegend ? `min-w-0 text-sm text-fg-muted ${bottom ? "flex flex-wrap justify-center gap-x-5 gap-y-2" : "flex-1"}` : "sr-only"}>{series.points.map((point, index) => <li key={point.key}><button type="button" disabled={!onPick} aria-pressed={onPick ? selectedKey === point.key : undefined} onClick={() => pick(point.key)} className="flex items-center gap-2 text-left disabled:opacity-100"><span className="size-2.5 shrink-0 rounded-full" style={{ background: paint(index, point.key) }} /><span>{point.label}</span><span className="tabular-nums">{appearance?.legendPercent ? `${(series.total ? point.value / series.total * 100 : 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : show(point.value, locale)}</span></button></li>)}</ul></div>;
}

export function TreemapChart({ series, locale }: { series: ChartSeries; locale: string }) {
  const rectangles = treemapRects(series);
  return <div className="relative h-full min-h-[160px]" role="img" aria-label="Treemap">{rectangles.map((rect, index) => <Tooltip key={rect.key} label={`${rect.label}: ${show(rect.value, locale)}`}><div tabIndex={0} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }} className="absolute overflow-hidden border border-surface p-1 text-2xs text-fg"><svg className="absolute inset-0 size-full opacity-25" aria-hidden="true"><rect width="100%" height="100%" className={color(index)} /></svg><span className="relative">{rect.label}<br />{show(rect.value, locale)}</span></div></Tooltip>)}</div>;
}

export function XYChart({ rows, config, locale }: { rows: Item[]; config: ChartConfig; locale: string }) {
  const { t } = useTranslation();
  const { points, excluded } = xyPoints(rows, config);
  const map = config.kind === "map", bubble = config.kind === "bubble" || (map && Boolean(config.sizeSlug));
  const xd = map ? { min: -180, max: 180 } : linearDomain(points.map((point) => point.x), false);
  const yd = map ? { min: -90, max: 90 } : linearDomain(points.map((point) => point.y), false);
  const maxSize = Math.max(...points.map((point) => point.size), 1);
  const location = (point: XYPoint) => ({ x: 4 + (point.x - xd.min) / (xd.max - xd.min) * 92, y: 4 + scaleY(point.y, yd) * 0.92 });
  return <div className="flex h-full min-h-[160px] flex-col gap-1">
    {map && <p className="text-2xs text-fg-muted">{t("chart.coordinateMapHint")}</p>}
    {!points.length ? <p className="text-sm text-fg-muted">{t("pivot.empty")}</p> : <svg viewBox="0 0 400 240" className="min-h-0 w-full flex-1 border border-chart-grid" role="img" aria-label={t(`chart.kind.${config.kind}` as "chart.kind.scatter")}>
      {map && [25, 50, 75].map((p) => <g key={p} className="stroke-chart-grid"><line x1={p * 4} x2={p * 4} y1="0" y2="240" /><line x1="0" x2="400" y1={p * 2.4} y2={p * 2.4} /></g>)}
      {points.map((point) => { const p = location(point); return <Tooltip as="g" key={point.key} label={`${point.label}: ${show(point.x, locale)}, ${show(point.y, locale)}${bubble ? ` · ${show(point.size, locale)}` : ""}`}><circle cx={p.x * 4} cy={p.y * 2.4} r={bubble ? Math.sqrt(point.size / maxSize) * 15 : 3} className="fill-chart-1/55 stroke-chart-1" strokeWidth="1" /></Tooltip>; })}
    </svg>}
    <div className="flex justify-between text-2xs text-fg-subtle"><span>{config.kind === "map" ? config.longitudeSlug : config.xSlug}: {show(xd.min, locale)} — {show(xd.max, locale)}</span><span>{config.kind === "map" ? config.latitudeSlug : config.ySlug}: {show(yd.min, locale)} — {show(yd.max, locale)}</span></div>
    {excluded > 0 && <p className="text-2xs text-fg-muted">{t("chart.excludedPoints", { count: excluded })}</p>}
  </div>;
}
