import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import type { DatasetParameter } from "../model/datasets";
import type { FilterValues } from "../model/filters";
import { dashboardSqlValues, PERIODS, sqlParameterKey, sqlPeriodKey, shiftPeriod, validSqlDate, type SqlPeriod } from "../model/sql-controls";
import { useSqlRunner } from "../api/sql-runner";

function SelectParameter({menuId,parameter,value,onValue}:{menuId:string;parameter:DatasetParameter;value:string;onValue:(v:string)=>void}){
 const {i18n}=useTranslation(),ru=i18n.language.startsWith("ru");
 const runner=useSqlRunner(menuId,parameter.optionsSql ?? "",[],{},1000);
 useEffect(()=>{if(parameter.optionsSql?.trim()&&runner.enabled)void runner.run();},[parameter.optionsSql,runner.enabled,runner.run]);
 const rows=runner.result?.rows ?? [], valid=runner.result?.columns.some(c=>c.key==="value")&&runner.result.columns.some(c=>c.key==="label");
 const items=rows.filter(r=>r["value"]!==null&&r["value"]!==undefined&&r["value"]!=="").map(r=>({value:String(r["value"]),label:String(r["label"] ?? r["value"])}));
 const error=runner.error || runner.result && (!valid || runner.result.truncated) ? true:false;
 return <div className="w-64 max-w-full"><Dropdown ariaLabel={parameter.controlLabel || parameter.name} value={value} items={[{value:"",label:parameter.controlLabel || (ru?"Все":"All")},...(!error ? items : []),...(value&&!items.some(i=>i.value===value)?[{value,label:value}]:[])]} onChange={onValue}/>{runner.busy&&<p role="status" className="text-xs text-fg-muted">{ru?"Загрузка вариантов…":"Loading options…"}</p>}{error&&<p role="alert" className="text-xs text-danger">{ru?"Не удалось загрузить полный список. Нужны колонки value и label.":"Could not load complete options. Output must include value and label."}</p>}</div>;
}
function PeriodControls({parameters,values,onValues}:{parameters:DatasetParameter[];values:FilterValues;onValues:(v:FilterValues)=>void}){
 const {i18n}=useTranslation(),ru=i18n.language.startsWith("ru"),start=parameters.find(p=>p.dashboardControl==="period_start")!,end=parameters.find(p=>p.dashboardControl==="period_end");
 const current=dashboardSqlValues(parameters,values),signature=JSON.stringify(current),group=start.controlGroup!;
 const [draft,setDraft]=useState(current);useEffect(()=>setDraft(JSON.parse(signature) as Record<string,string>),[signature]);
 if(!end)return <p role="alert">{ru?"Настройте начало и конец периода в одной группе.":"Configure start and end in one period group."}</p>;
 const selected=values[sqlPeriodKey(group)],mode=(selected?.[0] ?? start.defaultPeriod ?? "custom") as SqlPeriod,anchor=selected?.[1] ?? new Date().toISOString().slice(0,10);
 const label:Record<SqlPeriod,string>=ru?{week:"Неделя",month:"Месяц",year:"Год",all:"Всё время",custom:"Период"}:{week:"Week",month:"Month",year:"Year",all:"All time",custom:"Custom"};
 const putPeriod=(next:SqlPeriod,nextAnchor=anchor)=>onValues({...values,[sqlPeriodKey(group)]:[next,nextAnchor]});
 const reset=()=>onValues(Object.fromEntries(Object.entries(values).filter(([k])=>![sqlPeriodKey(group),...parameters.map(p=>sqlParameterKey(p.name))].includes(k))));
 return <div className="flex max-w-full flex-wrap items-center gap-2" aria-label={start.controlLabel || group}>
 {PERIODS.map(p=><Button key={p} size="sm" variant={mode===p?"primary":"secondary"} aria-pressed={mode===p} onClick={()=>putPeriod(p)}>{label[p]}</Button>)}
 {mode!=="all"&&mode!=="custom"&&<><Button size="sm" variant="secondary" aria-label={ru?"Предыдущий период":"Previous period"} onClick={()=>putPeriod(mode,shiftPeriod(mode,anchor,-1))}>←</Button><span className="text-sm tabular-nums">{current[start.name]} — {current[end.name]}</span><Button size="sm" variant="secondary" aria-label={ru?"Следующий период":"Next period"} onClick={()=>putPeriod(mode,shiftPeriod(mode,anchor,1))}>→</Button></>}
 {mode==="custom"&&<><Input style={{width:160,maxWidth:"100%"}} type="date" aria-label={ru?"Начало периода":"Period start"} value={draft[start.name] ?? ""} onInput={e=>setDraft({...draft,[start.name]:e.currentTarget.value})}/><Input style={{width:160,maxWidth:"100%"}} type="date" aria-label={ru?"Конец периода":"Period end"} value={draft[end.name] ?? ""} onInput={e=>setDraft({...draft,[end.name]:e.currentTarget.value})}/><Button size="sm" disabled={!validSqlDate(draft[start.name])||!validSqlDate(draft[end.name])||draft[start.name]!>draft[end.name]!} onClick={()=>onValues({...values,[sqlPeriodKey(group)]:["custom",anchor],[sqlParameterKey(start.name)]:[draft[start.name]!],[sqlParameterKey(end.name)]:[draft[end.name]!]})}>{ru?"Применить":"Apply"}</Button></>}
 <Button size="sm" variant="ghost" onClick={reset}>{ru?"Сбросить период":"Reset period"}</Button></div>;
}
export function SqlParameterControls({menuId,parameters,values,onValues}:{menuId:string;parameters:DatasetParameter[];values:FilterValues;onValues:(v:FilterValues)=>void}){
 const resolved=dashboardSqlValues(parameters,values),groups=[...new Set(parameters.filter(p=>p.dashboardControl==="period_start"&&p.controlGroup).map(p=>p.controlGroup!))];
 const put=(name:string,value:string)=>onValues({...values,[sqlParameterKey(name)]:[value]});
 return parameters.length ? <div className="flex flex-wrap items-center gap-3" aria-label="SQL parameters">{groups.map(group=><PeriodControls key={group} parameters={parameters.filter(p=>p.controlGroup===group)} values={values} onValues={onValues}/>)}{parameters.filter(p=>!p.dashboardControl?.startsWith("period_")).map(p=>p.dashboardControl==="select"?<SelectParameter key={p.name} menuId={menuId} parameter={p} value={resolved[p.name] ?? ""} onValue={value=>put(p.name,value)}/>:<label key={p.name} className="text-sm">{p.controlLabel || p.name}<Input className="w-48" type={p.type==="date"?"date":"text"} aria-label={p.controlLabel||p.name} value={resolved[p.name] ?? ""} onChange={e=>put(p.name,e.target.value)}/></label>)}</div>:null;
}
