import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AGGREGATIONS, CHART_BUCKETS, ChartRoles, RAW_CHART_KINDS, aggregationAllowed, needsSplit, fieldIcon, type Aggregation, type ChartBucket } from "@/features/item";
import { localized, type Field as TableField } from "@/features/table";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Field } from "@/shared/ui/input";
import type { Widget } from "../model/dashboard";
import { isDateField } from "../model/widget-editor";
import { RecordProperties } from "./RecordProperties";
import { AdvancedWidgetSetup } from "./AdvancedWidgetSetup";

export function WidgetFields({ widget, fields, language, onChange }: { widget: Widget; fields: TableField[]; language: string; onChange: (patch: Partial<Widget>) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const numeric = fields.filter((field) => ["NUMBER", "FLOAT", "FLOAT_NOLIMIT", "MONEY", "PROGRESS", "RATING", "INCREMENT_ID"].includes(field.type));
  const options = (items: TableField[]) => items.map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label), icon: <Icon as={fieldIcon(field.type)} size={15} className="text-fg-muted" /> }));
  if (widget.type === "records") return <RecordProperties fields={fields} selected={widget.columns ?? fields.slice(0, 5).map((field) => field.slug)} language={language} onChange={(columns) => onChange({ columns })} />;
  if (widget.type && widget.type !== "chart") return <AdvancedWidgetSetup widget={widget} fields={fields} language={language} onChange={onChange} />;
  if (RAW_CHART_KINDS.has(widget.kind)) return <ChartRoles config={widget} columns={fields} language={language} onChange={onChange} />;
  return <>
    {widget.kind !== "stat" && <>
      <Field label={t("dashboard.groupField")}><Dropdown ariaLabel={t("dashboard.groupField")} value={widget.groupSlug} placeholder={t("dashboard.chooseGrouping")} items={options(fields.filter((field) => localized(field.labels, language, field.label).toLocaleLowerCase().includes(search.toLocaleLowerCase())))} search={search} searchPlaceholder={t("table.searchField")} onSearch={setSearch} onChange={(groupSlug) => { setSearch(""); onChange({ groupSlug, groupBucket: isDateField(fields.find((field) => field.slug === groupSlug)) ? "month" : "" }); }} /></Field>
      {isDateField(fields.find((field) => field.slug === widget.groupSlug)) && <Field label={t("chart.bucket")}><Dropdown ariaLabel={t("chart.bucket")} value={widget.groupBucket} items={[{ value: "", label: t("chart.bucketNone") }, ...CHART_BUCKETS.map((bucket) => ({ value: bucket, label: t(`chart.bucket.${bucket}` as const) }))]} onChange={(value) => onChange({ groupBucket: value as ChartBucket })} /></Field>}
      {needsSplit(widget.kind) && !widget.measures?.length && <Field label={t("chart.split")}><Dropdown ariaLabel={t("chart.split")} value={widget.splitSlug} placeholder={t("dashboard.chooseSeries")} items={options(fields.filter((field) => field.slug !== widget.groupSlug || Boolean(widget.groupBucket)))} onChange={(splitSlug) => onChange({ splitSlug, splitBucket: isDateField(fields.find((field) => field.slug === splitSlug)) ? "month" : "" })} /></Field>}
    </>}
    {!widget.measures?.length && <>
      <Field label={t("chart.calculation")}><Dropdown ariaLabel={t("chart.calculation")} value={widget.aggregation} items={AGGREGATIONS.filter((aggregation) => aggregationAllowed(widget.kind, aggregation) && (aggregation === "count" || numeric.length)).map((aggregation) => ({ value: aggregation, label: t(`pivot.aggregation.${aggregation}` as const) }))} onChange={(aggregation) => onChange({ aggregation: aggregation as Aggregation, valueSlug: aggregation === "count" ? "" : widget.valueSlug || (numeric.length === 1 ? numeric[0]!.slug : "") })} /></Field>
      {widget.aggregation !== "count" && <Field label={t("pivot.value")}><Dropdown ariaLabel={t("pivot.value")} value={widget.valueSlug} placeholder={t("pivot.pick")} items={options(numeric)} onChange={(valueSlug) => onChange({ valueSlug })} /></Field>}
    </>}
  </>;
}
