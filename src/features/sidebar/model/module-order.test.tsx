import {expect,test} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ModuleSwitcher} from "../ui/ModuleSwitcher";
import {moduleSlots} from "./module-order";
import {toMenuNode} from "../api/normalize";
import "@/shared/lib/i18n";
const modules=[toMenuNode({id:"crm",label:"CRM",type:"FOLDER"},"en"),toMenuNode({id:"hrms",label:"HRMS",type:"FOLDER"},"en"),toMenuNode({id:"hub",label:"Dashboard",type:"LINK",icon:"https://example.test/colored.png",attributes:{screen:"dashboards-hub"}},"en")];
test("all selections keep configured order and neutral dashboard icon",()=>{
 for(const activeId of ["crm","hrms","hub","crm"]){const html=renderToStaticMarkup(<ModuleSwitcher modules={modules} activeId={activeId} onSelect={()=>{}}/>);expect([...html.matchAll(/data-module-id="([^"]+)"/g)].map(m=>m[1])).toEqual(["crm","hrms","hub"]);expect(html).not.toContain("colored.png");expect(html).toContain('aria-current="true"');}
 expect(modules.map(m=>m.id)).toEqual(["crm","hrms","hub"]);
});
test("overflow keeps the configured prefix, including when selected item is outside it",()=>{const items=Array.from({length:10},(_,i)=>String(i));for(const active of items){expect(moduleSlots(items,120).shown).toEqual(["0","1","2"]);expect(moduleSlots(items,120).overflow).toBe(true);expect(items).toContain(active);}expect(moduleSlots(items,10).shown).toEqual([]);expect(moduleSlots(items,400).shown).toEqual(items);});
