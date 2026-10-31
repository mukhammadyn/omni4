import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chartSeries, newChart } from "@/features/item";
import { sqlMeasuresReady } from "../model/sql-widget";
import { queryImageHref } from "../model/query-result";
import { SqlResultView } from "./SqlDatasetRunner";
vi.mock("react-i18next", async original => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({t:(key:string)=>key,i18n:{language:"en"}}) }));
const fields=[{slug:"label",type:"SINGLE_LINE"},{slug:"hires",type:"NUMBER"},{slug:"total",type:"NUMBER"}];
test("SQL measures validate every selected result column",()=>{
 expect(sqlMeasuresReady({valueSlug:"hires",measures:[{id:"h",field:"hires",aggregation:"sum"},{id:"t",field:"total",aggregation:"max"}]},fields)).toBe(true);
 expect(sqlMeasuresReady({valueSlug:"hires",measures:[{id:"h",field:"label",aggregation:"sum"}]},fields)).toBe(false);
 expect(sqlMeasuresReady({valueSlug:"absent"},fields)).toBe(false);
});
test("combination charts retain explicit calendar ordering with independent axes",()=>{
 const config={...newChart(),kind:"combo" as const,groupSlug:"month",sorts:[{field:"order",direction:"asc" as const}],measures:[{id:"hires",field:"hires",aggregation:"sum" as const,display:"column" as const},{id:"total",field:"total",aggregation:"max" as const,display:"line" as const,axis:"right" as const}]};
 const series=chartSeries([{month:"January",order:2,hires:2,total:120},{month:"December",order:1,hires:3,total:118}],config);
 expect(series.points.map(p=>p.label)).toEqual(["December","January"]);
 expect(series.points[1]?.cells.get("total")).toBe(120);
 expect(series.splits[1]).toMatchObject({axis:"right",display:"line"});
});
test("SQL statistic averages returned periods and its numeric inline detail",()=>{
 const html=renderToStaticMarkup(<SqlResultView language="en" displayOnly result={{columns:[{key:"rate",type:"numeric"},{key:"people",type:"numeric"}],rows:[{rate:"10",people:"2"},{rate:"20",people:"4"}],limit:100,truncated:false}} presentation={{type:"chart",kind:"stat",group:"",value:"rate",split:"",aggregation:"avg",detailField:"people",detailPlacement:"inline",detailSuffix:"people",suffix:"%"}}/>);
 expect(html).toContain("15"); expect(html).toContain("3"); expect(html).toContain("people"); expect(html).toContain("data-sql-stat");
 expect(html).not.toContain("30");
});

test("grouped records preserve zero groups and safe internal links",()=>{
 const result={columns:[{key:"id",type:"text"},{key:"name",type:"text"},{key:"month",type:"text"},{key:"monthLabel",type:"text"}],rows:[{id:"a",name:"Example A",month:"1",monthLabel:"January"},{id:null,name:null,month:"2",monthLabel:"February"}],limit:100,truncated:false};
 const html=renderToStaticMarkup(<SqlResultView result={result} displayOnly language="en" presentation={{type:"table",kind:"bar",group:"",value:"",split:"",records:{layout:"cards",titleField:"name",groupField:"month",groupLabelField:"monthLabel",emptyLabel:"Nobody",avatar:true,groupFilter:true,autoHeight:true},linkField:"id",linkTemplate:"/employees/{value}"}}/>);
 expect(html).toContain("January");expect(html).toContain("February");expect(html).toContain("Nobody");expect(html).toContain('href="/employees/a"');expect(html).not.toContain("/employees/null");
});
test("empty numeric averages stay empty, while record counts return zero",()=>{
 const result={columns:[{key:"value",type:"numeric"}],rows:[],limit:100,truncated:false};
 const avg=renderToStaticMarkup(<SqlResultView result={result} displayOnly language="en" presentation={{type:"chart",kind:"stat",group:"",value:"value",split:"",aggregation:"avg",suffix:"%"}}/>);
 expect(avg).toContain("No rows matched");
 const count=renderToStaticMarkup(<SqlResultView result={result} displayOnly language="en" presentation={{type:"chart",kind:"stat",group:"",value:"value",split:"",aggregation:"count",suffix:"records"}}/>);
 expect(count).toContain("records");expect(count).toContain(">0<");
});

