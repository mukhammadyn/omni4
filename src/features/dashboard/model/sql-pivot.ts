import type {QueryResult} from "./query-result";
export type SqlPivot={rowKey:string; rows:string[]; column:string; group?:string|undefined; value:string; after:string[]; zeroFill:boolean; totalFields?:string[]|undefined; totals:boolean};
export function parseSqlPivot(raw:unknown):SqlPivot|undefined{
 if(!raw||typeof raw!=="object")return;
 const p=raw as Record<string,unknown>;
 const keys=(v:unknown)=>Array.isArray(v)?v.filter((s):s is string=>typeof s==="string"&&s.length>0).slice(0,32):[];
 if(typeof p["rowKey"]!=="string"||typeof p["column"]!=="string"||typeof p["value"]!=="string")return;
 return {rowKey:p["rowKey"],rows:keys(p["rows"]),column:p["column"],value:p["value"],after:keys(p["after"]),...(typeof p["group"]==="string"?{group:p["group"]}:{}),zeroFill:p["zeroFill"]===true,...(Array.isArray(p["totalFields"])?{totalFields:keys(p["totalFields"])}:{}),totals:p["totals"]===true};
}
/** Exact decimal addition keeps payroll values out of binary floating-point sums. */
export function addSqlDecimal(a:string,b:string):string{
 const split=(v:string)=>{if(!/^[+-]?\d+(?:\.\d+)?$/.test(v))throw new Error("Pivot requires exact numeric values");const [whole,fraction=""]=v.split(".");return {digits:BigInt(`${whole}${fraction}`),scale:fraction.length};};
 const x=split(a),y=split(b),scale=Math.max(x.scale,y.scale),sum=x.digits*10n**BigInt(scale-x.scale)+y.digits*10n**BigInt(scale-y.scale),negative=sum<0n,absolute=(negative?-sum:sum).toString().padStart(scale+1,"0");
 return `${negative?"-":""}${scale?`${absolute.slice(0,-scale)}.${absolute.slice(-scale)}`:absolute}`;
}
export function pivotSqlResult(source:QueryResult,p:SqlPivot):{result:QueryResult;groups:Record<string,string>;totals:Record<string,string>} {
 const required=[p.rowKey,...p.rows,p.column,p.value,...p.after,...(p.group?[p.group]:[])];
 if(required.some(k=>!source.columns.some(c=>c.key===k)))throw new Error("Pivot field is absent from SQL output");
 if(!["numeric","int2","int4","int8","float4","float8"].includes(source.columns.find(c=>c.key===p.value)!.type))throw new Error("Pivot value must be numeric");
 const dimensions=[...new Set([p.rowKey,...p.rows,...p.after])],groups:Record<string,string>={},dynamic=new Map<string,{key:string;type:string;label:string}>(),rows=new Map<string,QueryResult["rows"][number]>(),totals:Record<string,string>={};
 for(const row of source.rows){
  const id=row[p.rowKey];if(id===null||id===undefined||id==="")throw new Error("Pivot row identifiers must be non-empty");
  const identity=String(id),previous=rows.get(identity);
  if(previous&&dimensions.some(k=>previous[k]!==row[k]))throw new Error("Pivot row dimensions changed within one identifier");
  const target=previous ?? Object.fromEntries(dimensions.map(k=>[k,row[k] ?? null]));rows.set(identity,target);
  if(row[p.column]===null||row[p.column]===undefined)continue;
  const group=p.group?String(row[p.group] ?? ""):"",label=String(row[p.column]),category=JSON.stringify([group,label]);
  if(!dynamic.has(category)){let key=`pivot_${dynamic.size}`;while(source.columns.some(c=>c.key===key))key=`_${key}`;dynamic.set(category,{key,type:"numeric",label});groups[key]=group;}
  const key=dynamic.get(category)!.key,value=row[p.value];
  if(value!==null&&value!==undefined)target[key]=addSqlDecimal(String(target[key] ?? "0"),String(value));
 }
 const columns=[...new Set([p.rowKey,...p.rows])].map(k=>source.columns.find(c=>c.key===k)!).concat([...dynamic.values()],p.after.filter(k=>k!==p.rowKey&&!p.rows.includes(k)).map(k=>source.columns.find(c=>c.key===k)!));
 if(columns.length>64)throw new Error("Pivot exceeds 64 columns; narrow its scope");
 const output=[...rows.values()].map(row=>Object.fromEntries(columns.map(c=>[c.key,row[c.key] ?? (p.zeroFill&&[...dynamic.values()].some(d=>d.key===c.key)?"0":null)])));
 if(p.totals)for(const c of columns)if((!p.totalFields?.length || p.totalFields.includes(c.key) || Object.hasOwn(groups,c.key)) && ["numeric","int2","int4","int8","float4","float8"].includes(c.type))for(const row of output)if(row[c.key]!==null)totals[c.key]=addSqlDecimal(totals[c.key] ?? "0",String(row[c.key]));
 return {result:{...source,columns,rows:output},groups,totals};
}
