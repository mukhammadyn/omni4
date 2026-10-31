import { useTranslation } from "react-i18next";
import type { Field as TableField } from "@/features/table";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import type { Widget } from "../model/dashboard";
import type { SqlRecordOptions } from "../model/sql-record-options";
export function SqlRecordOptionsEditor({widget,fields,onChange}:{widget:Widget;fields:TableField[];onChange:(patch:Partial<Widget>)=>void}) {
  const {i18n}=useTranslation(),ru=i18n.language.startsWith("ru"),options=widget.sqlRecords;
  const update=(patch:Partial<SqlRecordOptions>)=>onChange({sqlRecords:{layout:options?.layout ?? "list",...options,...patch}});
  const choices=[{value:"",label:"—"},...fields.map(field=>({value:field.slug,label:field.label}))];
  return <>
    <Field label={ru?"Представление записей":"Record presentation"}><Dropdown ariaLabel={ru?"Представление записей":"Record presentation"} value={options?.layout ?? "table"} items={[{value:"table",label:ru?"Таблица":"Table"},{value:"list",label:ru?"Список":"List"},{value:"cards",label:ru?"Карточки по группам":"Grouped cards"},{value:"metrics",label:ru?"Карточки показателей":"Metric cards"}]} onChange={value=>onChange({sqlRecords:value==="table" ? undefined : {...options,layout:value as "list"|"cards"|"metrics",autoHeight:options?.autoHeight ?? true}})}/></Field>
    <Field label={ru?"Поле быстрых фильтров":"Quick filter field"}><Dropdown ariaLabel={ru?"Поле быстрых фильтров":"Quick filter field"} value={widget.sqlQuickFilterField ?? ""} items={choices} onChange={value=>onChange({sqlQuickFilterField:value})}/></Field>
    <Field label={ru?"Вид быстрых фильтров":"Quick filter style"}><Dropdown ariaLabel={ru?"Вид быстрых фильтров":"Quick filter style"} value={widget.sqlQuickFilterStyle ?? "buttons"} items={[{value:"buttons",label:ru?"Кнопки":"Buttons"},{value:"select",label:ru?"Список выбора":"Select"}]} onChange={value=>onChange({sqlQuickFilterStyle:value as "buttons"|"select"})}/></Field>
    <Field label={ru?"Поле поиска":"Search field"}><Dropdown ariaLabel={ru?"Поле поиска":"Search field"} value={widget.sqlSearchField ?? ""} items={choices} onChange={value=>onChange({sqlSearchField:value})}/></Field>
    {options && <>
      <Field label={ru?"Стиль значения справа":"Trailing value style"}><Dropdown ariaLabel={ru?"Стиль значения справа":"Trailing value style"} value={options.badgeStyle ?? "plain"} items={[{value:"plain",label:ru?"Текст":"Text"},{value:"pill",label:ru?"Бейдж":"Badge"}]} onChange={value=>update({badgeStyle:value as "plain"|"pill"})}/></Field>
      {(options.layout === "cards" || options.layout === "metrics") && <Field label={ru?"Карточек в ряд":"Cards per row"}><Input type="number" aria-label={ru?"Карточек в ряд":"Cards per row"} min={1} max={4} value={options.columns ?? 3} onChange={event=>update({columns:Math.max(1,Math.min(4,Number(event.target.value)||3))})}/></Field>}
      {options.layout === "metrics" && <>
        {([['progressValueField',ru?'Поле использованного значения':'Measured value field'],['progressMaxField',ru?'Поле лимита / цели':'Limit / target field'],['footerField',ru?'Подпись внизу карточки':'Card footer field']] as const).map(([key,label])=><Field key={key} label={label}><Dropdown ariaLabel={label} value={options[key] ?? ""} items={choices} onChange={value=>update({[key]:value})}/></Field>)}
        <Field label={ru?'Подпись показателя':'Value caption'}><Input aria-label={ru?'Подпись показателя':'Value caption'} value={options.progressCaption ?? ""} onChange={event=>update({progressCaption:event.target.value})}/></Field>
        <Field label={ru?'Единица прогресса':'Progress unit'}><Input aria-label={ru?'Единица прогресса':'Progress unit'} value={options.progressUnit ?? ""} onChange={event=>update({progressUnit:event.target.value})}/></Field>
        <Field label={ru?'Знаков в прогрессе':'Progress decimal places'}><Input type="number" min={0} max={4} aria-label={ru?'Знаков в прогрессе':'Progress decimal places'} value={options.progressDecimals ?? 1} onChange={event=>update({progressDecimals:Math.max(0,Math.min(4,Number(event.target.value)||0))})}/></Field>
      </>}
      {([['highlightField',ru?'Поле выделения строки':'Row highlight field'],['photoField',ru?'Поле фото':'Photo field'],['titleField',ru?'Заголовок записи':'Record title'],['subtitleField',ru?'Подпись записи':'Record subtitle'],['badgeField',ru?'Значение справа':'Trailing value'],['secondaryField',ru?'Подпись справа':'Trailing detail'],['groupField',ru?'Ключ группы':'Group key'],['groupLabelField',ru?'Название группы':'Group label'],['filterLabelField',ru?'Подпись кнопки группы':'Group button label']] as const).map(([key,label])=><Field key={key} label={label}><Dropdown ariaLabel={label} value={options[key] ?? ""} items={choices} onChange={value=>update({[key]:value})}/></Field>)}
      {([['avatar',ru?'Инициалы в круге':'Initials avatar'],['groupFilter',ru?'Кнопки фильтра групп':'Group filter buttons'],['calendarIcon',ru?'Иконка календаря в группе':'Calendar group icon'],['autoHeight',ru?'Автоматическая высота всего списка':'Automatic height for the complete list']] as const).map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options[key] ?? false} onChange={event=>update({[key]:event.target.checked})}/>{label}</label>)}
      <Field label={ru?"Текст полностью пустого набора":"Empty dataset text"}><Input aria-label={ru?"Текст полностью пустого набора":"Empty dataset text"} value={options.emptyDatasetLabel ?? ""} onChange={event=>update({emptyDatasetLabel:event.target.value})}/></Field>
      <Field label={ru?'Текст пустой группы':'Empty group text'}><Input aria-label={ru?'Текст пустой группы':'Empty group text'} value={options.emptyLabel ?? ""} onChange={event=>update({emptyLabel:event.target.value})}/></Field>
      <Field label={ru?'Текст кнопки всех групп':'All groups button text'}><Input aria-label={ru?'Текст кнопки всех групп':'All groups button text'} value={options.allLabel ?? (ru?'Все':'All')} onChange={event=>update({allLabel:event.target.value})}/></Field>
    </>}
  </>;
}
