import { useTranslation } from "react-i18next";
import { AGGREGATIONS, type Aggregation, type ChartMeasure } from "@/features/item";
import { localized, type Field as TableField } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import type { Widget } from "../model/dashboard";

export function AdvancedWidgetSetup({ widget, fields, language, onChange }: { widget: Widget; fields: TableField[]; language: string; onChange: (patch: Partial<Widget>) => void }) {
  const { t } = useTranslation();
  const options = fields.map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }));
  const numeric = fields.filter((field) => ["NUMBER", "FLOAT", "FLOAT_NOLIMIT", "MONEY", "PROGRESS", "RATING", "INCREMENT_ID"].includes(field.type)).map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }));
  if (widget.type === "heading") return <Field label={t("dashboard.headingText")}><textarea aria-label={t("dashboard.headingText")} className="min-h-32 rounded-md border border-border bg-surface p-2 text-sm" value={widget.body ?? ""} onChange={(event) => onChange({ body: event.target.value })} /></Field>;
  if (widget.type === "ratio") return <div className="flex flex-col gap-3">{(["numerator", "denominator"] as const).map((role) => {
    const measure = widget.ratio?.[role] ?? { id: role, field: "", aggregation: "count" as const };
    const update = (patch: Partial<ChartMeasure>) => onChange({ ratio: { numerator: widget.ratio?.numerator ?? { id: "numerator", field: "", aggregation: "count" }, denominator: widget.ratio?.denominator ?? { id: "denominator", field: "", aggregation: "count" }, percent: widget.ratio?.percent ?? false, [role]: { ...measure, ...patch } } });
    return <fieldset key={role} className="flex flex-col gap-2 rounded-md border border-border p-2"><legend className="px-1 text-sm">{t(`dashboard.${role}` as const)}</legend><Dropdown ariaLabel={t(`dashboard.${role}` as const)} value={measure.aggregation} items={AGGREGATIONS.filter((a) => a === "count" || numeric.length).map((a) => ({ value: a, label: t(`pivot.aggregation.${a}` as const) }))} onChange={(aggregation) => update({ aggregation: aggregation as Aggregation })} />{measure.aggregation !== "count" && <Dropdown ariaLabel={`${t(`dashboard.${role}` as const)}: ${t("pivot.value")}`} value={measure.field} placeholder={t("pivot.pick")} items={numeric} onChange={(field) => update({ field })} />}</fieldset>;
  })}<label className="text-sm"><input type="checkbox" checked={widget.ratio?.percent ?? false} onChange={(event) => widget.ratio && onChange({ ratio: { ...widget.ratio, percent: event.target.checked } })} /> {t("dashboard.asPercent")}</label></div>;
  return <div className="flex flex-col gap-3">
    {widget.type === "pivot" && <><Field label={t("pivot.rows")}>{(widget.pivotRows ?? [widget.groupSlug]).map((slug, at, rows) => <div key={at} className="flex gap-1"><Dropdown ariaLabel={`${t("pivot.rows")} ${at + 1}`} value={slug} placeholder={t("pivot.pick")} items={options} onChange={(value) => onChange({ pivotRows: rows.map((slug, index) => index === at ? value : slug), ...(at === 0 ? { groupSlug: value } : {}) })} />{rows.length > 1 && <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ pivotRows: rows.filter((_, index) => index !== at) })}>{t("action.delete")}</Button>}</div>)}</Field><Button type="button" size="sm" variant="secondary" disabled={(widget.pivotRows?.length ?? 1) >= 4} onClick={() => onChange({ pivotRows: [...(widget.pivotRows ?? [widget.groupSlug]), ""] })}>{t("pivot.addLevel")}</Button><Field label={t("pivot.columns")}><Dropdown value={widget.splitSlug} items={[{ value: "", label: t("pivot.none") }, ...options]} onChange={(splitSlug) => onChange({ splitSlug })} /></Field></>}
    <Field label={t("chart.calculation")}><Dropdown value={widget.aggregation} items={AGGREGATIONS.filter((a) => a === "count" || numeric.length).map((a) => ({ value: a, label: t(`pivot.aggregation.${a}` as const) }))} onChange={(aggregation) => onChange({ aggregation: aggregation as Aggregation })} /></Field>
    {widget.aggregation !== "count" && <Field label={t("pivot.value")}><Dropdown value={widget.valueSlug} placeholder={t("pivot.pick")} items={numeric} onChange={(valueSlug) => onChange({ valueSlug })} /></Field>}
    {widget.type === "goal" && <Field label={t("dashboard.goalTarget")}><Input type="number" min="0" step="any" value={widget.goal ?? ""} onChange={(event) => onChange({ goal: Number(event.target.value) })} /></Field>}
  </div>;
}
