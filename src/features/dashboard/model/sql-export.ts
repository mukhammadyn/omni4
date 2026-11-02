import type {QueryResult}from"./query-result";
/** Export only the already permitted, filtered result; exact decimal/int8 text stays text. */
export async function sqlWorkbook(result:QueryResult,groups:Record<string,string>={},totals:Record<string,string>={}):Promise<ArrayBuffer>{
 const {default:ExcelJS}=await import("exceljs"),book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Report");
 if(result.columns.some(c=>groups[c.key]))sheet.addRow(result.columns.map(c=>groups[c.key] ?? ""));
 sheet.addRow(result.columns.map(c=>c.label || c.key));
 result.rows.forEach(row=>sheet.addRow(result.columns.map(c=>row[c.key]===null?null:row[c.key] as string|number|boolean)));
 if(Object.keys(totals).length)sheet.addRow(result.columns.map((c,i)=>totals[c.key] ?? (i===0?"Total":"")));
 result.columns.forEach((_,i)=>{sheet.getColumn(i+1).width=24;});sheet.views=[{state:"frozen",ySplit:result.columns.some(c=>groups[c.key])?2:1}];
 return book.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
