import {expect,test} from "vitest";
import {isDashboardHubHref} from "./dashboard-entry";
import {SYSTEM_MENUS} from "./system-menus";
import {toMenuNode} from "../api/normalize";

test("superadmin creates an ordinary LINK; only this origin's unscoped dashboard URL enters the hub",()=>{
 const origin="https://example.test";
 for(const href of [`${origin}/dashboards`,`${origin}/dashboards/`]){
  expect(isDashboardHubHref(href,origin)).toBe(true);
  const node=toMenuNode({id:"entry",type:"LINK",attributes:{link:href,label_ru:"Analytics"}},"ru",0,origin);
  expect([node.type,node.kind,node.screen,node.label,node.raw.type]).toEqual(["DASHBOARDS","leaf","dashboards-hub","Analytics","LINK"]);
 }
 for(const href of ["https://other.test/dashboards",`${origin}/dashboards?d=private`,`${origin}/dashboards#x`,`${origin}/reports`,`https://user:pass@example.test/dashboards`,"javascript:alert(1)","/dashboards",undefined])expect(isDashboardHubHref(href,origin)).toBe(false);
 expect(isDashboardHubHref(`${origin}/dashboards`,undefined)).toBe(false);
 expect(toMenuNode({id:"embed",type:"LINK",attributes:{website_link:`${origin}/dashboards`}},"ru",0,origin).type).toBe("LINK");
 expect(toMenuNode({id:"store",type:"LINK",attributes:{screen:"dashboards",link:`${origin}/dashboards`}},"ru",0,origin).screen).toBe("dashboards");
});

 test("moving an existing entry through superadmin promotes the root without changing its stored contract",()=>{
 const raw={id:"existing",type:"LINK",parent_id:SYSTEM_MENUS.ROOT,attributes:{screen:"dashboards-entry",label_ru:"Дашборды"}};
 const node=toMenuNode(raw,"ru");
 expect(node.screen).toBe("dashboards-hub");
 expect(node.raw).toBe(raw);
 expect(node.raw.attributes?.screen).toBe("dashboards-entry");
 expect(toMenuNode({...raw,parent_id:"module-folder"},"ru").screen).toBe("dashboards-entry");
 });
