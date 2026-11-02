import {expect,test} from "vitest";
import {newDashboard,newFolder,type Tree} from "./dashboard";
import {accessibleDashboardTree,dashboardFavorites} from "./navigation";

test("favorites resolve only readable module/report IDs; stale, denied and duplicate IDs never expose labels",()=>{
 const a={...newFolder("sales","A"),dashboards:[{...newDashboard("Visible"),id:"a"}]},b={...newFolder("hidden","B"),dashboards:[{...newDashboard("Hidden"),id:"b"}]};
 const tree:Tree={folders:[a,b]},accessible=accessibleDashboardTree(tree,[{id:"sales"}]);
 expect(dashboardFavorites(accessible,["b","deleted","a","a"]).map(x=>x.dashboard.title)).toEqual(["Visible"]);
 expect(accessibleDashboardTree(tree,[]).folders).toEqual([]);
 expect(tree.folders).toHaveLength(2);
});
