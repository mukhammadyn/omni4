import {expect,test} from 'vitest';
import {newChart} from '@/features/item';
import {newDashboard,newFolder,toTree,toTreeAttribute,type Widget} from './dashboard';
import {layoutRow,layoutRows,layoutTop,layoutHeight} from './widget-layout';
import {parseWidgetSection,sectionCanvas,type WidgetSection} from './widget-sections';
const section:WidgetSection={id:'Overview',paddingX:16,paddingY:12,framed:true,flow:true,stretch:true};
const card=(id:string,top:number,height:number,width=12,column=1):Widget=>({...newChart(),id,tableSlug:'',filters:{},answers:{},width,layout:{column,row:layoutRow(top),rows:layoutRows(height)}});
test('section insets preserve the chart and stacked KPI geometry at fractional pixels',()=>{
 const widgets=[card('plot',13,439,9),card('kpi',13,102.5,3,10),card('kpi2',131.5,102.5,3,10),card('dept',468,350,6),card('branch',468,350,6,7)].map(w=>({...w,section}));
 const result=sectionCanvas(widgets,w=>layoutHeight(w.layout!.rows),true);
 expect(result.cards.plot).toEqual({top:13,height:439,inset:17});
 expect(result.cards.kpi2).toEqual({top:131.5,height:102.5,inset:17});
 expect(result.frames).toEqual([{id:'Overview',top:0,height:831}]);
 const width=1118-2*result.cards.plot!.inset;
 expect((width+16)*9/12-16).toBe(809);
 expect((width+16)*3/12-16).toBe(259);
});
test('growing bars stretch the matching row and move the table; filtering can shrink them again',()=>{
 const widgets=[{...card('plot',13,439),section},{...card('dept',468,350,6),section},{...card('branch',468,350,6,7),section},card('table',847,1000)];
 const result=sectionCanvas(widgets,w=>w.id==='dept'?530:layoutHeight(w.layout!.rows),true);
 expect(result.cards.dept!.height).toBe(530);expect(result.cards.branch!.height).toBe(530);
 expect(result.frames[0]!.height).toBe(1011);expect(result.cards.table!.top).toBe(1027);
 expect(widgets[3]!.layout!.row).toBe(layoutRow(847));
 const shrink=sectionCanvas(widgets,w=>w.id==='dept'||w.id==='branch'?290:layoutHeight(w.layout!.rows),true);
 expect(shrink.cards.table!.top).toBe(787);
});
test('frameless flow follows a shrinking list without changing saved coordinates',()=>{
 const options={...section,id:'Flow',paddingX:0,paddingY:0,framed:false};
 const widgets=[{...card('total',0,134),section:options},{...card('upcoming',150,510),section:options},{...card('months',676,1000),section:options}];
 const result=sectionCanvas(widgets,w=>w.id==='upcoming'?282:layoutHeight(w.layout!.rows),true);
 expect(result.cards.months!.top).toBe(448);expect(result.frames).toEqual([]);
 expect(sectionCanvas(widgets,w=>layoutHeight(w.layout!.rows),false).cards.months!.top).toBe(676);
});
test('section and toolbar/badge selections survive normal dashboard round trips',()=>{
 const widget={...card('kpi',131.5,102.5),section,appearance:{valueLineHeight:1},sqlSearchField:'name',sqlQuickFilterStyle:'select' as const,sqlTableFrame:true,sqlRecords:{layout:'list' as const,badgeStyle:'pill' as const,highlightField:'today'},sqlSelectionRules:{$category:{field:'start',operator:'activeAt' as const,endField:'end'}}};
 const tree={folders:[{...newFolder('m','Reports'),dashboards:[{...newDashboard('Report'),widgets:[widget]}]}]};
 const restored=toTree(toTreeAttribute(tree)).folders[0]!.dashboards[0]!.widgets[0]!;
 expect(restored.section).toEqual(section);expect(restored.appearance?.valueLineHeight).toBe(1);expect(restored.sqlRecords).toEqual(widget.sqlRecords);expect(restored.sqlSearchField).toBe('name');expect(restored.sqlQuickFilterStyle).toBe('select');expect(restored.sqlTableFrame).toBe(true);expect(restored.sqlSelectionRules).toEqual(widget.sqlSelectionRules);
 expect(layoutTop(restored.layout!.row)).toBe(131.5);expect(layoutHeight(restored.layout!.rows)).toBe(102.5);
 expect(parseWidgetSection({id:'',paddingX:Infinity})).toBeUndefined();expect(parseWidgetSection({id:'Safe',paddingX:-10,paddingY:100})).toMatchObject({paddingX:0,paddingY:40});
});
test('untrusted widget IDs cannot alter the derived card dictionary prototype',()=>{
 const result=sectionCanvas([card('__proto__',0,100),card('constructor',116,100)],()=>100,true);
 expect(Object.getPrototypeOf(result.cards)).toBeNull();expect(Object.keys(result.cards)).toEqual(['__proto__','constructor']);expect(result.cards['__proto__']).toEqual({top:0,height:100,inset:0});expect(result.height).toBe(216);
});
