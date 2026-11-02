import { expect, test } from "vitest";
import { parseSqlSortPresets, sortSqlResult, type SqlSortPreset } from "./sql-sort-presets";
import { filterSqlResult } from "./sql-result-filters";
import type { QueryResult } from "./query-result";
const columns = [{key:"name",type:"text"},{key:"minutes",type:"numeric"},{key:"team",type:"text"}];
const preset: SqlSortPreset = {label:"Worked",field:"minutes",direction:"desc",nulls:"last"};
test("sorts the full 119 employee population before pagination and after all filters",()=>{
  const result: QueryResult = {columns, rows:Array.from({length:119},(_,i)=>({name:`Employee ${i+1}`,minutes:String(i+1),team:i%2 ? "A":"B"})),limit:1000,truncated:false};
  const sorted=sortSqlResult(result,preset,"en");
  expect(sorted.rows.slice(0,25).map(r=>r.minutes)).toEqual(Array.from({length:25},(_,i)=>String(119-i)));
  expect(sorted.rows.slice(100)).toHaveLength(19);
  expect(sorted.rows[118]?.minutes).toBe("1");
  expect(result.rows[0]?.minutes).toBe("1");
  const filtered=filterSqlResult(result,{team:{op:"is",values:["A"]}});
  expect(sortSqlResult(filtered,preset,"en").rows[0]?.minutes).toBe("118");
  const selection=filterSqlResult(result,{},[{field:"team",value:"B"}]);
  expect(sortSqlResult(selection,preset,"en").rows[0]?.minutes).toBe("119");
  expect(sortSqlResult(filterSqlResult(result,{name:{op:"contains",values:["Employee 11"]}}),preset,"en").rows).toHaveLength(11);
  expect(sortSqlResult(filterSqlResult(result,{name:{op:"contains",values:["no match"]}}),preset,"en").rows).toEqual([]);
});
test("compares numeric minutes, signed decimals and int8 exactly with stable ties",()=>{
  const result:QueryResult={columns,rows:[{minutes:"9007199254740993"},{minutes:"9007199254740992"},{minutes:"12.01"},{minutes:"12.0100"},{minutes:"9"},{minutes:"-2"},{minutes:"-10"}],limit:100,truncated:false};
  const rows=sortSqlResult(result,{...preset,direction:"asc"},"en").rows;
  expect(rows.map(r=>r.minutes)).toEqual(["-10","-2","9","12.01","12.0100","9007199254740992","9007199254740993"]);
  expect(rows[3]).toBe(result.rows[2]);
  expect(rows[4]).toBe(result.rows[3]);
});
test("explicit unknown placement is independent of ascending or descending, with invalid values unknown",()=>{
  const result:QueryResult={columns,rows:[{minutes:null},{minutes:"0"},{minutes:"15"},{minutes:""},{minutes:"invalid"},{name:"unknown"}],limit:100,truncated:false};
  for(const direction of ["asc","desc"] as const) {
    const rows=sortSqlResult(result,{...preset,direction},"ru").rows;
    expect(rows.slice(2)).toEqual([result.rows[0],...result.rows.slice(3)]);
    expect(sortSqlResult(result,{...preset,direction,nulls:"first"},"ru").rows.slice(0,4)).toEqual([result.rows[0],...result.rows.slice(3)]);
  }
});
test("locale alphabetical presets and missing columns retain a safe stable result",()=>{
  const result:QueryResult={columns,rows:[{name:"Employee 11"},{name:"Employee 2"},{name:null},{name:"employee 2"}],limit:100,truncated:false};
  expect(sortSqlResult(result,{...preset,field:"name",direction:"asc"},"en").rows.map(r=>r.name)).toEqual(["Employee 2","employee 2","Employee 11",null]);
  expect(sortSqlResult(result,{...preset,field:"removed"},"en")).toBe(result);
  expect(sortSqlResult(result,undefined,"en")).toBe(result);
});
test("persisted sort presets bound input and reject invalid enum settings",()=>{
  expect(parseSqlSortPresets([{...preset,direction:"execute"},{...preset,nulls:"random"},null])).toEqual([]);
  expect(parseSqlSortPresets(Array(20).fill(preset))).toHaveLength(8);
  expect(parseSqlSortPresets([{...preset,label:"x".repeat(100),field:"y".repeat(250)}])[0]).toMatchObject({label:"x".repeat(80),field:"y".repeat(200)});
});

test("floating point columns remain numeric when JS uses scientific notation",()=>{
  const result:QueryResult={columns:[{key:"minutes",type:"float8"}],rows:[{minutes:1e-7},{minutes:0},{minutes:-1e-8},{minutes:1e21}],limit:100,truncated:false};
  expect(sortSqlResult(result,{...preset,direction:"asc"},"en").rows.map(r=>r.minutes)).toEqual([-1e-8,0,1e-7,1e21]);
});
