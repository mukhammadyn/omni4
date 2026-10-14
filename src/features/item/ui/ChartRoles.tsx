import { useTranslation } from "react-i18next";
import { localized, type Field } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field as LabeledField, Input } from "@/shared/ui/input";
import { AGGREGATIONS, NUMERIC_FIELDS, type Aggregation } from "../model/pivot";
import { aggregationAllowed, MULTI_MEASURE_KINDS, RAW_CHART_KINDS, type ChartConfig, type ChartMeasure } from "../model/chart";

export function ChartRoles({ config, columns, language, onChange }: { config: ChartConfig; columns: Field[]; language: string; onChange: (patch: Partial<ChartConfig>) => void }) {
  const { t } = useTranslation();
  const numeric = columns.filter((field) => NUMERIC_FIELDS.has(field.type)).map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }));
  const measures = config.measures ?? [];
  const update = (id: string, patch: Partial<ChartMeasure>) => onChange({ measures: measures.map((measure) => measure.id === id ? { ...measure, ...patch } : measure) });
  const add = () => onChange({ splitSlug: "", measures: [...(measures.length ? measures : [{ id: crypto.randomUUID(), field: config.valueSlug, aggregation: config.aggregation }]), { id: crypto.randomUUID(), field: "", aggregation: "count" }] });
  if (RAW_CHART_KINDS.has(config.kind)) {
    const roles: ("xSlug" | "ySlug" | "latitudeSlug" | "longitudeSlug" | "sizeSlug")[] = config.kind === "map" ? ["latitudeSlug", "longitudeSlug", "sizeSlug"] : config.kind === "bubble" ? ["xSlug", "ySlug", "sizeSlug"] : ["xSlug", "ySlug"];
    return <div className="order-2 flex flex-col gap-3">{roles.map((role) => <LabeledField key={role} label={t(`chart.role.${role}` as "chart.role.xSlug")}><Dropdown ariaLabel={t(`chart.role.${role}` as "chart.role.xSlug")} value={config[role] ?? ""} items={[{ value: "", label: t("pivot.pick") }, ...numeric]} onChange={(value) => onChange({ [role]: value })} /></LabeledField>)}</div>;
  }
  if (!MULTI_MEASURE_KINDS.has(config.kind)) return null;
  return <div className="order-2 flex flex-col gap-3">
    {measures.map((measure, index) => <fieldset key={measure.id} className="flex flex-col gap-2 rounded-md border border-border p-2"><legend className="px-1 text-xs text-fg-muted">{t("chart.measureNumber", { count: index + 1 })}</legend>
      <Input aria-label={t("chart.measureLabel")} value={measure.label ?? ""} placeholder={t("chart.measureLabel")} onChange={(event) => update(measure.id, { label: event.target.value })} />
      <Dropdown ariaLabel={t("chart.calculation")} value={measure.aggregation} items={AGGREGATIONS.filter((aggregation) => aggregationAllowed(config.kind, aggregation) && (aggregation === "count" || numeric.length)).map((aggregation) => ({ value: aggregation, label: t(`pivot.aggregation.${aggregation}` as const) }))} onChange={(aggregation) => update(measure.id, { aggregation: aggregation as Aggregation })} />
      {measure.aggregation !== "count" && <Dropdown ariaLabel={t("pivot.value")} value={measure.field} placeholder={t("pivot.pick")} items={numeric} onChange={(field) => update(measure.id, { field })} />}
      <Input aria-label={t("chart.unit")} value={measure.unit ?? ""} placeholder={t("chart.unitHint")} onChange={(event) => update(measure.id, { unit: event.target.value })} />
      {config.kind === "combo" && <><Dropdown ariaLabel={t("chart.axis")} value={measure.axis ?? "left"} items={[{ value: "left", label: t("chart.axisLeft") }, { value: "right", label: t("chart.axisRight") }]} onChange={(axis) => update(measure.id, { axis: axis as "left" | "right" })} /><Dropdown ariaLabel={t("chart.kind")} value={measure.display ?? "column"} items={[{ value: "column", label: t("chart.kind.column") }, { value: "line", label: t("chart.kind.line") }]} onChange={(display) => update(measure.id, { display: display as "column" | "line" })} /></>}
      <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ measures: measures.filter((m) => m.id !== measure.id) })}>{t("chart.removeMeasure")}</Button>
    </fieldset>)}
    <Button type="button" size="sm" variant="secondary" disabled={measures.length >= 7} onClick={add}>{t("chart.addMeasure")}</Button>
  </div>;
}
