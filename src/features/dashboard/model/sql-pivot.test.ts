import {expect,test}from"vitest";import{addSqlDecimal,pivotSqlResult,parseSqlPivot,type SqlPivot}from"./sql-pivot";import type{QueryResult}from"./query-result";
const p:SqlPivot={rowKey:"ID",rows:["Name","Salary"],column:"Type",group:"Kind",value:"Amount",after:["Net"],zeroFill:true,totals:true};
const source:QueryResult={columns:[{key:"ID",type:"text"},{key:"Name",type:"text"},{key:"Salary",type:"text"},{key:"Type",type:"text"},{key:"Kind",type:"text"},{key:"Amount",type:"numeric"},{key:"Net",type:"numeric"}],rows:[{ID:"a",Name:"A",Salary:"100/hour",Type:"Bonus",Kind:"Accrual",Amount:"9007199254740993.01",Net:"9007199254740993.02"},{ID:"a",Name:"A",Salary:"100/hour",Type:"Bonus",Kind:"Accrual",Amount:"0.01",Net:"9007199254740993.02"},{ID:"b",Name:"B",Salary:null,Type:"Fine",Kind:"Deduction",Amount:"1.99",Net:"-1.99"}],limit:1000,truncated:false};
test("dynamic grouped columns retain exact cents, unknown salary, and single-row totals",()=>{
 const pivot=pivotSqlResult(source,p);expect(pivot.result.rows).toHaveLength(2);expect(pivot.result.rows[0]).toMatchObject({pivot_0:"9007199254740993.02",pivot_1:"0"});expect(pivot.result.rows[1]?.Salary).toBeNull();expect(pivot.groups).toEqual({pivot_0:"Accrual",pivot_1:"Deduction"});expect(pivot.totals.Net).toBe("9007199254740991.03");expect(pivot.totals.Salary).toBeUndefined();expect(parseSqlPivot(p)).toEqual(p);
});
test("missing values stay unknown unless explicitly zero-filled; conflicting dimensions fail",()=>{
 const out=pivotSqlResult(source,{...p,zeroFill:false});expect(out.result.rows[0]?.pivot_1).toBeNull();
 expect(()=>pivotSqlResult({...source,rows:[source.rows[0]!,{...source.rows[1],Salary:"200/hour"}]},p)).toThrow("dimensions");
 expect(()=>pivotSqlResult(source,{...p,value:"Name"})).toThrow("numeric");
 expect(addSqlDecimal("-0.10","0.03")).toBe("-0.07");
});
test("total fields can exclude rates while retaining monetary category sums",()=>{
 const out=pivotSqlResult({...source,columns:source.columns.map(c=>c.key==="Salary"?{...c,type:"numeric"}:c),rows:source.rows.map(r=>({...r,Salary:"100.00"}))},{...p,totalFields:["Net"]});expect(out.totals.Salary).toBeUndefined();expect(out.totals.pivot_0).toBe("9007199254740993.02");
});
