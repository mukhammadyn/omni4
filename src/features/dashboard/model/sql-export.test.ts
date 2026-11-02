import{expect,test}from"vitest";import ExcelJS from"exceljs";import{sqlWorkbook}from"./sql-export";
test("Excel exports the supplied filtered rows and exact text, without evaluating user strings",async()=>{
 const bytes=await sqlWorkbook({columns:[{key:"name",type:"text"},{key:"amount",type:"numeric"}],rows:[{name:"=HYPERLINK(\"x\")",amount:"9007199254740993.01"}],limit:1000,truncated:false},{amount:"Accrual"},{amount:"9007199254740993.01"});
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0]!;
 expect(sheet.rowCount).toBe(4);expect(sheet.getCell("A3").value).toBe('=HYPERLINK("x")');expect(sheet.getCell("B3").value).toBe("9007199254740993.01");expect(sheet.getCell("B4").value).toBe("9007199254740993.01");
});
