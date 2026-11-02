import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chartSeries, newChart } from "@/features/item";
import { sqlMeasuresReady } from "../model/sql-widget";
import { queryImageHref } from "../model/query-result";
import { SqlResultView } from "./SqlDatasetRunner";
vi.mock("react-i18next", async original => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({t:(key:string)=>key,i18n:{language:"en"}}) }));
const fields=[{slug:"label",type:"SINGLE_LINE"},{slug:"hires",type:"NUMBER"},{slug:"total",type:"NUMBER"}];
test("compact numeric cards without suffixes honor the same responsive statistic renderer",()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:"n",type:"int8"}],rows:[{n:"14"}],limit:100,truncated:false}} presentation={{type:"chart",kind:"stat",group:"",value:"n",split:"",appearance:{valueSize:24,decimals:0}}}/>);
 expect(html).toContain("data-sql-stat-value");expect(html).toContain("font-size:24px");expect(html).not.toContain("min-h-[150px]");expect(html).toContain(">14<");
});
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
 expect(html).not.toContain(">30<");
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
test('bar headroom ends on a regular numeric tick instead of adding a crowded last tick',()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'category',type:'text'},{key:'n',type:'int4'}],rows:[{category:'A',n:85},{category:'B',n:86}],limit:100,truncated:false}} presentation={{type:'chart',kind:'bar',group:'category',value:'n',split:'',appearance:{axisTicks:true,barValueLabels:'both',axisHeadroom:28}}}/>);
 expect(html).toMatch(/data-axis-tick[^>]+>120<\/span>/);expect(html).not.toMatch(/data-axis-tick[^>]+>111<\/span>/);
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

test('cool pie palette cycles consistently beyond six real categories',()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'label',type:'text'},{key:'n',type:'int4'}],rows:Array.from({length:8},(_,i)=>({label:`Group${i}`,n:1})),limit:100,truncated:false}} presentation={{type:'chart',kind:'pie',group:'label',value:'n',split:'',appearance:{palette:'cool'}}}/>);
 expect(html.match(/fill:var\(--color-chart-cool-1\)/g)).toHaveLength(2);expect(html.match(/fill:var\(--color-chart-cool-2\)/g)).toHaveLength(2);expect(html).not.toContain('fill:var(--color-chart-7)');
});
test('compact statistic line height is an explicit editable presentation value',()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'months',type:'numeric'}],rows:[{months:'8.2'}],limit:100,truncated:false}} presentation={{type:'chart',kind:'stat',group:'',value:'months',split:'',suffix:'mo.',appearance:{valueSize:24,valueLineHeight:1}}}/>);
 expect(html).toContain('font-size:24px');expect(html).toContain('line-height:1');expect(html).toContain('8.2');
});

test('combo lines do not inherit a fill class that overrides SVG fill=none',()=>{
 for(const smoothLine of [true,false]) {
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'month',type:'text'},{key:'hires',type:'int4'},{key:'total',type:'int4'}],rows:[{month:'A',hires:2,total:9},{month:'B',hires:3,total:10}],limit:100,truncated:false}} presentation={{type:'chart',kind:'combo',group:'month',value:'hires',split:'',measures:[{id:'hires',field:'hires',aggregation:'sum',display:'column'},{id:'total',field:'total',aggregation:'sum',display:'line',axis:'right'}],appearance:{smoothLine}}}/>);
 const line=(html.match(/<(?:path|polyline)[^>]+>/g)??[]).find(tag=>tag.includes('stroke-chart-2'));
 expect(line).toBeDefined();expect(line).toContain('fill="none"');expect(line).not.toContain('fill-chart-2');
 }
});

test('all twelve month labels keep their calendar slots with both Y axes and titles',()=>{
 const rows=Array.from({length:12},(_,i)=>({month:`Month ${i+1}`,n:i+1,total:30+i}));
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:'month',type:'text'},{key:'n',type:'int4'},{key:'total',type:'int4'}],rows,limit:100,truncated:false}} presentation={{type:'chart',kind:'combo',group:'month',value:'n',split:'',measures:[{id:'n',field:'n',aggregation:'sum',display:'column'},{id:'total',field:'total',aggregation:'sum',display:'line',axis:'right'}],appearance:{axisTicks:true,axisTitleLeft:'Hires',axisTitleRight:'Total'}}}/>);
 expect(html).toContain('data-cartesian-plot');expect(html).toContain('grid-column:3;grid-row:2');expect(html).toContain('repeat(12,minmax(0,1fr))');
 for(let month=1;month<=12;month++) expect(html).toContain(`grid-column:${month}`);
 expect(html).toContain('Month 12');expect(html).not.toContain('pl-16');
});
test('a dense bottom legend keeps every full label and a nonshrinking pie',()=>{
 const rows=Array.from({length:8},(_,i)=>({label:`Очень длинная причина увольнения номер ${i+1}`,n:1}));
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="ru" result={{columns:[{key:'label',type:'text'},{key:'n',type:'int4'}],rows,limit:100,truncated:false}} presentation={{type:'chart',kind:'pie',group:'label',value:'n',split:'',appearance:{legendPosition:'bottom',pieSize:240,legendPercent:true}}}/>);
 expect(html).toContain('height:240px');expect(html).toContain('flex-shrink:0');expect(html).not.toContain('calc(100% - 40px)');
 for(const row of rows) expect(html).toContain(row.label);
 expect(html.match(/12[,.]50%/g)?.length).toBe(8);expect(html).toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
});

