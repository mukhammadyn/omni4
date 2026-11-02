import { useTranslation } from "react-i18next";
import type { Field as TableField } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import type { Widget } from "../model/dashboard";
import type { SqlSortPreset } from "../model/sql-sort-presets";

export function SqlSortPresetOptions({ widget, fields, onChange }: { widget: Widget; fields: TableField[]; onChange: (patch: Partial<Widget>) => void }) {
  const { i18n } = useTranslation(), ru = i18n.language.startsWith("ru"), presets = widget.sqlSortPresets ?? [];
  const update = (index: number, patch: Partial<SqlSortPreset>) => onChange({ sqlSortPresets: presets.map((p, i) => i === index ? { ...p, ...patch } : p) });
  const defaultIndex = widget.sqlDefaultSortPreset ?? 0;
  return <details><summary className="cursor-pointer text-sm text-fg-muted">{ru ? "Варианты сортировки таблицы" : "Table sort presets"}</summary><div className="mt-2 flex flex-col gap-3">
    {presets.map((p, i) => <fieldset key={i} className="flex flex-col gap-2 rounded border border-border p-2"><legend>{ru ? "Сортировка" : "Sort"} {i + 1}</legend>
      <Field label={ru ? "Название" : "Label"}><Input aria-label={`Sort ${i + 1} label`} maxLength={80} value={p.label} onChange={e => update(i, { label: e.target.value })}/></Field>
      <Field label={ru ? "Поле" : "Field"}><Dropdown ariaLabel={`Sort ${i + 1} field`} value={p.field} items={fields.map(f => ({ value: f.slug, label: f.label }))} onChange={field => update(i, { field })}/></Field>
      <Field label={ru ? "Направление" : "Direction"}><Dropdown ariaLabel={`Sort ${i + 1} direction`} value={p.direction} items={[{value:"asc",label:ru?"По возрастанию":"Ascending"},{value:"desc",label:ru?"По убыванию":"Descending"}]} onChange={direction => update(i, { direction: direction as SqlSortPreset["direction"] })}/></Field>
      <Field label={ru ? "Неизвестные значения" : "Unknown values"}><Dropdown ariaLabel={`Sort ${i + 1} unknowns`} value={p.nulls} items={[{value:"last",label:ru?"В конце":"Last"},{value:"first",label:ru?"В начале":"First"}]} onChange={nulls => update(i, { nulls: nulls as SqlSortPreset["nulls"] })}/></Field>
      <Button type="button" size="sm" variant="secondary" onClick={() => onChange({sqlSortPresets:presets.filter((_, index) => index !== i), sqlDefaultSortPreset:defaultIndex === i ? 0 : defaultIndex > i ? defaultIndex - 1 : defaultIndex})}>{ru ? "Убрать сортировку" : "Remove sort"} {i+1}</Button>
    </fieldset>)}
    {presets.length > 0 && <Field label={ru ? "Сортировка по умолчанию" : "Default sort"}><Dropdown ariaLabel={ru ? "Сортировка по умолчанию" : "Default sort"} value={String(defaultIndex)} items={presets.map((p,i)=>({value:String(i),label:p.label || String(i+1)}))} onChange={value=>onChange({sqlDefaultSortPreset:Number(value)})}/></Field>}
    <Button type="button" size="sm" variant="secondary" disabled={presets.length >= 8 || !fields.length} onClick={() => onChange({sqlSortPresets:[...presets,{label:ru?"Новая сортировка":"New sort",field:fields[0]?.slug ?? "",direction:"asc",nulls:"last"}]})}>{ru ? "Добавить сортировку" : "Add sort preset"}</Button>
    <p className="text-2xs text-fg-muted">{ru ? "Сортировка применяется после фильтров ко всем загруженным строкам, до разбивки на страницы. Для времени используйте числовое поле минут." : "Sorts all loaded rows after filtering and before pagination. Use a numeric minutes field for time."}</p>
  </div></details>;
}
