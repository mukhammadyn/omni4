import {Link} from "@tanstack/react-router";
import {LayoutDashboardIcon,StarIcon} from "lucide-react";
import {useTranslation} from "react-i18next";
import {ROOT_MENU_ID,useMenuChildren} from "@/features/sidebar";
import {useUi} from "@/shared/lib/ui-store";
import {Icon} from "@/shared/ui/icon";
import {useDashboardTree} from "../api/tree";
import {useDashboardPreferences} from "../api/preferences";
import {accessibleDashboardTree,dashboardFavorites} from "../model/navigation";
import {toggle} from "../model/prefs";

/** Personal links are projected from readable reports, never inserted into the
 * shared menu tree and never given server-side drag/edit/delete actions. */
export function DashboardMenuShortcuts(){
 const {t}=useTranslation(),root=useMenuChildren(ROOT_MENU_ID),store=useDashboardTree(),{prefs,updatePrefs}=useDashboardPreferences(),setModule=useUi(s=>s.setModule);
 const hub=root.items.find(n=>n.screen==="dashboards-hub");if(!hub)return null;
 const favorites=store.canRead&&!store.isLoading&&!root.isLoading&&!root.error?dashboardFavorites(accessibleDashboardTree(store.tree,root.items.filter(n=>n.isModule)),prefs.favorites):[];
 return <><Link to="/dashboards" search={{}} onClick={()=>setModule(hub.id)} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-fg-muted hover:bg-surface-hover"><Icon as={LayoutDashboardIcon} size={16}/><span className="truncate">{hub.label}</span></Link><p className="px-2 pt-3 pb-1 text-2xs font-semibold text-fg-subtle">{t("dashboard.favorites")}</p><ul>{favorites.map(({folder,dashboard})=><li key={dashboard.id} className="group flex min-w-0 items-center rounded-md hover:bg-surface-hover"><Link to="/dashboards" search={{d:dashboard.id,module:folder.moduleId||undefined}} onClick={()=>setModule(hub.id)} className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-sm text-fg-muted" activeProps={{className:"bg-surface-active text-fg"}}><span aria-hidden className="shrink-0">{dashboard.emoji}</span><span className="truncate">{dashboard.title||t("dashboard.untitled")}</span></Link><button type="button" aria-label={`${t("dashboard.unfavorite")}: ${dashboard.title}`} onClick={()=>updatePrefs({...prefs,favorites:toggle(prefs.favorites,dashboard.id)})} className="grid size-7 shrink-0 place-items-center rounded text-warning opacity-60 group-hover:opacity-100 focus-visible:opacity-100"><Icon as={StarIcon} size={14} className="fill-current"/></button></li>)}</ul></>;
}
