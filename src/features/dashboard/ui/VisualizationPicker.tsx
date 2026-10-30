import { useState } from "react";
import { ChartColumnIcon, ChartBarIcon, ChartLineIcon, ChartPieIcon, ChartAreaIcon, ChartColumnStackedIcon, ChartBarStackedIcon, ChartScatterIcon, ChartNoAxesCombinedIcon, LayoutGridIcon, MapPinIcon, DonutIcon, FunnelIcon, WavesIcon, HashIcon, CircleDotIcon, AlignLeftIcon, GaugeIcon, PercentIcon, SearchIcon, TableIcon, TablePropertiesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, Stat, type ChartConfig, type ChartKind, type Item } from "@/features/item";
import type { Field } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import { Dropdown } from "@/shared/ui/dropdown";
import { Input } from "@/shared/ui/input";
import type { Visualization } from "../model/widget-editor";

const noop = () => {};
const groups: { key: "common" | "composition" | "analysis"; kinds: Visualization[] }[] = [
  { key: "common", kinds: ["records", "stat", "column", "bar", "line", "donut"] },
  { key: "composition", kinds: ["pie", "stack", "column100", "area100", "treemap", "funnel", "stream"] },
  { key: "analysis", kinds: ["area", "combo", "heatmap", "scatter", "bubble", "map", "pivot", "ratio", "goal", "heading"] },
];

export function VisualizationPicker({ value, onChange, allowed, compact = false }: { value: Visualization; onChange: (value: Visualization) => void; allowed?: readonly Visualization[] | undefined; compact?: boolean }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const name = (kind: Visualization) => kind === "records" ? t("dashboard.plainTable") : t((["records", "pivot", "ratio", "goal", "heading"].includes(kind) ? `dashboard.widget.${kind}` : `chart.kind.${kind}`) as "chart.kind.bar");
  if (compact) return <div className="builder-visualization-picker"><Dropdown ariaLabel={t("dashboard.visualization")} value={value} items={groups.flatMap((group) => group.kinds.filter((kind) => !allowed || allowed.includes(kind)).map((kind) => ({ value: kind, label: name(kind), group: group.key === "common" ? t("dashboard.visualization") : t(`dashboard.visualizations.${group.key}` as const), icon: <VisualizationThumbnail kind={kind} compact /> })))} onChange={(kind) => onChange(kind as Visualization)} /></div>;
  const tiles = (kinds: Visualization[]) => <div className="grid grid-cols-2 gap-1.5">{kinds.map((kind) => <button type="button" key={kind} role="radio" aria-checked={value === kind} aria-label={name(kind)} title={name(kind)} onClick={() => onChange(kind)} className={`flex h-11 min-w-0 items-center gap-2 rounded-lg border px-2 py-0.5 text-left text-xs transition-colors ${value === kind ? "border-accent bg-accent-subtle text-fg" : "border-border text-fg-muted hover:bg-surface-hover hover:text-fg"}`}><VisualizationThumbnail kind={kind} /><span className="line-clamp-2 min-w-0 leading-snug">{kind === "bar" ? t("dashboard.visualizations.bar") : kind === "donut" ? t("dashboard.visualizations.donut") : name(kind)}</span></button>)}</div>;
  return <section className="flex flex-col gap-2" aria-label={t("dashboard.visualization")}>
    <span className="text-sm font-medium">{t("dashboard.visualization")}</span>
    <div className="relative"><Icon as={SearchIcon} size={15} className="pointer-events-none absolute top-2.5 left-2.5 text-fg-subtle" /><Input aria-label={t("dashboard.searchVisualizations")} placeholder={t("dashboard.searchVisualizations")} className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div role="radiogroup" aria-label={t("dashboard.visualization")} className="flex flex-col gap-2">
      {groups.map((group) => { const kinds = group.kinds.filter((kind) => (!allowed || allowed.includes(kind)) && name(kind).toLocaleLowerCase().includes(search.toLocaleLowerCase())); if (!kinds.length) return null;
        return group.key === "common" ? <div key={group.key}>{tiles(kinds)}</div> : <details key={`${group.key}-${Boolean(search)}-${group.kinds.includes(value)}`} open={Boolean(search) || group.kinds.includes(value)} className="rounded-md border border-border px-2 py-1"><summary className="cursor-pointer text-xs font-medium text-fg-muted">{t(`dashboard.visualizations.${group.key}` as const)}</summary><div className="pt-2">{tiles(kinds)}</div></details>;
      })}
      {!groups.some((group) => group.kinds.some((kind) => (!allowed || allowed.includes(kind)) && name(kind).toLocaleLowerCase().includes(search.toLocaleLowerCase()))) && <p className="py-2 text-xs text-fg-muted">{t("dashboard.noVisualizations")}</p>}
    </div>
  </section>;
}

