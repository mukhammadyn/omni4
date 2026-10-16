import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { SqlDatasetRunner } from "./SqlDatasetRunner";

export function SqlDatasetWidget({ dataset, widget, menuId, editing = false, onChange }: { dataset: Dataset; widget: Widget; menuId: string; editing?: boolean; onChange?: ((patch: Partial<Widget>) => void) | undefined }) {
  if (dataset.source.kind !== "sql") return null;
  return <div className="flex min-w-0 flex-col gap-2"><SqlDatasetRunner menuId={menuId} sql={dataset.source.sql} parameters={dataset.source.parameters} autoRun presentation={{ type: widget.type === "records" ? "table" : "chart", kind: widget.kind, group: widget.groupSlug, value: widget.valueSlug, split: widget.splitSlug, columns: widget.columns }} onPresentation={editing && onChange ? (next) => onChange({ type: next.type === "table" ? "records" : "chart", kind: next.kind, groupSlug: next.group, valueSlug: next.value, splitSlug: next.split, aggregation: "sum", ...(next.columns ? { columns: next.columns } : {}) }) : undefined} /></div>;
}
