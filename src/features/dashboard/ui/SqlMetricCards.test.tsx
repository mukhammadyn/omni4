import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSqlRecordOptions } from "../model/sql-record-options";
import { SqlResultView } from "./SqlDatasetRunner";
vi.mock("react-i18next", async original => ({...await original<typeof import("react-i18next")>(),useTranslation:()=>({t:(key:string)=>key,i18n:{language:"ru"}})}));
const records={layout:"metrics" as const,titleField:"policy",progressValueField:"used",progressMaxField:"limit",progressCaption:"Использовано в цикле",progressUnit:"дн.",footerField:"footer",columns:3};
const columns=[{key:"policy",type:"text"},{key:"used",type:"numeric"},{key:"limit",type:"numeric"},{key:"footer",type:"text"}];
const render=(rows:Record<string,unknown>[])=>renderToStaticMarkup(<SqlResultView displayOnly language="ru" result={{columns,rows,limit:100,truncated:false}} presentation={{type:"table",kind:"bar",group:"",value:"",split:"",records}}/>);
test("metric cards retain editable bindings and format actual value/limit in the selected locale",()=>{
 const html=render([{policy:"Отпуск",used:"2.5",limit:"10",footer:"Доступно 7,5 дн."}]);
 expect(html).toContain("2,5");expect(html).toContain("10,0");expect(html).toContain("25%");expect(html).toContain('aria-valuenow="25"');expect(html).toContain('width:25%');expect(html).toContain("Доступно 7,5 дн.");expect(html).toContain("data-tooltip-anchor");
 expect(parseSqlRecordOptions(records)).toEqual(records);
});
test("unknown and zero limits are not advertised as measured zero utilization",()=>{
 for(const limit of [null,"0","",true,"NaN"]){const html=render([{policy:"Без лимита",used:"2",limit,footer:""}]);expect(html).not.toContain('role="progressbar"');expect(html).not.toContain("NaN%");expect(html).not.toContain("Infinity%");}
 const over=render([{policy:"Лимит исчерпан",used:"12",limit:"10",footer:""}]);expect(over).toContain("120%");expect(over).toContain('aria-valuenow="100"');expect(over).toContain('width:100%');
});
test("long policy labels wrap and empty metric datasets retain the empty state",()=>{
 const title="Тип отсутствия с очень длинным названием и полным пояснением";const html=render([{policy:title,used:"0",limit:"3",footer:""}]);expect(html).toContain(title);expect(html).toContain("break-words");expect(html).not.toContain("truncate");expect(render([])).not.toContain("data-sql-metric-cards");
});
