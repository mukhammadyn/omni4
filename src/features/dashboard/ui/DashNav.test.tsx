import {expect,test} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {DashNav} from "./DashNav";
import "@/shared/lib/i18n";
const props={tree:{folders:[{id:"folder",moduleId:"",title:"Saved folder",dashboards:[]}]},modules:[],currentId:"",favorites:[],closed:new Set<string>(),canEdit:false,onToggle:()=>{},onOpen:()=>{},onNewDashboard:()=>{},onNewFolder:()=>"",onRenameFolder:()=>{},onRemoveFolder:()=>{},onRenameDashboard:()=>{},onRemoveDashboard:()=>{},onFavorite:()=>{},onHide:()=>{}};
test("embedded folder tree omits duplicate title and search; management navigation retains its search",()=>{
 const sidebar=renderToStaticMarkup(<DashNav {...props} embedded/>),management=renderToStaticMarkup(<DashNav {...props}/>);
 expect(sidebar).not.toContain("<input");expect(sidebar).not.toContain('type="text"');expect(sidebar).toContain("Saved folder");expect(management).toContain("<input");
});
