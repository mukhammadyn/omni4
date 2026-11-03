import type {ReactNode} from "react";
import {beforeEach,expect,test,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {newDashboard,newFolder} from "../model/dashboard";
import "@/shared/lib/i18n";
const state=vi.hoisted(()=>({favorites:["report","denied"],read:true}));
vi.mock("@/features/sidebar",()=>({ROOT_MENU_ID:"root",useMenuChildren:()=>({items:[{id:"staff",label:"HRMS",isModule:true},{id:"hub",screen:"dashboards-hub"}],isLoading:false,error:null})}));
vi.mock("../api/tree",()=>({useDashboardTree:()=>({tree:{folders:[{...newFolder("staff","Personnel"),id:"folder",dashboards:[{...newDashboard("Visible report"),id:"report",description:"Private report metadata"}]},{...newFolder("denied","Hidden folder"),dashboards:[{...newDashboard("Denied report"),id:"denied"}]}]},menuId:"store",canRead:state.read,canEdit:true,isLoading:false,save:vi.fn()})}));
vi.mock("../api/preferences",()=>({useDashboardPreferences:()=>({prefs:{favorites:state.favorites,closed:[]},updatePrefs:vi.fn()})}));
vi.mock("@tanstack/react-router",()=>({useNavigate:()=>vi.fn(),useSearch:()=>({}),Link:({children,to,onClick,className}:{children:ReactNode;to:string;onClick?:()=>void;className?:string})=><a href={to} onClick={onClick} className={className}>{children}</a>}));
vi.mock("./DashNav",()=>({DashNav:()=>null}));
vi.mock("./WidgetGrid",()=>({WidgetGrid:()=>null}));
vi.mock("./SqlMonthControls",()=>({SqlMonthControls:()=>null}));
import {DashboardsPage} from "./DashboardsPage";
import {DashboardFavorites,DashboardAddMenuRow} from "./DashboardMenuShortcuts";
const props={dashboardId:"",moduleId:"",values:{},onOpen:vi.fn(),onValues:vi.fn()};
function page(overrides={}){return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><DashboardsPage {...props} {...overrides}/></QueryClientProvider>);}
beforeEach(()=>{state.favorites=["report","denied"];state.read=true;});
test("default and module-only dashboard URLs leave content empty without selecting a report",()=>{expect(page()).not.toContain("Visible report");expect(page()).not.toContain("Выберите");expect(page({moduleId:"staff"})).not.toContain("Visible report");});
test("explicit report retains title and tabs while hiding secondary path, description, tab add and dataset action",()=>{const html=page({dashboardId:"report"});expect(html).toContain("Visible report");expect(html).not.toContain("Private report metadata");expect(html).not.toContain("Personnel");expect(html).not.toContain("Наборы данных");expect(html).toContain("Настроить");expect(html).toContain('aria-label="Убрать из избранного"');expect(html).not.toContain('aria-label="Обновить"');expect(html).not.toContain('aria-label="Список дашбордов"');});
test("shared favorites expose readable reports only and hide everything if store read is denied",()=>{const html=renderToStaticMarkup(<DashboardFavorites/>);expect(html).toContain("Visible report");expect(html).not.toContain("Denied report");state.read=false;expect(renderToStaticMarkup(<DashboardFavorites/>)).toBe("");expect(renderToStaticMarkup(<DashboardAddMenuRow/>)).toBe("");});

test("report toolbar restores the personal favorite control with distinct add/remove states",()=>{
 const selected=page({dashboardId:"report"});expect(selected).toContain('aria-label="Убрать из избранного" aria-pressed="true"');
 state.favorites=[];const unselected=page({dashboardId:"report"});expect(unselected).toContain('aria-label="В избранное" aria-pressed="false"');
 expect(unselected).not.toContain('aria-label="Обновить"');expect(page()).not.toContain('aria-pressed="false"');
});
