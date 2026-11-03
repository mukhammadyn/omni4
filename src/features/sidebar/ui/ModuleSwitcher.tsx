import {useLayoutEffect,useRef,useState} from "react";
import {useTranslation} from "react-i18next";
import {CheckIcon,LayoutGridIcon,GaugeIcon} from "lucide-react";
import {MODULE_PILL} from "@/shared/ui/module-pill";
import {Icon} from "@/shared/ui/icon";
import {Popover,PopoverItem} from "@/shared/ui/popover";
import {Tooltip} from "@/shared/ui/tooltip";
import type {MenuNode} from "../model/types";
import {moduleSlots} from "../model/module-order";
import {MenuIcon} from "./MenuIcon";

/** Labels when they fit, otherwise equal icon slots in server order. No
 * active-first partition: selecting a menu changes only its common state. */
export function ModuleSwitcher({modules,activeId,onSelect}:{modules:MenuNode[];activeId:string;onSelect:(id:string)=>void}){
 const {t}=useTranslation(),row=useRef<HTMLDivElement>(null),probe=useRef<HTMLDivElement>(null);
 const [width,setWidth]=useState(240),[spread,setSpread]=useState(false);
 const signature=modules.map(m=>`${m.id}:${m.label}`).join("|");
 useLayoutEffect(()=>{const el=row.current;if(!el)return;const measure=()=>{setWidth(el.clientWidth);setSpread((probe.current?.scrollWidth??Infinity)<=el.clientWidth);};measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[signature]);
 const {shown,overflow}=moduleSlots(modules,width);
 const button=(module:MenuNode,label:boolean)=><button key={module.id} type="button" data-module-id={module.id} aria-label={module.label} aria-current={module.id===activeId?"true":undefined} onClick={()=>onSelect(module.id)} className={`${MODULE_PILL} min-w-0 flex-1 justify-center transition-colors ${module.id===activeId?"bg-surface-active font-semibold text-fg":"font-medium text-fg-muted hover:bg-surface-hover hover:text-fg"}`}><span className="flex shrink-0"><ModuleIcon module={module}/></span>{label&&<span className="truncate">{module.label}</span>}</button>;
 return <div ref={row} role="group" aria-label={t("sidebar.modules")} className="relative flex min-w-0 flex-1 items-center">
 <div ref={probe} aria-hidden className="pointer-events-none invisible absolute flex whitespace-nowrap">{modules.map(module=><span key={module.id} className={`${MODULE_PILL} shrink-0`}><ModuleIcon module={module}/>{module.label}</span>)}</div>
 {spread?modules.map(m=>button(m,true)):shown.map(m=><Tooltip key={m.id} label={m.label}>{button(m,false)}</Tooltip>)}
 {!spread&&overflow&&<Popover align="end" className="ml-auto shrink-0" trigger={({open,toggle})=><button type="button" onClick={toggle} aria-expanded={open} aria-label={t("sidebar.allModules")} className={`grid h-8 min-w-7.5 place-items-center rounded-lg text-fg-muted hover:bg-surface-hover ${open?"bg-surface-hover text-fg":""}`}><Icon as={LayoutGridIcon} size={17}/></button>}>{close=>modules.map(module=><PopoverItem key={module.id} icon={<ModuleIcon module={module}/>} onClick={()=>{onSelect(module.id);close();}} {...(module.id===activeId?{trailing:<Icon as={CheckIcon} size={14}/>}:{})}>{module.label}</PopoverItem>)}</Popover>}
 </div>;
}
function ModuleIcon({module}:{module:MenuNode}){return module.screen==="dashboards-hub"?<Icon as={GaugeIcon}/>:<MenuIcon name={module.icon} type={module.type}/>;}