test("unknown measures retain an explicit editable explanation while measured zero stays zero",()=>{
 const result={columns:[{key:"minutes",type:"numeric"},{key:"coverage",type:"text"}],rows:[{minutes:null,coverage:"План известен у 34 сотрудников"}],limit:100,truncated:false};
 const presentation={type:"chart" as const,kind:"stat" as const,group:"",value:"minutes",split:"",emptyLabel:"Перерывы отдельно не записаны",captionField:"coverage"};
 const unknown=renderToStaticMarkup(<SqlResultView displayOnly language="ru" result={result} presentation={presentation}/>);
 expect(unknown).toContain("Перерывы отдельно не записаны");
 expect(unknown).not.toContain("data-sql-stat-value");expect(unknown).toContain("data-sql-stat-caption");expect(unknown).toContain("План известен у 34 сотрудников");
 const zero=renderToStaticMarkup(<SqlResultView displayOnly language="ru" result={{...result,rows:[{minutes:0}]}} presentation={presentation}/>);
 expect(zero).toContain("data-sql-stat-value");expect(zero).not.toContain("Перерывы отдельно не записаны</p>");
});

test("categorical SQL lines share numeric axes, adaptive label slots and point interactions",()=>{
 const rows=[{day:"16.06.2026",source:"A",n:1},{day:"16.06.2026",source:"B",n:2},{day:"01.09.2026",source:"A",n:2},{day:"01.09.2026",source:"B",n:0}];
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="ru" onPick={()=>{}} result={{columns:[{key:"day",type:"text"},{key:"source",type:"text"},{key:"n",type:"int4"}],rows,limit:100,truncated:false}} presentation={{type:"chart",kind:"line",group:"day",split:"source",value:"n",appearance:{axisTicks:true,axisTitleLeft:"Кандидаты",sharedTooltip:true,smoothLine:true,decimals:0}}}/>);
 expect(html).toContain("data-cartesian-labels");expect(html).toContain("Кандидаты");expect(html).toContain("16.06.2026");expect(html).toContain("01.09.2026");
 expect(html.match(/<circle/g)?.length).toBe(4);expect(html).not.toContain("<rect");expect(html.match(/fill="none"/g)?.length).toBe(2);
 expect(html).toContain('aria-label="16.06.2026 · A: 1"');
});
test("SQL funnels retain long stage labels, zero stages, tooltips and gray unselected targets",()=>{
 const rows=[{stage:"Очень длинное название этапа собеседования",n:3},{stage:"Оффер",n:1},{stage:"Найм",n:0}];
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="ru" onPick={()=>{}} selectedKey="Оффер" result={{columns:[{key:"stage",type:"text"},{key:"n",type:"int4"}],rows,limit:100,truncated:false}} presentation={{type:"chart",kind:"funnel",group:"stage",split:"",value:"n"}}/>);
 expect(html).toContain(rows[0]!.stage);expect(html).toContain('role="button"');expect(html).toContain('bg-border-strong');expect(html).toContain('aria-label="Найм: 0"');
});

test("editable tapered funnels retain readable HTML labels and all stage counts",()=>{
 const html=renderToStaticMarkup(<SqlResultView displayOnly language="ru" onPick={()=>{}} selectedKey="Оффер" result={{columns:[{key:"stage",type:"text"},{key:"n",type:"int4"}],rows:[{stage:"Очень длинный этап интервью с руководителем",n:4},{stage:"Оффер",n:2}],limit:100,truncated:false}} presentation={{type:"chart",kind:"funnel",group:"stage",split:"",value:"n",appearance:{funnelStyle:"tapered"}}}/>);
 expect(html).toContain("data-funnel-tapered");expect(html.match(/data-funnel-step/g)?.length).toBe(2);expect(html).toContain("<polygon");expect(html).toContain("Очень длинный этап интервью с руководителем</p>");expect(html).toContain("fill-border-strong");expect(html).not.toContain("<text");
});

test("single-page navigation may be hidden without removing rows or multi-page controls",()=>{
 const render=(n:number)=>renderToStaticMarkup(<SqlResultView displayOnly language="en" result={{columns:[{key:"label",type:"text"}],rows:Array.from({length:n},(_,i)=>({label:`Row ${i}`})),limit:1000,truncated:false}} presentation={{type:"table",kind:"bar",group:"",value:"",split:"",pageSize:10,hideSinglePagePagination:true,fitContent:true}}/>);
 expect(render(1)).toContain("Row 0");expect(render(1)).not.toContain("1 / 1");expect(render(11)).toContain("1 / 2");expect(render(11)).not.toContain("Row 10");
});
