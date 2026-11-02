import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newChart } from "@/features/item";
import { queryFields } from "../model/query-result";
import { SqlDatasetRunner } from "./SqlDatasetRunner";
import { SqlSortPresetOptions } from "./SqlSortPresetOptions";
const result={columns:[{key:"name",type:"text"},{key:"minutes",type:"numeric"}],rows:Array.from({length:119},(_,i)=>({name:`Employee ${String(i+1).padStart(3,"0")}`,minutes:String(i+1)})),limit:1000,truncated:false};
vi.mock("react-i18next",async original=>({...await original<typeof import("react-i18next")>(),useTranslation:()=>({t:(key:string)=>key,i18n:{language:"en"}})}));
vi.mock("../api/sql-runner",()=>({useSqlRunner:()=>({result,enabled:true,scopeKey:"test",maxRows:1000})}));
vi.mock("../api/sql-catalog",()=>({useSqlCatalog:()=>({tables:[]})}));
const sortPresets=[{label:"Alphabetical",field:"name",direction:"asc" as const,nulls:"last" as const},{label:"Worked time",field:"minutes",direction:"desc" as const,nulls:"last" as const}];
test("viewer default sort uses hidden numeric fields across all pages and retains search",()=>{
 const html=renderToStaticMarkup(<SqlDatasetRunner displayOnly menuId="test" sql="SELECT name,minutes FROM employees" parameters={[]} presentation={{type:"table",kind:"bar",group:"",value:"",split:"",pageSize:25,columns:["name"],sortPresets,defaultSortPreset:1,searchField:"name"}}/>);
 expect(html).toContain('aria-label="Table sorting"');expect(html).toContain('aria-label="Search table"');
 expect(html).toContain("Worked time");expect(html).toContain("1–25 / 119");
 expect(html.indexOf("Employee 119")).toBeLessThan(html.indexOf("Employee 118"));
 expect(html).not.toContain("Employee 094");expect(html).not.toContain('scope="col">minutes');
});
test("removed preset fields fall back to the first available choice without index drift",()=>{
 const html=renderToStaticMarkup(<SqlDatasetRunner displayOnly menuId="test" sql="SELECT name,minutes FROM employees" parameters={[]} presentation={{type:"table",kind:"bar",group:"",value:"",split:"",pageSize:25,sortPresets:[{...sortPresets[0]!,field:"removed"},sortPresets[1]!],defaultSortPreset:0}}/>);
 expect(html).toContain("Worked time");expect(html).not.toContain("Alphabetical");expect(html).toContain("Employee 119");
});
test("normal builder exposes editable labels, fields, directions, unknown ordering and default",()=>{
 const html=renderToStaticMarkup(<SqlSortPresetOptions widget={{...newChart(),tableSlug:"",filters:{},answers:{},sqlSortPresets:sortPresets,sqlDefaultSortPreset:1}} fields={queryFields(result)} onChange={()=>{}}/>);
 for(const control of ["Sort 1 label","Sort 1 field","Sort 1 direction","Sort 1 unknowns","Default sort"]) expect(html).toContain(`aria-label="${control}"`);
 expect(html).toContain("Add sort preset");expect(html).toContain("Worked time");
});
