import { useTranslation } from "react-i18next";
import type { Widget } from "../model/dashboard";

/** Optional appearance overrides: absent settings preserve legacy renderers. */
export function ChartAppearance({ widget, onChange }: { widget: Widget; onChange: (patch: Partial<Widget>) => void }) {
  const { i18n } = useTranslation();
  if (widget.type && widget.type !== "chart") return null;
  if (!["column", "bar", "line", "area", "pie", "donut", "column100", "area100", "stack"].includes(widget.kind)) return null;
  const ru = i18n.language.startsWith("ru");
  const stackable = ["column", "bar", "area"].includes(widget.kind) && !(widget.measures ?? []).some((measure) => measure.axis === "right");
  const options = [
    { key: "showLegend" as const, label: ru ? "Легенда" : "Legend", checked: widget.showLegend !== false },
    ...(stackable ? [{ key: "stacked" as const, label: ru ? "Накопление (stacked)" : "Stacked", checked: widget.stacked === true }] : []),
    ...(["column", "bar", "line", "area", "column100", "area100"].includes(widget.kind) ? [{ key: "showGrid" as const, label: ru ? "Линии сетки" : "Grid lines", checked: widget.showGrid === true }] : []),
  ];
  return <fieldset className="flex flex-col gap-3 border-b border-border pb-3"><legend className="mb-3 text-xs font-medium text-fg-muted">{ru ? "Настройки чарта" : "Chart settings"}</legend>{options.map((option) => <label key={option.key} className="flex items-center justify-between gap-3 text-sm"><span>{option.label}</span><input type="checkbox" role="switch" aria-label={option.label} checked={option.checked} onChange={(event) => onChange({ [option.key]: event.target.checked })} className="relative h-[18px] w-8 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform checked:bg-accent checked:after:translate-x-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" /></label>)}</fieldset>;
}
