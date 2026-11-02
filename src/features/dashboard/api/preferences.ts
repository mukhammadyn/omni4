import {useEffect,useSyncExternalStore} from "react";
import {useSession} from "@/shared/api/use-session";
import {readPrefs,writePrefs,type Prefs} from "../model/prefs";

const listeners=new Set<()=>void>(),cache=new Map<string,{raw:string|null;value:Prefs}>();
const EMPTY:Prefs={favorites:[],closed:[],hidden:true};
export function dashboardPrefsKey(project:string|null|undefined,environment:string|null|undefined,user:string|null|undefined){
 return project&&environment&&user?`omni4.dashboards.v2.${encodeURIComponent(project)}.${encodeURIComponent(environment)}.${encodeURIComponent(user)}`:"";
}
export function dashboardPrefsSnapshot(key:string){
 if(!key)return EMPTY;
 let raw:string|null=null;try{raw=localStorage.getItem(key);}catch{/* Storage is optional. */}
 const old=cache.get(key);if(old?.raw===raw)return old.value;
 const value=readPrefs(key);cache.set(key,{raw,value});return value;
}
function subscribe(listener:()=>void){listeners.add(listener);window.addEventListener("storage",listener);return()=>{listeners.delete(listener);window.removeEventListener("storage",listener);};}
export function storeDashboardPrefs(key:string,next:Prefs){
 if(!key)return;
 writePrefs(key,next);let raw:string|null=null;try{raw=localStorage.getItem(key);}catch{/* Keep this context's in-memory preference. */}
 cache.set(key,{raw,value:next});listeners.forEach(l=>l());
}
export function migrateDashboardPrefs(key:string,legacy:string){
 if(!key||!legacy)return;
 try{if(localStorage.getItem(key)!==null||localStorage.getItem(`${legacy}.adopted`)!==null||localStorage.getItem(legacy)===null)return;storeDashboardPrefs(key,readPrefs(legacy));localStorage.setItem(`${legacy}.adopted`,key);}catch{/* No durable storage. */}
}
/** One subscribed store for page and main menu. A session switch changes the
 * snapshot immediately, never on a later effect that could write old favorites. */
export function useDashboardPreferences(){
 const session=useSession(),key=dashboardPrefsKey(session.getProjectId(),session.getEnvironmentId(),session.getUserId());
 const project=session.getProjectId(),user=session.getUserId();
 useEffect(()=>{if(key&&project&&user)migrateDashboardPrefs(key,`omni4.dashboards.${project}.${user}`);},[key,project,user]);
 const prefs=useSyncExternalStore(subscribe,()=>dashboardPrefsSnapshot(key),()=>EMPTY);
 return {prefs,updatePrefs:(next:Prefs)=>storeDashboardPrefs(key,next)};
}
