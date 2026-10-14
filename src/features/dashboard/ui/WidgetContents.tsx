import { useTranslation } from "react-i18next";
import { ChartCard, Stat, chartSeries, valueLabelOf, type Filters, type Sort } from "@/features/item";
import type { useWidgetData } from "../api/widget-data";
import type { Widget } from "../model/dashboard";
import { chartSelection, widgetReady } from "../model/widget-advanced";
import { DashboardPivot, GoalWidget, RatioWidget } from "./AdvancedWidgetContents";
import { RecordsTable } from "./RecordsTable";
import { currencyGroups } from "../model/currency";

const noop = () => {};
export function WidgetContents({ widget, data, language, editing = false, page = 1, sorts = [], onPage = noop, onSorts = noop, onChange = noop, onSelect }: {
  widget: Widget; data: ReturnType<typeof useWidgetData>; language: string; editing?: boolean; page?: number; sorts?: Sort[];
  onPage?: (page: number) => void; onSorts?: (sorts: Sort[]) => void; onChange?: (patch: Partial<Widget>) => void; onSelect?: (filter: Filters) => void;
}) {
  const { t, i18n } = useTranslation();
  if (widget.type === "heading") return <p className="whitespace-pre-wrap py-3 text-base text-fg-muted">{widget.body}</p>;
  if (!widget.tableSlug && !widget.datasetId) return <p className="text-sm text-fg-muted">{t("dashboard.pickTableFirst")}</p>;
  if (data.denied || data.forbidden) return <p className="text-sm text-fg-muted">{t("dashboard.noWidgetAccess")}</p>;
  if (data.error) return <div role="alert" className="text-sm text-danger">{t(data.error as "dashboard.filterConflict", { defaultValue: data.error })}<button type="button" className="ml-2 underline" onClick={data.refetch}>{t("dashboard.refresh")}</button></div>;
  if (data.loading || !data.ready) return <p role="status" className="text-sm text-fg-muted">{t("common.loading")}</p>;
  if (widget.type === "records") return <RecordsTable widget={widget} fields={data.schema.fields} relations={data.schema.relations} rows={data.rows} count={data.count} page={page} sorts={sorts} language={language} editing={editing} onPage={onPage} onSorts={onSorts} onChange={onChange} />;
  if (widget.type && ["breakdown", "transitions"].includes(widget.type)) return <p className="text-sm text-fg-muted">{t("dashboard.widgetUnsupported")}</p>;
  if (widget.type && ["ratio", "goal", "pivot"].includes(widget.type) && !widgetReady(widget, data.schema.fields)) return <p className="text-sm text-fg-muted">{t(widget.type === "goal" ? "dashboard.goalPickTarget" : "pivot.pick")}</p>;
  const groups = currencyGroups(data.rows, data.previous, data.currencySlug);
  if (data.currencySlug && widget.kind === "stat" && (!widget.type || widget.type === "chart")) return <dl className="grid gap-1">{groups.map((group) => <div key={group.currency} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0"><dt className="text-sm font-medium text-fg-muted">{group.currency || t("dashboard.currencyMissing")}</dt><dd>{group.valid ? <Stat compact value={chartSeries(group.rows, widget).points[0]?.value ?? 0} previous={group.previous && chartSeries(group.previous, widget).points[0]?.value} locale={i18n.language} /> : <p className="text-xs text-fg-muted">{t("dashboard.currencyNotCalculated", { count: group.rows.length })}</p>}</dd></div>)}</dl>;
  return <div className="flex min-h-0 flex-1 flex-col gap-4">{groups.map((group) => <div key={group.currency} className="min-h-[150px] flex-1">
    {data.currencySlug && <p className="mb-2 text-xs font-medium text-fg-muted">{group.currency || t("dashboard.currencyMissing")}</p>}
    {!group.valid ? <p className="text-sm text-fg-muted">{t("dashboard.currencyNotCalculated", { count: group.rows.length })}</p> : widget.type === "pivot" ? <DashboardPivot widget={widget} fields={data.schema.fields} rows={group.rows} count={data.count} language={language} editing={editing} onChange={onChange} /> : widget.type === "ratio" ? <RatioWidget widget={widget} rows={group.rows} /> : widget.type === "goal" ? <GoalWidget widget={widget} value={widget.aggregation === "count" ? data.count : chartSeries(group.rows, { ...widget, kind: "stat", measures: [] }).total} /> : <ChartCard config={widget} columns={data.schema.fields} relations={data.schema.relations} rows={group.rows} previous={group.previous} exact={data.exact} language={language} editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} showRowCount={false} hideHeader plain />}
  </div>)}{widget.interaction && onSelect && <ChartSelectionControls widget={widget} data={data} language={language} onSelect={onSelect} />}</div>;
}

export function WidgetStatus({ widget, data, compact = false }: { widget: Widget; data: ReturnType<typeof useWidgetData>; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  if ((!widget.tableSlug && !widget.datasetId) || data.loading || data.error || data.denied || data.forbidden || !data.ready) return null;
  if (widget.type === "heading") return null;
  const exactCount = (!widget.type || widget.type === "chart" || widget.type === "goal") && widget.kind === "stat" && widget.aggregation === "count";
  return <div className="flex flex-wrap gap-x-2 gap-y-1 text-2xs text-fg-muted" role="status">
    {data.dataset && <span>{data.dataset.name}</span>}
    <span>{exactCount ? t("dashboard.exactCount") : widget.type === "records" ? t("dashboard.recordCount", { count: data.count }) : data.rows.length < data.count ? t("dashboard.sampled", { shown: data.rows.length, total: data.count }) : t("dashboard.complete", { count: data.rows.length })}</span>
    {!compact && (data.refreshing ? <span>{t("dashboard.refreshing")}</span> : data.updatedAt > 0 && <span>{t("dashboard.updatedAt", { time: new Date(data.updatedAt).toLocaleTimeString(i18n.language) })}</span>)}
    {data.unanswered.length > 0 && <span>{t("dashboard.unanswered", { names: data.unanswered.map((filter) => filter.label || t("dashboard.period")).join(", ") })}</span>}
  </div>;
}

function ChartSelectionControls({ widget, data, language, onSelect }: { widget: Widget; data: ReturnType<typeof useWidgetData>; language: string; onSelect: (filter: Filters) => void }) {
  const { t } = useTranslation();
  const field = data.schema.fields.find((field) => field.slug === widget.groupSlug);
  const points = chartSeries(data.rows, { ...widget, groupBucket: "", splitSlug: "" }, { ...(field ? { group: { label: valueLabelOf(field, data.schema.relations, language) } } : {}) }).points;
  return <div className="border-t border-border pt-2"><p className="mb-1 text-2xs text-fg-muted">{t(widget.interaction?.scope === "dashboard" ? "dashboard.interactionDashboardHint" : "dashboard.interactionCardHint")}</p><div className="flex flex-wrap gap-1">{points.filter((point) => chartSelection(widget, point.key, data.schema.fields)).map((point) => <button key={point.key} type="button" className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-accent-subtle" onClick={() => { const filter = chartSelection(widget, point.key, data.schema.fields); if (filter) onSelect(filter); }}>{point.label}</button>)}</div></div>;
}
