import type { Widget } from "./dashboard";
/** Only visibility changes. Hidden tabs remain in the saved widget collection. */
export function visibleTabWidgets(widgets:Widget[],selected:Record<string,string>):Widget[] {
  const active=new Map<string,string>();
  for(const widget of widgets) if(widget.tabGroup && !active.has(widget.tabGroup)) active.set(widget.tabGroup,widgets.find(w=>w.tabGroup===widget.tabGroup && w.id===selected[widget.tabGroup!])?.id ?? widget.id);
  return widgets.filter(widget=>!widget.tabGroup || active.get(widget.tabGroup)===widget.id);
}