const specialIcons = { records: TableIcon, pivot: TablePropertiesIcon, ratio: PercentIcon, goal: GaugeIcon, heading: AlignLeftIcon };
const values = [7, 4, 3, 1];
const rows: Item[] = values.flatMap((value, index) => Array.from({ length: value }, (_, at) => ({ guid: `${index}-${at}`, category: ["A", "B", "C", "D"][index], split: at % 2 ? "Y" : "X", x: index + at / 5, y: value + at / 4, size: value, latitude: 30 + index * 9, longitude: 25 + at * 10, amount: value })));
const fields = ["category", "split", "x", "y", "size", "latitude", "longitude", "amount"].map((slug) => ({ id: slug, slug, label: slug, labels: {}, type: ["category", "split"].includes(slug) ? "SINGLE_LINE" : "NUMBER", options: new Map() }) as Field);

/** The actual renderer, scaled down: bar stays horizontal; pie/donut, bands and axes stay distinct. */
function VisualizationThumbnail({ kind, compact = false }: { kind: Visualization; compact?: boolean }) {
  if (compact) {
    const icons = { ...specialIcons, stat: HashIcon, column: ChartColumnIcon, bar: ChartBarIcon, line: ChartLineIcon, donut: DonutIcon, pie: ChartPieIcon, stack: ChartBarStackedIcon, column100: ChartColumnStackedIcon, area100: ChartAreaIcon, treemap: LayoutGridIcon, funnel: FunnelIcon, stream: WavesIcon, area: ChartAreaIcon, combo: ChartNoAxesCombinedIcon, heatmap: LayoutGridIcon, scatter: ChartScatterIcon, bubble: CircleDotIcon, map: MapPinIcon };
    return <span aria-hidden="true" data-visualization-icon={kind} className="inline-grid size-5 shrink-0 place-items-center text-chart-1"><Icon as={icons[kind]} size={18} /></span>;
  }
  if (kind === "stat") return <span aria-hidden="true" className="dashboard-metric-thumbnail grid h-9 w-14 shrink-0 place-items-center rounded bg-surface-soft"><Stat value={128} locale="en" compact /></span>;
  if (kind in specialIcons) return <span aria-hidden="true" className="grid h-9 w-14 shrink-0 place-items-center rounded bg-surface-soft text-chart-1"><Icon as={specialIcons[kind as keyof typeof specialIcons]} size={30} /></span>;
  const config: ChartConfig = { id: `preview-${kind}`, kind: kind as ChartKind, title: "", groupSlug: "category", groupBucket: "", splitSlug: ["stack", "column100", "area100", "heatmap"].includes(kind) ? "split" : "", splitBucket: "", aggregation: "count", valueSlug: "", width: 12, height: 1, xSlug: "x", ySlug: "y", ...(kind === "bubble" || kind === "map" ? { sizeSlug: "size" } : {}), latitudeSlug: "latitude", longitudeSlug: "longitude", ...(kind === "combo" ? { measures: [{ id: "n", field: "", aggregation: "count", display: "column" }, { id: "a", field: "amount", aggregation: "sum", display: "line", axis: "right" }] } : {}) };
  return <div aria-hidden="true" inert data-kind={kind} className="dashboard-chart-thumbnail pointer-events-none relative h-9 w-14 shrink-0 overflow-hidden rounded bg-surface-soft"><div className="absolute top-1 left-1.5 origin-top-left" style={{ width: 200, height: 144, transform: "scale(.22)" }}><ChartCard config={config} columns={fields} relations={[]} rows={rows} language="en" editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} hideHeader showRowCount={false} plain /></div></div>;
}
