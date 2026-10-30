import { useState } from "react";
import { EyeIcon, EyeOffIcon, SigmaIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AGGREGATIONS, type Aggregation, aggregationAllowed, fieldIcon } from "@/features/item";
import { localized, type Field } from "@/features/table";
import { Dropdown } from "@/shared/ui/dropdown";
import { builderFieldOption } from "./BuilderFieldOption";
import { Icon } from "@/shared/ui/icon";
import type { Widget } from "../model/dashboard";
import { CalculatedFieldEditor } from "./CalculatedFieldEditor";
import { fieldRole, startFieldDrag, overFieldSlot, dropField } from "../model/builder-drag";
import { assignBuilderField, builderRoles, numericField } from "../model/builder-fields";

export function builderCopy(language: string) {
  if (language.startsWith("ru")) return { sort: "Сортировка", count: "Количество записей", remove: "Убрать", editor: "Конструктор чарта", data: "Данные", viz: "Визуализация", source: "Источник", fields: "Поля", table: "Таблица", dimensions: "Измерения", measures: "Показатели", search: "Поиск по имени", group: "Группировка", value: "Показатель", split: "Цвета / серии", columns: "Столбцы", assign: "Добавить в", empty: "Нет полей", fullscreen: "На весь экран", restore: "Свернуть", drop: "Перетащите поле сюда", schemaHint: "Доступные поля источника. Типы и права определяются источником данных." };
  if (language.startsWith("uz")) return { sort: "Saralash", count: "Yozuvlar soni", remove: "Olib tashlash", editor: "Chart konstruktori", data: "Ma’lumotlar", viz: "Vizualizatsiya", source: "Manba", fields: "Maydonlar", table: "Jadval", dimensions: "O‘lchamlar", measures: "Ko‘rsatkichlar", search: "Nomi bo‘yicha qidirish", group: "Guruhlash", value: "Ko‘rsatkich", split: "Ranglar / seriyalar", columns: "Ustunlar", assign: "Qo‘shish", empty: "Maydonlar yo‘q", fullscreen: "To‘liq ekran", restore: "Kichraytirish", drop: "Maydonni shu yerga tashlang", schemaHint: "Manbaning mavjud maydonlari. Turlar va huquqlar ma’lumot manbasidan olinadi." };
  return { sort: "Sorting", count: "Record count", remove: "Remove", editor: "Chart builder", data: "Data", viz: "Visualization", source: "Source", fields: "Fields", table: "Table", dimensions: "Dimensions", measures: "Measures", search: "Search by name", group: "Grouping", value: "Measure", split: "Colors / series", columns: "Columns", assign: "Add to", empty: "No fields", fullscreen: "Full screen", restore: "Restore", drop: "Drop a field here", schemaHint: "Available source fields. Types and permissions are defined by the data source." };
}
type Labels = ReturnType<typeof builderCopy>;
type Props = { fields: Field[]; language: string; labels: Labels };
export function BuilderFields({ widget, fields, language, labels, sql, onChange }: Props & { widget: Widget; sql: boolean; onChange: (patch: Partial<Widget>) => void }) {
  const [search, setSearch] = useState("");


  const name = (field: Field) => localized(field.labels, language, field.label);
  const visible = fields.filter((field) => !widget.fieldPresentation?.[field.slug]?.hidden).filter((field) => `${name(field)} ${widget.fieldPresentation?.[field.slug]?.description ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const assign = (field: Field) => { const target = fieldRole(widget, field, numericField(field) ? "value" : "group", sql); if (!target) return; const patch = assignBuilderField(widget, field, target, sql); if (patch) onChange(patch); };
  return <aside className="flex max-h-[420px] min-h-0 flex-col border-r border-border md:max-h-none" aria-label={labels.fields}>
    <h2 className="flex items-center justify-between border-b border-border p-4 text-sm font-semibold">{labels.fields}<span className="font-normal text-fg-muted">{fields.length}</span></h2>
    <div className="m-3 flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-border px-2"><Icon as={SearchIcon} size={14} /><input className="min-w-0 w-full bg-transparent py-2 text-sm outline-none" aria-label={labels.search} placeholder={labels.search} value={search} onChange={(event) => setSearch(event.target.value)} /></label>{!sql && <CalculatedFieldEditor widget={widget} fields={fields} onChange={onChange} compact />}</div>

    <div className="min-h-0 flex-1 overflow-auto pb-3">{[false, true].map((numeric) => <div key={String(numeric)}><h3 className="px-4 py-2 text-xs text-fg-muted">{numeric ? labels.measures : labels.dimensions}</h3>{visible.filter((field) => numericField(field) === numeric).map((field) => <button type="button" key={field.slug} draggable={Boolean(fieldRole(widget, field, numericField(field) ? "value" : "group", sql))} onDragStart={(event) => startFieldDrag(event, widget, field, sql)} disabled={!fieldRole(widget, field, numericField(field) ? "value" : "group", sql)} onClick={() => assign(field)} title={fieldRole(widget, field, numericField(field) ? "value" : "group", sql) ? `${labels.assign}: ${labels[fieldRole(widget, field, numericField(field) ? "value" : "group", sql)!]}` : name(field)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-hover disabled:cursor-default disabled:opacity-60 ${numeric ? "builder-measure" : "builder-dimension"}`}><Icon as={fieldIcon(field.type)} size={14} /><span className="truncate">{name(field)}</span></button>)}</div>)}{!visible.length && <p className="p-4 text-sm text-fg-muted">{labels.empty}</p>}</div>

  </aside>;
}
export function BuilderSlots({ widget, fields, language, labels, sql, onChange }: Props & { widget: Widget; sql: boolean; onChange: (patch: Partial<Widget>) => void }) {
  const name = (field: Field) => localized(field.labels, language, field.label);
  const assign = (target: Parameters<typeof assignBuilderField>[2], slug: string) => {
    const field = fields.find((item) => item.slug === slug);
    const patch = field && assignBuilderField(widget, field, target, sql);
    if (patch) onChange(patch);
  };
  return <div className="builder-slots">{builderRoles(widget, sql).map((target) => {
    const selected = (target === "sort" ? (widget.sorts ?? []).map((sort) => sort.field) : target === "columns" ? widget.columns ?? [] : [target === "group" ? widget.groupSlug : target === "value" ? widget.valueSlug : widget.splitSlug]).filter(Boolean);
    const options = fields.filter((field) => !widget.fieldPresentation?.[field.slug]?.hidden && assignBuilderField(widget, field, target, sql));
    const multiple = target === "columns" || target === "sort";
    const label = target === "group" && !["pie", "donut"].includes(widget.kind) ? widget.kind === "bar" ? "Y" : "X" : target === "value" && widget.kind !== "stat" ? widget.kind === "bar" ? "X" : "Y" : labels[target];
    return <div key={target} onDragOver={(event) => overFieldSlot(event, widget, target, sql)} onDrop={(event) => dropField(event, widget, fields, target, sql, onChange)} className="builder-slot p-3 text-sm">
      <strong className="font-medium">{label}</strong>
      {selected.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{selected.map((slug) => {
        const field = fields.find((item) => item.slug === slug);
        if (!field) return null;
        return <span key={slug} className={`builder-chip flex w-full items-center gap-1 rounded-md px-2 py-1.5 ${numericField(field) ? "builder-chip-measure" : "builder-chip-dimension"}`}>
          {multiple ? <><Icon as={fieldIcon(field.type)} size={14} /><span className="min-w-0 flex-1 truncate">{name(field)}</span></> : <Dropdown ariaLabel={`Change: ${labels[target]}`} size="sm" className="builder-field-select min-w-0 flex-1" value={slug} onChange={(value) => assign(target, value)} items={[field, ...options.filter((option) => option.slug !== slug)].map((option) => builderFieldOption(option, language))} />}
          {target === "columns" && selected.indexOf(slug) > 0 && <button type="button" aria-label={`Move left: ${name(field)}`} onClick={() => { const columns = [...selected], at = columns.indexOf(slug); [columns[at - 1], columns[at]] = [columns[at]!, columns[at - 1]!]; onChange({ columns }); }}>←</button>}
          {target === "sort" && <button type="button" aria-label={`Direction: ${name(field)}`} onClick={() => onChange({ sorts: widget.sorts?.map((sort) => sort.field === slug ? { ...sort, direction: sort.direction === "asc" ? "desc" : "asc" } : sort) ?? [] })}>{widget.sorts?.find((sort) => sort.field === slug)?.direction === "desc" ? "↓" : "↑"}</button>}
          <button type="button" aria-label={`${labels.remove}: ${name(field)}`} onClick={() => onChange(target === "sort" ? { sorts: widget.sorts?.filter((sort) => sort.field !== slug) ?? [] } : target === "columns" ? { columns: widget.columns?.filter((item) => item !== slug) ?? [] } : target === "group" ? { groupSlug: "", groupBucket: "" } : target === "split" ? { splitSlug: "", splitBucket: "" } : { valueSlug: "", ...(!sql ? { aggregation: "count" } : {}) })} className="ml-auto shrink-0 rounded hover:bg-surface"><Icon as={XIcon} size={12} /></button>
        </span>;
      })}</div>}
      {(!selected.length || multiple) && <Dropdown ariaLabel={`Add: ${labels[target]}`} className="builder-slot-select mt-2" size="sm" emptyText={labels.empty} placeholder={labels.drop} value="" onChange={(value) => assign(target, value)} items={options.filter((field) => !multiple || !selected.includes(field.slug)).map((field) => builderFieldOption(field, language))} />}
      {!selected.length && target === "value" && !sql && widget.aggregation === "count" && <span className="text-xs text-fg-muted">{labels.count}</span>}
    </div>;
  })}</div>;
}
export function BuilderSchema({ fields, language, labels, widget, search, onChange, sql = false }: Props & { sql?: boolean; widget: Widget; search: string; onChange: (patch: Partial<Widget>) => void }) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith("ru");
  const visible = fields.filter((field) => [localized(field.labels, language, field.label), widget.fieldPresentation?.[field.slug]?.description ?? ""].some((text) => text.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const typeLabels: Record<string, string> = ru ? { NUMBER: "Число", SINGLE_LINE: "Строка", DATE: "Дата", DATE_TIME: "Дата и время", LOOKUP: "Связь", STATUS: "Статус" } : { NUMBER: "Number", SINGLE_LINE: "String", DATE: "Date", DATE_TIME: "Date and time", LOOKUP: "Relation", STATUS: "Status" };
  return <div className="builder-schema flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[860px] table-fixed text-left text-sm">
    <colgroup>{["3%", "17%", "18%", "3%", "12%", "11%", "36%"].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
    <thead className="sticky top-0 z-1 bg-surface text-fg-muted"><tr>{["#", ru ? "Имя" : "Name", ru ? "Источник поля" : "Field source", "visibility", ru ? "Тип" : "Type", ru ? "Агрегация" : "Aggregation", ru ? "Описание" : "Description"].map((label) => <th key={label} className="border-b border-border px-3 py-2 font-normal">{label === "visibility" ? <Icon as={EyeOffIcon} size={15} aria-label={ru ? "Видимость" : "Visibility"} /> : label}</th>)}</tr></thead>
    <tbody>{visible.map((field, index) => {
      const numeric = numericField(field), hidden = widget.fieldPresentation?.[field.slug]?.hidden;
      const expression = widget.calculatedFields?.find((definition) => definition.slug === field.slug)?.expression ?? `${widget.tableSlug ? `${widget.tableSlug}.` : ""}${field.slug}`;
      return <tr key={field.slug} className={`border-b border-border hover:bg-surface-hover ${hidden ? "opacity-55" : ""}`}>
        <td className="px-3 py-2 text-fg-subtle">{index + 1}</td>
        <td className="px-3 py-[3px]"><input aria-label={`Name: ${field.slug}`} className="w-full rounded bg-transparent px-1 py-1 outline-accent" value={widget.fieldPresentation?.[field.slug]?.label ?? localized(field.labels, language, field.label)} onChange={(event) => onChange({ fieldPresentation: { ...widget.fieldPresentation, [field.slug]: { ...widget.fieldPresentation?.[field.slug], label: event.target.value } } })} /></td>
        <td className="truncate px-3 py-2 font-mono text-xs text-fg-muted" title={expression}>{expression}</td>
        <td className="px-3 py-[3px]"><button type="button" aria-label={`Visible: ${field.slug}`} aria-pressed={!hidden} title={ru ? "Видимость поля" : "Field visibility"} onClick={() => onChange({ fieldPresentation: { ...widget.fieldPresentation, [field.slug]: { ...widget.fieldPresentation?.[field.slug], hidden: !hidden } } })} className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-surface-hover hover:text-fg"><Icon as={hidden ? EyeOffIcon : EyeIcon} size={16} /></button></td>
        <td className="px-3 py-[3px]"><span className={`flex items-center gap-2 ${numeric ? "builder-measure" : "builder-dimension"}`}><Icon as={fieldIcon(field.type)} size={14} /><span className="truncate">{typeLabels[field.type] ?? field.type}</span></span></td>
        <td className="px-3 py-[3px]"><Dropdown size="sm" className={numeric ? "builder-aggregation builder-chip-measure" : "builder-aggregation builder-chip-dimension"} ariaLabel={`Aggregation: ${field.slug}`} disabled={sql || !numeric} value={sql && numeric ? "sql" : !numeric ? "none" : widget.valueSlug === field.slug ? widget.aggregation : widget.fieldPresentation?.[field.slug]?.aggregation ?? "sum"} onChange={(value) => {
          const aggregation = value as Aggregation;
          onChange({ fieldPresentation: { ...widget.fieldPresentation, [field.slug]: { ...widget.fieldPresentation?.[field.slug], aggregation } }, ...(widget.valueSlug === field.slug && aggregationAllowed(widget.kind, aggregation) ? { aggregation } : {}) });
        }} items={sql && numeric ? [{ value: "sql", label: "SQL", icon: <Icon as={SigmaIcon} size={14} /> }] : !numeric ? [{ value: "none", label: ru ? "Нет" : "None" }] : AGGREGATIONS.filter((aggregation) => widget.valueSlug !== field.slug || aggregationAllowed(widget.kind, aggregation)).map((aggregation) => ({ value: aggregation, label: t(`pivot.aggregation.${aggregation}` as "pivot.aggregation.sum"), icon: <Icon as={SigmaIcon} size={14} /> }))} /></td>
        <td className="px-3 py-[3px]"><input aria-label={`Description: ${field.slug}`} placeholder="—" className="w-full rounded bg-transparent px-1 py-1 outline-accent" value={widget.fieldPresentation?.[field.slug]?.description ?? ""} onChange={(event) => onChange({ fieldPresentation: { ...widget.fieldPresentation, [field.slug]: { ...widget.fieldPresentation?.[field.slug], description: event.target.value } } })} /></td>
      </tr>;
    })}</tbody>
  </table>{!visible.length && <p className="p-4 text-sm text-fg-muted">{labels.empty}</p>}</div></div>;
}
