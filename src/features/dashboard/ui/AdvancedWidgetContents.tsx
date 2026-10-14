import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PivotView, DEFAULT_SORT, type PivotSetup, type Item } from "@/features/item";
import type { Field } from "@/features/table";
import type { Widget } from "../model/dashboard";
import { ratioValue } from "../model/widget-advanced";

export function DashboardPivot({ widget, fields, rows, count, language, editing, onChange }: { widget: Widget; fields: Field[]; rows: Item[]; count: number; language: string; editing: boolean; onChange: (patch: Partial<Widget>) => void }) {
  const base: PivotSetup = { rowSlugs: widget.pivotRows ?? [widget.groupSlug], colSlug: widget.splitSlug, aggregation: widget.aggregation, valueSlug: widget.valueSlug, sort: DEFAULT_SORT, skipEmpty: widget.pivotSkipEmpty ?? false };
  const fingerprint = JSON.stringify(base);
  const [setup, setSetup] = useState(base);
  useEffect(() => { setSetup(JSON.parse(fingerprint) as PivotSetup); }, [fingerprint]);
  return <PivotView columns={fields} rows={rows} setup={setup} language={language} loaded={rows.length >= count} total={count} editable={editing} onSetup={(patch) => { setSetup((current) => ({ ...current, ...patch })); if (editing) onChange({ ...(patch.rowSlugs ? { pivotRows: patch.rowSlugs, groupSlug: patch.rowSlugs[0] ?? "" } : {}), ...(patch.colSlug !== undefined ? { splitSlug: patch.colSlug } : {}), ...(patch.aggregation ? { aggregation: patch.aggregation } : {}), ...(patch.valueSlug !== undefined ? { valueSlug: patch.valueSlug } : {}), ...(patch.skipEmpty !== undefined ? { pivotSkipEmpty: patch.skipEmpty } : {}) }); }} />;
}

export function RatioWidget({ rows, widget }: { rows: Item[]; widget: Widget }) {
  const { t, i18n } = useTranslation(), ratio = ratioValue(rows, widget);
  const show = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  return <div className="py-4"><p className="text-3xl font-semibold">{ratio.value === null ? "—" : `${show(ratio.value)}${widget.ratio?.percent ? "%" : ""}`}</p><p className="mt-1 text-xs text-fg-muted">{ratio.value === null ? t("dashboard.zeroDenominator") : `${show(ratio.numerator)} / ${show(ratio.denominator)}`}</p></div>;
}

export function GoalWidget({ widget, value }: { widget: Widget; value: number }) {
  const { t, i18n } = useTranslation(), target = widget.goal ?? 0;
  const percent = target > 0 ? value / target * 100 : null;
  return <div className="flex flex-col gap-2 py-3"><p className="text-3xl font-semibold">{value.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}</p><p className="text-xs text-fg-muted">{t("dashboard.goalProgress", { target: target.toLocaleString(i18n.language), percent: percent?.toFixed(1) ?? "—" })}</p><progress className="h-2 w-full accent-accent" value={Math.max(0, Math.min(100, percent ?? 0))} max={100} aria-label={t("dashboard.goalTarget")} /></div>;
}
