import type {MenuNode} from "@/features/sidebar";
import type {Tree} from "./dashboard";

/** Menu visibility remains authoritative; an orphaned/hidden module is not a
 * reason to reveal its report names through a saved personal shortcut. */
export function accessibleDashboardTree(tree:Tree,modules:Pick<MenuNode,"id">[]):Tree{
 const ids=new Set(modules.map(m=>m.id));
 return {...tree,folders:tree.folders.filter(f=>!f.moduleId||ids.has(f.moduleId))};
}
export function dashboardFavorites(tree:Tree,ids:string[]){
 const all=new Map(tree.folders.flatMap(folder=>folder.dashboards.map(dashboard=>[dashboard.id,{folder,dashboard}] as const)));
 return [...new Set(ids)].flatMap(id=>{const found=all.get(id);return found?[found]:[];});
}
