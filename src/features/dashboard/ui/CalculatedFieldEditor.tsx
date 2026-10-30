import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AGGREGATIONS, type Aggregation } from "@/features/item";
import type { Field } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Popover } from "@/shared/ui/popover";
import type { Widget } from "../model/dashboard";
import { compileCalculation } from "../model/calculated-fields";

export function CalculatedFieldEditor({ widget, fields, onChange, compact = false }: { widget: Widget; fields: Field[]; onChange: (patch: Partial<Widget>) => void; compact?: boolean }) {
  const { i18n } = useTranslation();
  const ru = i18n.language.startsWith("ru");
  const copy = ru
    ? { add: "Добавить поле", title: "Вычисляемое поле", new: "Новое поле", name: "Имя поля", formula: "Формула", apply: "Применить поле", remove: "Удалить поле", hint: "Числовые [поля], + − * / и скобки. Расчёт по загруженным строкам. Серверные фильтры и сортировка таблицы для таких полей недоступны.", required: "Укажите имя поля", limit: "Не больше 16 полей" }
    : { add: "Add field", title: "Calculated field", new: "New field", name: "Field name", formula: "Formula", apply: "Apply field", remove: "Delete field", hint: "Numeric [fields], + − * / and parentheses. Calculated from loaded rows. Server filters and record-table sorting are unavailable for these fields.", required: "Enter a field name", limit: "At most 16 fields" };
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [error, setError] = useState("");
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const definitions = widget.calculatedFields ?? [];
  const base = fields.filter((field) => !definitions.some((definition) => definition.slug === field.slug));

  return <Popover trigger={({ open, toggle }) => <Button type="button" size="sm" variant="secondary" aria-label={copy.add} aria-expanded={open} onClick={toggle}>{compact ? "+" : `ƒ ${copy.add}`}</Button>}>
    {(close) => <form className="flex w-[330px] max-w-[85vw] flex-col gap-3 p-4" onSubmit={(event) => {
      event.preventDefault();
      try {
        compileCalculation(expression, base);
        if (!name.trim()) throw new Error(copy.required);
        if (!selected && definitions.length >= 16) throw new Error(copy.limit);
        const next = { slug: selected || `calc_${crypto.randomUUID().replaceAll("-", "_")}`, label: name.trim().slice(0, 200), expression };
        onChange({ calculatedFields: [...definitions.filter((definition) => definition.slug !== next.slug), next], fieldPresentation: { ...widget.fieldPresentation, [next.slug]: { ...widget.fieldPresentation?.[next.slug], label: next.label, aggregation } } });
        setError("");
        close();
      } catch (exception) { setError(exception instanceof Error ? exception.message : "Invalid formula"); }
    }}>
      <strong className="text-sm">{copy.title}</strong>
      <select aria-label={copy.title} className="rounded border border-border bg-surface p-2 text-sm" value={selected} onChange={(event) => {
        const value = event.target.value, field = definitions.find((definition) => definition.slug === value);
        setSelected(value); setAggregation(widget.fieldPresentation?.[value]?.aggregation ?? "sum"); setName(field?.label ?? ""); setExpression(field?.expression ?? ""); setError("");
      }}><option value="">{copy.new}</option>{definitions.map((field) => <option key={field.slug} value={field.slug}>{field.label}</option>)}</select>
      <input aria-label={copy.name} className="rounded border border-border bg-surface p-2 text-sm" placeholder={copy.name} value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label={copy.formula} className="rounded border border-border bg-surface p-2 font-mono text-sm" placeholder="[amount] * 1.12" value={expression} onChange={(event) => setExpression(event.target.value)} />
      <label className="text-xs text-fg-muted">{ru ? "Агрегация по умолчанию" : "Default aggregation"}<select aria-label={ru ? "Агрегация по умолчанию" : "Default aggregation"} className="mt-1 w-full rounded border border-border bg-surface p-2 text-sm text-fg" value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}>{AGGREGATIONS.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
      <p className="text-xs text-fg-muted">{copy.hint}</p>
      <Button type="submit" size="sm">{copy.apply}</Button>
      {selected && <Button type="button" size="sm" variant="secondary" onClick={() => {
        onChange({ calculatedFields: definitions.filter((field) => field.slug !== selected) });
        setSelected(""); setName(""); setExpression(""); close();
      }}>{copy.remove}</Button>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>}
  </Popover>;
}
