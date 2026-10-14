import { useTranslation } from "react-i18next";
import type { ChartConfig, ChartSeries } from "../model/chart";
import { linearDomain, normalizedBands, scaleY, treemapRects, xyPoints, type XYPoint } from "../model/chart-geometry";
import type { Item } from "../model/types";

const colors = ["fill-chart-1 stroke-chart-1", "fill-chart-2 stroke-chart-2", "fill-chart-3 stroke-chart-3", "fill-chart-4 stroke-chart-4", "fill-chart-5 stroke-chart-5", "fill-chart-6 stroke-chart-6", "fill-chart-7 stroke-chart-7", "fill-chart-other stroke-chart-other"];
const color = (index: number) => colors[index] ?? colors[7];
const show = (n: number, locale: string) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

/** Columns, area and combination charts share scales; right-axis measures use an explicit second scale. */
export function CartesianChart({ config, series, locale }: { config: ChartConfig; series: ChartSeries; locale: string }) {
  const { t } = useTranslation();
  const normalized = config.kind === "column100" || config.kind === "area100";
  const area = config.kind === "area" || config.kind === "area100";
  const splits = series.splits.length ? series.splits : [{ key: "", label: "" }];
  const value = (at: number, key: string) => series.points[at]?.cells.size ? series.points[at]!.cells.get(key) ?? 0 : series.points[at]?.value ?? 0;
  const bands = normalizedBands(series);
  const domain = (axis: "left" | "right") => normalized ? { min: 0, max: 100 } : linearDomain(series.points.flatMap((_, at) => splits.filter((split) => (split.axis ?? "left") === axis).map((split) => value(at, split.key))));
  const left = domain("left"), right = domain("right");
  const n = series.points.length, step = 100 / Math.max(n, 1);
  const x = (at: number) => (at + 0.5) * step;
  const y = (v: number, axis?: string) => 4 + scaleY(v, axis === "right" ? right : left) * 0.92;
  const columnSplits = splits.filter((split) => config.kind !== "combo" || split.display !== "line");
  const pointsFor = (index: number, upper: boolean) => series.points.map((_, at) => `${x(at)},${y(normalized ? upper ? bands[at]!.bands[index]!.end : bands[at]!.bands[index]!.start : upper ? value(at, splits[index]!.key) : 0, splits[index]!.axis)}`);
  return <div className="flex h-full min-h-[150px] flex-col gap-1">
    <div className="flex min-h-0 flex-1 gap-2">
      <div className="flex w-14 shrink-0 flex-col justify-between text-right text-2xs tabular-nums text-fg-subtle"><span>{show(left.max, locale)}{normalized ? "%" : ""}</span><span>{show(left.min, locale)}{normalized ? "%" : ""}</span></div>
      <svg role="img" aria-label={t(`chart.kind.${config.kind}` as "chart.kind.column")} viewBox="0 0 100 100" preserveAspectRatio="none" className="min-w-0 flex-1 overflow-visible border-b border-chart-grid">
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="stroke-chart-grid" vectorEffect="non-scaling-stroke" />
        {splits.map((split, index) => area ? <polygon key={split.key} points={[...pointsFor(index, true), ...pointsFor(index, false).reverse()].join(" ")} className={color(index)} fillOpacity={normalized ? 0.75 : 0.25} strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{split.label}: {series.points.map((point, at) => `${point.label}: ${show(value(at, split.key), locale)}`).join("; ")}</title></polygon> : config.kind === "combo" && split.display === "line" ? <polyline key={split.key} points={pointsFor(index, true).join(" ")} className={color(index)} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{split.label}</title></polyline> : series.points.map((point, at) => {
          const band = bands[at]!.bands[index]!, top = y(normalized ? band.end : value(at, split.key), split.axis), bottom = y(normalized ? band.start : 0, split.axis);
          const width = normalized ? step * 0.72 : step * 0.72 / Math.max(columnSplits.length, 1);
          const offset = normalized ? 0 : columnSplits.indexOf(split) * width;
          return <rect key={`${split.key}-${point.key}`} x={at * step + step * 0.14 + offset} y={Math.min(top, bottom)} width={width * (normalized ? 1 : 0.92)} height={Math.abs(bottom - top)} className={color(index)}><title>{point.label}{split.label ? ` · ${split.label}` : ""}: {show(value(at, split.key), locale)}{normalized ? ` (${show(band.end - band.start, locale)}%)` : ""}</title></rect>;
        }))}
      </svg>
      {splits.some((split) => split.axis === "right") && <div className="flex w-14 shrink-0 flex-col justify-between text-2xs tabular-nums text-fg-subtle"><span>{show(right.max, locale)}</span><span>{show(right.min, locale)}</span></div>}
    </div>
    <div className="flex justify-between gap-2 pl-16 text-2xs text-fg-subtle">{series.points.filter((_, at) => n <= 8 || at === 0 || at === n - 1).map((point) => <span key={point.key} className="min-w-0 truncate" title={point.label}>{point.label}</span>)}</div>
  </div>;
}

