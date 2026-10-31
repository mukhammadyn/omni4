import { useTranslation } from 'react-i18next';
import { Field, Input } from '@/shared/ui/input';
import type { Widget } from '../model/dashboard';
export function WidgetSectionOptions({widget,onChange}:{widget:Widget;onChange:(patch:Partial<Widget>)=>void}) {
  const {i18n}=useTranslation(),ru=i18n.language.startsWith('ru'),section=widget.section;
  const update=(patch:Partial<NonNullable<Widget['section']>>)=>onChange({section:{id:'',paddingX:16,paddingY:12,framed:true,flow:true,stretch:true,...section,...patch}});
  return <details><summary className="cursor-pointer text-sm text-fg-muted">{ru?'Общая секция виджетов':'Shared widget section'}</summary><div className="mt-2 flex flex-col gap-2">
    <Field label={ru?'Название секции':'Section name'}><Input aria-label={ru?'Название секции':'Section name'} maxLength={80} value={section?.id ?? ''} onChange={event=>event.target.value ? update({id:event.target.value}) : onChange({section:undefined})}/></Field>
    {section && <>
      <p className="text-2xs text-fg-muted">{ru?'Виджеты с одинаковым названием объединяются. Изменения отступов и рамки применяются ко всей секции.':'Matching names group widgets. Padding and frame changes apply to the entire section.'}</p>
      {([['paddingX',ru?'Боковой отступ секции, px':'Section horizontal padding, px'],['paddingY',ru?'Вертикальный отступ секции, px':'Section vertical padding, px']] as const).map(([key,label])=><Field key={key} label={label}><Input type="number" min={0} max={40} aria-label={label} value={section[key]} onChange={event=>update({[key]:Math.max(0,Math.min(40,Number(event.target.value)||0))})}/></Field>)}
      {([['framed',ru?'Рамка секции':'Section frame'],['flow',ru?'Подтягивать строки по содержимому':'Flow rows with content'],['stretch',ru?'Одинаковая высота соседних карточек':'Equal height for matching row cards']] as const).map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section[key]} onChange={event=>update({[key]:event.target.checked})}/>{label}</label>)}
    </>}
  </div></details>;
}
