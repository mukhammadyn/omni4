import type { Widget } from './dashboard';
import { LAYOUT_GAP, layoutHeight, layoutTop } from './widget-layout';

/** An optional full-width visual section. All members share its editable style. */
export type WidgetSection = { id:string; paddingX:number; paddingY:number; framed:boolean; flow:boolean; stretch:boolean };
export function parseWidgetSection(raw:unknown):WidgetSection|undefined {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return;
  const v=raw as Record<string,unknown>;
  if(typeof v.id!=='string' || !v.id.trim()) return;
  const n=(key:string,fallback:number)=>typeof v[key]==='number' && Number.isFinite(v[key]) ? Math.max(0,Math.min(40,v[key])) : fallback;
  return {id:v.id.trim().slice(0,80),paddingX:n('paddingX',16),paddingY:n('paddingY',12),framed:v.framed!==false,flow:v.flow!==false,stretch:v.stretch!==false};
}
type CardBox={top:number;height:number;inset:number};
type Frame={id:string;top:number;height:number};
/** Derived viewer layout only: original positions are retained for editing and saving. */
export function sectionCanvas(widgets:Widget[],heightFor:(w:Widget)=>number,viewing:boolean) {
  const cards=Object.create(null) as Record<string,CardBox>,frames:Frame[]=[];
  const top=(w:Widget)=>w.layout ? layoutTop(w.layout.row) : 0;
  const configured=(w:Widget)=>w.layout ? layoutHeight(w.layout.rows) : w.height*260;
  const sections=new Map<string,Widget[]>();
  for(const w of widgets) { cards[w.id]={top:top(w),height:heightFor(w),inset:0}; if(w.section && w.layout) sections.set(w.section.id,[...(sections.get(w.section.id)??[]),w]); }
  const entities=[...sections.entries()].map(([id,members])=>{
    const options=members[0]!.section!,border=options.framed?1:0,insetY=options.paddingY+border;
    const first=Math.min(...members.map(top)),last=Math.max(...members.map(w=>top(w)+configured(w)));
    const origin=Math.max(0,first-insetY),initialBottom=last+insetY;
    // Connected vertical bands keep a chart and its stacked side cards together.
    const bands:{start:number;end:number;members:Widget[]}[]=[];
    for(const w of [...members].sort((a,b)=>top(a)-top(b))) {
      const previous=bands.at(-1),end=top(w)+configured(w);
      if(previous && top(w)<previous.end-0.01) {previous.members.push(w);previous.end=Math.max(previous.end,end);} else bands.push({start:top(w),end,members:[w]});
    }
    let bottom=origin+insetY;
    for(const band of bands) {
      const start=viewing && options.flow ? bottom : band.start+origin+insetY-first;
      const stretch=viewing && options.stretch && band.members.length>1 && band.members.every(w=>Math.abs(top(w)-band.start)<0.01 && Math.abs(configured(w)-configured(band.members[0]!))<0.01);
      const rowHeight=Math.max(...band.members.map(heightFor));
      for(const w of band.members) cards[w.id]={top:start+top(w)-band.start,height:stretch?rowHeight:heightFor(w),inset:options.paddingX+border};
      bottom=Math.max(...band.members.map(w=>cards[w.id]!.top+cards[w.id]!.height))+LAYOUT_GAP;
    }
    const finalBottom=bottom-LAYOUT_GAP+insetY;
    return {id,options,members,origin,initialBottom,finalBottom};
  }).sort((a,b)=>a.origin-b.origin);
  // Full-width sections push subsequent content by their actual growth/shrinkage.
  for(let i=0;i<entities.length;i++) {
    const entity=entities[i]!,offset=entities.slice(0,i).filter(e=>entity.origin>=e.initialBottom-0.01).reduce((sum,e)=>sum+e.finalBottom-e.initialBottom,0);
    for(const w of entity.members) cards[w.id]!.top+=offset;
    if(entity.options.framed) frames.push({id:entity.id,top:entity.origin+offset,height:entity.finalBottom-entity.origin});
  }
  for(const w of widgets) if(!w.section) cards[w.id]!.top+=entities.filter(e=>top(w)>=e.initialBottom-0.01).reduce((sum,e)=>sum+e.finalBottom-e.initialBottom,0);
  return {cards,frames,height:Math.max(0,...Object.values(cards).map(b=>b.top+b.height),...frames.map(f=>f.top+f.height))};
}
