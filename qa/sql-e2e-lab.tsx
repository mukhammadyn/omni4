/* eslint-disable @typescript-eslint/no-explicit-any -- Development-only synthetic metadata adapter. SQL rows always come from the real fixture gateway/builder/PG. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, httpAuth } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import i18n from "@/shared/lib/i18n";
import { DatasetEditor } from "@/features/dashboard/ui/DatasetEditor";
import { WidgetGrid } from "@/features/dashboard/ui/WidgetGrid";
import { SqlDatasetRunner } from "@/features/dashboard/ui/SqlDatasetRunner";
import type { Dataset } from "@/features/dashboard/model/datasets";
import type { Widget } from "@/features/dashboard/model/dashboard";
import "@/app/styles.css";

if (!import.meta.env.DEV) throw new Error("Development-only SQL fixture");
await i18n.changeLanguage("en");
const menuId="00000000-0000-0000-0000-000000000010";
const joinSQL='SELECT "e"."name" AS "label", "d"."currency", COUNT(*) AS "total"\nFROM "deals" AS "d"\nLEFT JOIN "employees" AS "e" ON "d"."owner_id" = "e"."guid"\nGROUP BY "e"."name", "d"."currency"\nORDER BY "total" DESC\nLIMIT 100';
async function actor(value:string){const response=await fetch("/_sql-fixture/session/"+value,{cache:"no-store"}); const bearer=response.headers.get("Authorization");if(!bearer?.startsWith("Bearer "))throw new Error("Synthetic fixture session unavailable");session.set({access:bearer.slice(7),refresh:"",projectId:value==="other-project"?"00000000-0000-0000-0000-000000000011":"00000000-0000-0000-0000-000000000001",environmentId:value==="other-project"?"00000000-0000-0000-0000-000000000012":"00000000-0000-0000-0000-000000000002",userId:"00000000-0000-0000-0000-000000000030"});session.setProfile({name:value,role:value==="denied"?"NO_DASHBOARD":"ANALYST",company:"Synthetic fixture"});session.setPermissions({deals:{read:true},employees:{read:true}})}
await actor("allowed");
const metadata:Record<string,any[]>={deals:[{id:"00000000-0000-0000-0000-000000000201",slug:"guid",label:"ID",type:"UUID"},{id:"00000000-0000-0000-0000-000000000202",slug:"owner_id",label:"Owner",type:"LOOKUP",relation_field:"fixture-relation"},{id:"00000000-0000-0000-0000-000000000203",slug:"amount",label:"Amount",type:"NUMBER"},{id:"00000000-0000-0000-0000-000000000204",slug:"currency",label:"Currency",type:"SINGLE_LINE"}],employees:[{id:"00000000-0000-0000-0000-000000000208",slug:"guid",label:"ID",type:"UUID"},{id:"00000000-0000-0000-0000-000000000209",slug:"name",label:"Name",type:"SINGLE_LINE"}]};
const nativeAdapter=axios.getAdapter(http.defaults.adapter);
http.defaults.adapter=async config=>{
  const path=(config.url??"").split("?")[0]!,parts=path.split("/").filter(Boolean);let data:unknown;
  if(path.startsWith("/v1/custom-endpoints"))return nativeAdapter(config);
  if(path==="/v2/collections")data={tables:[{id:"fixture-deals",slug:"deals",label:"Deals"},{id:"fixture-employees",slug:"employees",label:"People"}]};
  else if(path.startsWith("/v2/fields/"))data={fields:metadata[parts[2]!]??[]};
  else if(path.startsWith("/v2/relations/")){const relation={id:"fixture-relation",type:"Many2One",table_from:{id:"fixture-deals",slug:"deals"},table_to:{id:"fixture-employees",slug:"employees",label:"People"},field_from:"owner_id",view_fields:metadata["employees"]};data=parts.length>3?relation:{relations:parts[2]==="deals"?[relation]:[]}}
  else if(path.includes("/layout/"))data={fields:metadata[parts[2]!]??[],sections:[{id:"fixture-section",fields:(metadata[parts[2]!]??[]).map(field=>({...field,attributes:{field_permission:{view_permission:true}}}))}]};
  else if(path.startsWith("/v2/object/get-list/"))data={data:{count:0,response:[]}};
  else throw new Error("External/unexpected request blocked by fixture: "+path);
  return {config,data:{status:"OK",data},status:200,statusText:"OK",headers:{}};
};
httpAuth.defaults.adapter=async()=>{throw new Error("External auth requests are blocked; only synthetic gateway sessions are used")};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});

function Lab(){
  const [sql,setSQL]=useState(joinSQL),[open,setOpen]=useState(false),[editing,setEditing]=useState(false),[dark,setDark]=useState(false);
  const [datasets,setDatasets]=useState<Dataset[]>(()=>JSON.parse(localStorage.getItem("omni4.qa.sql.datasets")??"null")??[{id:"fixture-join",name:"Dashboard-wide count",source:{kind:"sql",sql:joinSQL,parameters:[],columns:[]}}]);
  const [widgets,setWidgets]=useState<Widget[]>(()=>JSON.parse(localStorage.getItem("omni4.qa.sql.widgets")??"[]"));
  const save=(next:Dataset[])=>{setDatasets(next);localStorage.setItem("omni4.qa.sql.datasets",JSON.stringify(next))};
  return <QueryClientProvider client={client}><main data-theme={dark?"dark":"light"} className="min-h-screen bg-bg p-4 text-fg"><header className="mb-4 flex flex-wrap gap-3 text-sm"><strong>Existing SQL API and PostgreSQL; synthetic auth/company context; no production connection</strong><button onClick={()=>actor("allowed")}>Allowed actor</button><button onClick={()=>{void actor("denied")}}>Denied dashboard actor</button><button onClick={()=>{void actor("revoked")}}>Revoked session</button><button onClick={()=>actor("other-project")}>Other project: flag off</button><button onClick={()=>setDark(!dark)}>Theme</button><button onClick={()=>{void i18n.changeLanguage(i18n.language==="en"?"ru":"en")}}>Language</button><button onClick={()=>setOpen(true)}>Open advanced datasets</button><button onClick={()=>{localStorage.removeItem("omni4.qa.sql.datasets");localStorage.removeItem("omni4.qa.sql.widgets");location.reload()}}>Reset fixture UI</button></header><section className="mx-auto mb-8 flex max-w-[950px] flex-col gap-3"><h1 className="text-xl font-semibold">Advanced SQL/JOIN preview</h1><label className="flex flex-col gap-2">SQL<textarea aria-label="SQL" className="h-44 rounded border border-border bg-surface p-2 font-mono text-xs" value={sql} onChange={event=>setSQL(event.target.value)}/></label><SqlDatasetRunner menuId={menuId} sql={sql} parameters={[{name:"minimum",type:"number",required:true}]} /></section><section className="mx-auto max-w-[1100px]"><h2 className="mb-2 text-lg font-semibold">Saved SQL widgets</h2><button onClick={()=>setEditing(!editing)}>{editing?"Finish widget editing":"Manage SQL widgets"}</button><WidgetGrid widgets={widgets} datasets={datasets} menuId={menuId} filters={[]} values={{}} editing={editing} editable onBeginEditing={()=>setEditing(true)} onWidgets={next=>{setWidgets(next);localStorage.setItem("omni4.qa.sql.widgets",JSON.stringify(next))}} onSourceSave={(nextWidgets,nextDatasets)=>{save(nextDatasets);setWidgets(nextWidgets);localStorage.setItem("omni4.qa.sql.widgets",JSON.stringify(nextWidgets))}}/></section>{open&&<DatasetEditor datasets={datasets} menuId={menuId} onClose={()=>setOpen(false)} onSave={async next=>{save(next);return true}} onCreateWidget={async(next,widget)=>{save(next);const nextWidgets=[...widgets,widget];setWidgets(nextWidgets);localStorage.setItem("omni4.qa.sql.widgets",JSON.stringify(nextWidgets));return true}}/>}</main></QueryClientProvider>
}
const root = createRoot(document.getElementById("root")!);
root.render(<Lab/>);
import.meta.hot?.dispose(() => root.unmount());