export function PieChart({ series, locale }: { series: ChartSeries; locale: string }) {
  let start = -Math.PI / 2;
  return <div className="flex flex-wrap items-center gap-4"><svg viewBox="0 0 100 100" className="size-36 shrink-0" role="img" aria-label="Pie chart">{series.points.filter((point) => point.value > 0).map((point, index) => {
    const angle = point.value / series.total * Math.PI * 2, end = start + angle;
    const path = `M50,50 L${50 + 48 * Math.cos(start)},${50 + 48 * Math.sin(start)} A48,48 0 ${angle > Math.PI ? 1 : 0},1 ${50 + 48 * Math.cos(end)},${50 + 48 * Math.sin(end)} Z`; start = end;
    const title = `${point.label}: ${show(point.value, locale)} (${show(point.value / series.total * 100, locale)}%)`;
    return angle >= Math.PI * 2 - 1e-8 ? <circle key={point.key} cx="50" cy="50" r="48" className={color(index)}><title>{title}</title></circle> : <path key={point.key} d={path} className={color(index)} strokeWidth="0.5"><title>{title}</title></path>;
  })}</svg><ul className="min-w-0 flex-1 text-xs text-fg-muted">{series.points.map((point) => <li key={point.key} className="flex justify-between gap-2"><span className="truncate">{point.label}</span><span className="tabular-nums">{show(point.value, locale)}</span></li>)}</ul></div>;
}

export function TreemapChart({ series, locale }: { series: ChartSeries; locale: string }) {
  const rectangles = treemapRects(series);
  return <div className="relative h-full min-h-[160px]" role="img" aria-label="Treemap">{rectangles.map((rect, index) => <div key={rect.key} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }} className="absolute overflow-hidden border border-surface p-1 text-2xs text-fg" title={`${rect.label}: ${show(rect.value, locale)}`}><svg className="absolute inset-0 size-full opacity-25" aria-hidden="true"><rect width="100%" height="100%" className={color(index)} /></svg><span className="relative">{rect.label}<br />{show(rect.value, locale)}</span></div>)}</div>;
}

export function XYChart({ rows, config, locale }: { rows: Item[]; config: ChartConfig; locale: string }) {
  const { t } = useTranslation();
  const { points, excluded } = xyPoints(rows, config);
  const map = config.kind === "map", bubble = config.kind === "bubble" || Boolean(config.sizeSlug);
  const xd = map ? { min: -180, max: 180 } : linearDomain(points.map((point) => point.x), false);
  const yd = map ? { min: -90, max: 90 } : linearDomain(points.map((point) => point.y), false);
  const maxSize = Math.max(...points.map((point) => point.size), 1);
  const location = (point: XYPoint) => ({ x: 4 + (point.x - xd.min) / (xd.max - xd.min) * 92, y: 4 + scaleY(point.y, yd) * 0.92 });
  return <div className="flex h-full min-h-[160px] flex-col gap-1">
    {map && <p className="text-2xs text-fg-muted">{t("chart.coordinateMapHint")}</p>}
    {!points.length ? <p className="text-sm text-fg-muted">{t("pivot.empty")}</p> : <svg viewBox="0 0 400 240" className="min-h-0 w-full flex-1 border border-chart-grid" role="img" aria-label={t(`chart.kind.${config.kind}` as "chart.kind.scatter")}>
      {map && [25, 50, 75].map((p) => <g key={p} className="stroke-chart-grid"><line x1={p * 4} x2={p * 4} y1="0" y2="240" /><line x1="0" x2="400" y1={p * 2.4} y2={p * 2.4} /></g>)}
      {points.map((point) => { const p = location(point); return <circle key={point.key} cx={p.x * 4} cy={p.y * 2.4} r={bubble ? Math.sqrt(point.size / maxSize) * 15 : 3} className="fill-chart-1/55 stroke-chart-1" strokeWidth="1"><title>{point.label}: {show(point.x, locale)}, {show(point.y, locale)}{bubble ? ` · ${show(point.size, locale)}` : ""}</title></circle>; })}
    </svg>}
    <div className="flex justify-between text-2xs text-fg-subtle"><span>{config.kind === "map" ? config.longitudeSlug : config.xSlug}: {show(xd.min, locale)} — {show(xd.max, locale)}</span><span>{config.kind === "map" ? config.latitudeSlug : config.ySlug}: {show(yd.min, locale)} — {show(yd.max, locale)}</span></div>
    {excluded > 0 && <p className="text-2xs text-fg-muted">{t("chart.excludedPoints", { count: excluded })}</p>}
  </div>;
}
