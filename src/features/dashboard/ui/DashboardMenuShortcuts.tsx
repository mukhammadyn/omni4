import {Link,useNavigate,useSearch} from "@tanstack/react-router";
import {PlusIcon,StarIcon} from "lucide-react";
import {useTranslation} from "react-i18next";
import {ROOT_MENU_ID,useMenuChildren} from "@/features/sidebar";
import {useUi} from "@/shared/lib/ui-store";
import {Icon} from "@/shared/ui/icon";
import {useDashboardTree} from "../api/tree";
import {useDashboardPreferences} from "../api/preferences";
import {accessibleDashboardTree,dashboardFavorites} from "../model/navigation";
import {DashNav} from "./DashNav";
import {toggle} from "../model/prefs";

/** Personal links are projected from readable reports, never inserted into the
 * shared menu tree and never given server-side drag/edit/delete actions. */
function useMenuReports(){
 const root=useMenuChildren(ROOT_MENU_ID),store=useDashboardTree(),preferences=useDashboardPreferences();
 const hub=root.items.find(n=>n.screen==="dashboards-hub");
 const modules=root.items.filter(n=>n.isModule);
 const readable=accessibleDashboardTree(store.tree,modules);
 const ready=store.canRead&&!store.isLoading&&!root.isLoading&&!root.error;
 return {root,store,hub,modules,readable,ready,...preferences};
}
export function DashboardFavorites(){
 const {t}=useTranslation(),{hub,readable,ready,prefs,updatePrefs}=useMenuReports(),setModule=useUi(s=>s.setModule);
 if(!hub||!ready)return null;
 const favorites=dashboardFavorites(readable,prefs.favorites);
 return <>{favorites.length>0&&<p className="px-2 pt-3 pb-1 text-2xs font-semibold text-fg-subtle">{t("dashboard.favorites")}</p>}<ul>{favorites.map(({folder,dashboard})=><li key={dashboard.id} className="group flex min-w-0 items-center rounded-md hover:bg-surface-hover"><Link to="/dashboards" search={{d:dashboard.id,module:folder.moduleId||undefined}} onClick={()=>setModule(hub.id)} className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-sm text-fg-muted" activeProps={{className:"bg-surface-active text-fg"}}><span aria-hidden className="shrink-0">{dashboard.emoji}</span><span className="truncate">{dashboard.title||t("dashboard.untitled")}</span></Link><button type="button" aria-label={`${t("dashboard.unfavorite")}: ${dashboard.title}`} onClick={()=>updatePrefs({...prefs,favorites:toggle(prefs.favorites,dashboard.id)})} className="grid size-7 shrink-0 place-items-center rounded text-warning opacity-60 group-hover:opacity-100 focus-visible:opacity-100"><Icon as={StarIcon} size={14} className="fill-current"/></button></li>)}</ul></>;
}
/** Existing authorized management UI; opening it never creates a record. */
export function DashboardAddMenuRow(){
 const {t}=useTranslation(),{hub,store,ready}=useMenuReports(),setModule=useUi(s=>s.setModule);
 if(!hub||!ready||!store.canEdit)return null;
 return <Link to="/dashboards" search={{manage:true}} onClick={()=>setModule(hub.id)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"><Icon as={PlusIcon} size={16}/>{t("sidebar.add")}</Link>;
}
export function DashboardMenuShortcuts(){
 const navigate=useNavigate(),search=useSearch({strict:false}) as {d?:string};
 const {hub,modules,readable,ready,prefs,updatePrefs}=useMenuReports(),setModule=useUi(s=>s.setModule);
 if(!hub||!ready)return null;
 return <DashNav embedded tree={readable} modules={modules} currentId={search.d??""} favorites={prefs.favorites} closed={new Set(prefs.closed)} canEdit={false} onToggle={id=>updatePrefs({...prefs,closed:toggle(prefs.closed,id)})} onOpen={id=>{const folder=readable.folders.find(f=>f.dashboards.some(d=>d.id===id));setModule(hub.id);void navigate({to:"/dashboards",search:{d:id,module:folder?.moduleId||undefined}});}} onFavorite={id=>updatePrefs({...prefs,favorites:toggle(prefs.favorites,id)})} onNewDashboard={()=>{}} onNewFolder={()=>""} onRenameFolder={()=>{}} onRemoveFolder={()=>{}} onRenameDashboard={()=>{}} onRemoveDashboard={()=>{}} onHide={()=>{}}/>;
}
