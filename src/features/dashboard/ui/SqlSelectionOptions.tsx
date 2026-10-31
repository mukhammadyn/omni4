import { useTranslation } from "react-i18next";
import type { Field as TableField } from "@/features/table";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import type { Widget } from "../model/dashboard";
import type { SqlSelectionRule } from "../model/sql-result-filters";
export function SqlSelectionOptions({widget,fields,onChange}:{widget:Widget;fields:TableField[];onChange:(patch:Partial<Widget>)=>void}) {
  const {i18n}=useTranslation(),ru=i18n.language.startsWith("ru");
  const rules=widget.sqlSelectionRules ?? {};
  const update=(series:string,patch:Partial<SqlSelectionRule>)=>onChange({sqlSelectionRules:{...rules,[series]:{field:"",operator:"equals",...rules[series],...patch}}});
  return <details><summary className="cursor-pointer text-sm text-fg-muted">{ru?'Фильтр по отдельным сериям':'Series selection filters'}</summary><div className="mt-2 flex flex-col gap-3">
    <Field label={ru?'Поле значения выбранной категории':'Selected category value field'}><Dropdown ariaLabel={ru?'Поле значения выбранной категории':'Selected category value field'} value={widget.sqlSelectionValueField ?? ""} items={[{value:"",label:ru?'Подпись категории':'Category label'},...fields.map(field=>({value:field.slug,label:field.label}))]} onChange={value=>onChange({sqlSelectionValueField:value})}/></Field>
    {(widget.measures ?? []).map((measure,index)=><fieldset key={measure.id} className="flex flex-col gap-2 rounded border border-border p-2"><legend className="text-xs text-fg-muted">{measure.label || measure.field || `${index+1}`}</legend>
      <Field label={ru?'Поле принимающей таблицы':'Receiving table field'}><Input aria-label={`${ru?'Поле фильтра серии':'Series filter field'} ${index+1}`} value={rules[measure.id]?.field ?? ""} onChange={event=>update(measure.id,{field:event.target.value})}/></Field>
      <Field label={ru?'Операция':'Operation'}><Dropdown ariaLabel={`${ru?'Операция серии':'Series operation'} ${index+1}`} value={rules[measure.id]?.operator ?? "equals"} items={[{value:"equals",label:ru?'Равно':'Equals'},{value:"month",label:ru?'Дата в выбранном месяце':'Date in selected month'},{value:"activeAt",label:ru?'Начало ≤ дата < конец':'Start ≤ date < end'}]} onChange={value=>update(measure.id,{operator:value as SqlSelectionRule['operator']})}/></Field>
      {rules[measure.id]?.operator === "activeAt" && <Field label={ru?'Поле даты окончания':'End date field'}><Input aria-label={`${ru?'Конец интервала серии':'Series end field'} ${index+1}`} value={rules[measure.id]?.endField ?? ""} onChange={event=>update(measure.id,{endField:event.target.value})}/></Field>}
    </fieldset>)}
    <p className="text-2xs text-fg-muted">{ru?'Выбор сужает только загруженные разрешённые строки. Неизвестная дата начала не соответствует интервалу; пустая дата окончания означает открытый интервал.':'Selections narrow only permitted loaded records. Missing start dates do not match; a missing end date leaves the interval open.'}</p>
  </div></details>;
}
