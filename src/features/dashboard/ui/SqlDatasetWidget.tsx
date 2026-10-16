import { useTranslation } from "react-i18next";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { SqlDatasetRunner } from "./SqlDatasetRunner";

export function SqlDatasetWidget({ dataset, widget, menuId, editing = false, onChange }: { dataset: Dataset; widget: Widget; menuId: string; editing?: boolean; onChange?: ((patch: Partial<Widget>) => void) | undefined }) {
  const { i18n } = useTranslation();
  if (dataset.source.kind !== "sql") return null;
  return <div className="flex min-w-0 flex-col gap-2"><SqlDatasetRunner menuId={menuId} sql={dataset.source.sql} parameters={dataset.source.parameters} autoRun presentation={{ type: widget.type === "records" ? "table" : "chart", kind: widget.kind, group: widget.groupSlug, value: widget.valueSlug, split: widget.splitSlug }} onPresentation={editing && onChange ? (next) => onChange({ type: next.type === "table" ? "records" : "chart", kind: next.kind, groupSlug: next.group, valueSlug: next.value, splitSlug: next.split, aggregation: "sum" }) : undefined} /><p className="text-2xs text-fg-muted">{i18n.language.startsWith("ru") ? "Фильтры дашборда и карточки не изменяют SQL; используйте параметры запроса." : i18n.language.startsWith("uz") ? "Dashboard va karta filtrlari SQLni o‘zgartirmaydi; so‘rov parametrlarini ishlating." : "Dashboard/card filters do not alter SQL; use query parameters."}</p></div>;
}
