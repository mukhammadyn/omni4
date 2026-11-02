import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {dashboardPrefsKey,dashboardPrefsSnapshot,migrateDashboardPrefs,storeDashboardPrefs} from "./preferences";

beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}});});
afterEach(()=>vi.unstubAllGlobals());
test("actor, project and environment snapshots switch immediately; a missing session cannot persist favorites",()=>{
 const a=dashboardPrefsKey("p","production","alice"),b=dashboardPrefsKey("p","production","bob"),c=dashboardPrefsKey("p","test","alice"),d=dashboardPrefsKey("other","production","alice");
 storeDashboardPrefs(a,{favorites:["report"],closed:["folder"],hidden:false});
 expect(dashboardPrefsSnapshot(a).favorites).toEqual(["report"]);
 for(const key of[b,c,d,""])expect(dashboardPrefsSnapshot(key).favorites).toEqual([]);
 expect(dashboardPrefsSnapshot(a)).toBe(dashboardPrefsSnapshot(a));
 storeDashboardPrefs(b,{favorites:["other-report"],closed:[],hidden:true});
 expect(dashboardPrefsSnapshot(a).favorites).toEqual(["report"]);
 storeDashboardPrefs(a,{favorites:[],closed:["folder"],hidden:false});
 expect(dashboardPrefsSnapshot(b).favorites).toEqual(["other-report"]);
 expect(dashboardPrefsKey("p",undefined,"alice")).toBe("");
});
test("legacy personal preferences are adopted once without deleting them or copying into a second environment",()=>{
 const legacy="legacy-actor",first=dashboardPrefsKey("legacy-project","prod","owner"),second=dashboardPrefsKey("legacy-project","test","owner");
 localStorage.setItem(legacy,JSON.stringify({favorites:["old"],closed:["folder"],hidden:true}));
 migrateDashboardPrefs(first,legacy);migrateDashboardPrefs(second,legacy);
 expect(dashboardPrefsSnapshot(first).favorites).toEqual(["old"]);expect(dashboardPrefsSnapshot(second).favorites).toEqual([]);expect(localStorage.getItem(legacy)).not.toBeNull();
 storeDashboardPrefs(first,{favorites:[],closed:[],hidden:false});migrateDashboardPrefs(first,legacy);expect(dashboardPrefsSnapshot(first).favorites).toEqual([]);
});
