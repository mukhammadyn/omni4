import type { Dataset, DatasetParameter } from "./datasets";
import type { FilterValues } from "./filters";
export const sqlParameterKey=(name:string)=>`sql-param:${name}`;
export const sqlPeriodKey=(group:string)=>`sql-period:${group}`;
export const PERIODS=["week","month","year","all","custom"] as const;
export type SqlPeriod=typeof PERIODS[number];
export function validSqlDate(value:string|undefined):value is string{return Boolean(value && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);}
export function dynamicSqlDefault(parameter:DatasetParameter,now=new Date()):string{
 const day=now.toISOString().slice(0,10),year=day.slice(0,4);
 switch(parameter.dynamicDefault){case "today":return day;case "year_start":return `${year}-01-01`;case "two_years_start":return `${String(Number(year)-2).padStart(4,"0")}-01-01`;default:return parameter.defaultValue ?? "";}
}
export function dashboardSqlControls(datasets:Dataset[],ids:Set<string>):DatasetParameter[]{
 const found=new Map<string,DatasetParameter>();
 for(const dataset of datasets)if(ids.has(dataset.id)&&dataset.source.kind==="sql")for(const p of dataset.source.parameters)if(p.dashboardControl && p.dashboardControl!=="month")found.set(p.name,p);
 return [...found.values()];
}
export function periodBounds(mode:SqlPeriod,anchor:string,now=new Date()):[string,string]{
 if(mode==="all")return ["0001-01-01","9999-12-31"];
 const date=new Date(`${validSqlDate(anchor)?anchor:now.toISOString().slice(0,10)}T12:00:00Z`),year=date.getUTCFullYear(),yearText=String(year).padStart(4,"0"),month=date.getUTCMonth();
 const iso=(d:Date)=>d.toISOString().slice(0,10);
 if(mode==="year")return [`${yearText}-01-01`,`${yearText}-12-31`];
 if(mode==="month"){const first=new Date(date),last=new Date(date);first.setUTCDate(1);last.setUTCMonth(month+1,0);return [iso(first),iso(last)];}
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);const start=iso(date);date.setUTCDate(date.getUTCDate()+6);return [start,iso(date)];
}
export function shiftPeriod(mode:SqlPeriod,anchor:string,amount:-1|1):string{
 if(!validSqlDate(anchor)||mode==="all"||mode==="custom")return anchor;
 const d=new Date(`${anchor}T12:00:00Z`);
 if(mode==="year"){d.setUTCMonth(0,1);d.setUTCFullYear(d.getUTCFullYear()+amount);}else if(mode==="month"){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+amount);}else d.setUTCDate(d.getUTCDate()+7*amount);
 return d.getUTCFullYear()<1||d.getUTCFullYear()>9999?anchor:d.toISOString().slice(0,10);
}
export function dashboardSqlValues(parameters:DatasetParameter[],values:FilterValues,now=new Date()):Record<string,string>{
 return Object.fromEntries(parameters.map(p=>{
   let value=values[sqlParameterKey(p.name)]?.[0] ?? dynamicSqlDefault(p,now);
   if(p.dashboardControl?.startsWith("period_")&&p.controlGroup){
     const selected=values[sqlPeriodKey(p.controlGroup)],mode=selected?.[0] ?? p.defaultPeriod ?? "custom";
     if(PERIODS.includes(mode as SqlPeriod)&&mode!=="custom")value=periodBounds(mode as SqlPeriod,selected?.[1] ?? now.toISOString().slice(0,10),now)[p.dashboardControl==="period_start"?0:1];
   }
   if(p.type==="date"&&!validSqlDate(value))value=dynamicSqlDefault(p,now);
   return [p.name,value];
 }));
}