test("inline KPI formatting handles a single exact numeric SQL row and fractional units",()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:"rate",type:"numeric"},{key:"people",type:"numeric"}],rows:[{rate:"0",people:"2.5"}],limit:100,truncated:false}} presentation={{type:"chart",kind:"stat",group:"",value:"rate",split:"",aggregation:"avg",detailField:"people",detailPlacement:"inline",detailSuffix:"people",detailSuffixFractional:"ppl.",detailDecimals:1,suffix:"%",suffixJoined:true,appearance:{decimals:1,minimumDecimals:1,valueSize:24,detailSize:24,detailEmphasis:true}}}/>);
 expect(html).toContain("0.0");expect(html).toContain("2.5");expect(html).toContain("ppl.");expect(html).not.toContain(">people<");
});
test("bar annotations show real category shares and support natural row height",()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:"category",type:"text"},{key:"n",type:"int4"}],rows:[{category:"A",n:3},{category:"B",n:1}],limit:100,truncated:false}} presentation={{type:"chart",kind:"bar",group:"category",value:"n",split:"",fitContent:true,appearance:{axisTicks:true,distributed:true,barValueLabels:"both",barRowHeight:46,minPlotHeight:220,axisHeadroom:28}}}/>);
 expect(html).toContain("75%");expect(html).toContain("25%");expect(html).toContain("height:220px");expect(html).toContain("--color-chart-cool-2");
});

test("a completely empty grouped dataset shows its configured empty state",()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:"name",type:"text"},{key:"month",type:"int4"}],rows:[{name:null,month:1},{name:null,month:2}],limit:100,truncated:false}} presentation={{type:"table",kind:"bar",group:"",value:"",split:"",records:{layout:"cards",titleField:"name",groupField:"month",emptyDatasetLabel:"Nobody has a birth date"}}}/>);
 expect(html).toContain("Nobody has a birth date");expect(html).not.toContain("<article");
});

test("record photos stay within the app's existing image destinations",()=>{
 expect(queryImageHref("media/photo.jpg","https://cdn.example/","https://app.example")).toBe("https://cdn.example/media/photo.jpg");
 expect(queryImageHref("https://tracker.example/photo.jpg","https://cdn.example/","https://app.example")).toBeUndefined();
 expect(queryImageHref("javascript:alert(1)","https://cdn.example/","https://app.example")).toBeUndefined();
});

test('record badges highlight only explicit boolean values and keep keyboard tooltip anchors',()=>{
 const result={columns:[{key:'name',type:'text'},{key:'today',type:'bool'},{key:'when',type:'text'}],rows:[{name:'A',today:true,when:'Today'},{name:'B',today:false,when:'Tomorrow'}],limit:100,truncated:false};
 const html=renderToStaticMarkup(<SqlResultView result={result} displayOnly language="en" presentation={{type:'table',kind:'bar',group:'',value:'',split:'',records:{layout:'list',titleField:'name',highlightField:'today',badgeField:'when',badgeStyle:'pill'}}}/>);
 expect(html.match(/bg-accent-solid/g)).toHaveLength(1);expect(html).toContain('rounded-full');expect(html).toContain('data-tooltip-anchor');expect(html).toContain('tabindex="0"');expect(html).toContain('Tomorrow');
});
test('SQL table cells retain accessible tooltips after field projection',()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'name',type:'text'}],rows:[{name:'A long table label'}],limit:100,truncated:false}} presentation={{type:'table',kind:'bar',group:'',value:'',split:'',tableFrame:true}}/>);
 expect(html).toContain('rounded-2xl border border-border');expect(html).toContain('data-tooltip-anchor');expect(html).toContain('A long table label');expect(html).toContain('tabindex="0"');
});
