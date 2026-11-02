/** A regular LINK created in superadmin can enter this app's dashboard hub.
 * Foreign origins, embedded sites and scoped/deep links keep their old meaning. */
export function isDashboardHubHref(href:string|undefined,origin:string|undefined):boolean{
 if(!href||!origin)return false;
 try{const url=new URL(href);return url.origin===origin&&!url.username&&!url.password&&["http:","https:"].includes(url.protocol)&&["/dashboards","/dashboards/"].includes(url.pathname)&&!url.search&&!url.hash;}catch{return false;}
}
