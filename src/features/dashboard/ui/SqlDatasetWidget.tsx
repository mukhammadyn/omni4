import { useCallback, useEffect, useRef } from "react";
import type { SqlSelection } from "../model/sql-result-filters";
import type { QueryResult } from "../model/query-result";
import type { Dataset } from "../model/datasets";
import { widgetAutoHeight } from "../model/widget-layout";
import type { Widget } from "../model/dashboard";
import { SqlDatasetRunner } from "./SqlDatasetRunner";

export function SqlDatasetWidget({ dataset, widget, menuId, editing = false, onChange, selections = [], selectedKey, selectedSeries, onPick, onHeight, onTitle }: { selectedSeries?: string | undefined; onTitle?: ((title: string | undefined) => void) | undefined; onHeight?: ((height: number) => void) | undefined; selectedKey?: string | undefined; selections?: SqlSelection[]; onPick?: ((key: string, series?: string, label?: string) => void) | undefined; dataset: Dataset; widget: Widget; menuId: string; editing?: boolean; onChange?: ((patch: Partial<Widget>) => void) | undefined }) {
  const root = useRef<HTMLDivElement>(null);
  const fit = widgetAutoHeight(widget) || widget.type === "records" && widget.sqlTableFitContent === true;
  useEffect(() => {
    const element = root.current;
    if (!fit || !element || !onHeight) return;
    const measure = () => onHeight(Math.ceil(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [fit, onHeight]);
  const titleFromResult = useCallback((result: QueryResult | null) => {
    const value = widget.sqlTitleField && result?.rows.length === 1 ? result.rows[0]?.[widget.sqlTitleField] : undefined;
    onTitle?.(value !== undefined && value !== null ? String(value).slice(0,200) : undefined);
  },[widget.sqlTitleField,onTitle]);
  if (dataset.source.kind !== "sql") return null;
  return <div ref={root} className={`flex min-h-0 min-w-0 flex-col gap-2 ${fit ? "shrink-0" : "flex-1"}`}>{widget.body && <p className="text-xs text-fg-muted">{widget.body}</p>}<SqlDatasetRunner onResult={titleFromResult} selectedSeries={selectedSeries} selectedKey={selectedKey} showViewerFilters={widget.sqlShowViewerFilters} filters={widget.filters} selections={widget.sqlReceiveSelections ? selections : []} onPick={widget.sqlSelectionField || Object.keys(widget.sqlSelectionRules ?? {}).length ? onPick : undefined} refreshInterval={widget.refreshInterval} fieldPresentation={widget.fieldPresentation} displayOnly={!editing} menuId={menuId} sql={dataset.source.sql} parameters={dataset.source.parameters} autoRun presentation={{ progressField:widget.sqlProgressField, progressMax:widget.sqlProgressMax, progressSuffix:widget.sqlProgressSuffix, suffixJoined: widget.sqlSuffixJoined, detailSuffixFractional: widget.sqlDetailSuffixFractional, detailDecimals: widget.sqlDetailDecimals, quickFilterField: widget.sqlQuickFilterField, quickFilterStyle: widget.sqlQuickFilterStyle, searchField: widget.sqlSearchField, selectionValueField: widget.sqlSelectionValueField, records: widget.sqlRecords, aggregation: widget.aggregation, detailPlacement: widget.sqlDetailPlacement, detailSuffix: widget.sqlDetailSuffix, detailSeparator: widget.sqlDetailSeparator, measures: widget.measures, fitContent: fit, tableFrame: widget.sqlTableFrame, type: widget.type === "records" ? "table" : "chart", kind: widget.kind, group: widget.groupSlug, value: widget.valueSlug, split: widget.splitSlug, columns: widget.columns, comfortable: widget.sqlTableComfortable, rowHeight: widget.sqlRowHeight, columnWidths: widget.columnWidths, linkField: widget.sqlLinkField, linkLabel: widget.sqlLinkLabel, linkTemplate: widget.sqlLinkTemplate, appearance: widget.appearance, sorts: widget.sorts, pageSize: widget.pageSize, paginationTop: widget.sqlPaginationTop, detailField: widget.sqlDetailField, suffix: widget.sqlSuffix, suffixBelow: widget.sqlSuffixBelow, showLegend: widget.showLegend, showGrid: widget.showGrid, stacked: widget.stacked }} onPresentation={editing && onChange ? (next) => onChange({ type: next.type === "table" ? "records" : "chart", kind: next.kind, groupSlug: next.group, valueSlug: next.value, splitSlug: next.split, aggregation: "sum", ...(next.columns ? { columns: next.columns } : {}) }) : undefined} /></div>;
}
