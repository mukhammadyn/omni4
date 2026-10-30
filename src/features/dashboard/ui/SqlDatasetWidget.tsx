import { useEffect, useRef } from "react";
import type { SqlSelection } from "../model/sql-result-filters";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { SqlDatasetRunner } from "./SqlDatasetRunner";

export function SqlDatasetWidget({ dataset, widget, menuId, editing = false, onChange, selections = [], selectedKey, onPick, onHeight }: { onHeight?: ((height: number) => void) | undefined; selectedKey?: string | undefined; selections?: SqlSelection[]; onPick?: ((key: string) => void) | undefined; dataset: Dataset; widget: Widget; menuId: string; editing?: boolean; onChange?: ((patch: Partial<Widget>) => void) | undefined }) {
  const root = useRef<HTMLDivElement>(null);
  const fit = widget.type === "records" && widget.sqlTableFitContent === true;
  useEffect(() => {
    const element = root.current;
    if (!fit || !element || !onHeight) return;
    const measure = () => onHeight(Math.ceil(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [fit, onHeight]);
  if (dataset.source.kind !== "sql") return null;
  return <div ref={root} className={`flex min-h-0 min-w-0 flex-col gap-2 ${fit ? "shrink-0" : "flex-1"}`}>{widget.body && <p className="text-xs text-fg-muted">{widget.body}</p>}<SqlDatasetRunner selectedKey={selectedKey} showViewerFilters={widget.sqlShowViewerFilters} filters={widget.filters} selections={widget.sqlReceiveSelections ? selections : []} onPick={widget.sqlSelectionField ? onPick : undefined} refreshInterval={widget.refreshInterval} fieldPresentation={widget.fieldPresentation} displayOnly={!editing} menuId={menuId} sql={dataset.source.sql} parameters={dataset.source.parameters} autoRun presentation={{ fitContent: fit, type: widget.type === "records" ? "table" : "chart", kind: widget.kind, group: widget.groupSlug, value: widget.valueSlug, split: widget.splitSlug, columns: widget.columns, comfortable: widget.sqlTableComfortable, rowHeight: widget.sqlRowHeight, columnWidths: widget.columnWidths, linkField: widget.sqlLinkField, linkLabel: widget.sqlLinkLabel, linkTemplate: widget.sqlLinkTemplate, appearance: widget.appearance, sorts: widget.sorts, pageSize: widget.pageSize, paginationTop: widget.sqlPaginationTop, detailField: widget.sqlDetailField, suffix: widget.sqlSuffix, suffixBelow: widget.sqlSuffixBelow, showLegend: widget.showLegend, showGrid: widget.showGrid, stacked: widget.stacked }} onPresentation={editing && onChange ? (next) => onChange({ type: next.type === "table" ? "records" : "chart", kind: next.kind, groupSlug: next.group, valueSlug: next.value, splitSlug: next.split, aggregation: "sum", ...(next.columns ? { columns: next.columns } : {}) }) : undefined} /></div>;
}
