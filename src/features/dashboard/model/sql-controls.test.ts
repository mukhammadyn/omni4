import {expect,test}from"vitest";
import {dashboardSqlValues,periodBounds,shiftPeriod,sqlPeriodKey,dashboardSqlControls}from"./sql-controls";
import {toDatasets,type DatasetParameter}from"./datasets";
const parameters:DatasetParameter[]=[{name:"start",type:"date",required:true,dashboardControl:"period_start",controlGroup:"tasks",defaultPeriod:"year",dynamicDefault:"year_start"},{name:"end",type:"date",required:true,dashboardControl:"period_end",controlGroup:"tasks",defaultPeriod:"year",dynamicDefault:"today"},{name:"employee",type:"text",required:true,dashboardControl:"select",controlLabel:"Все сотрудники",optionsSql:"SELECT guid AS value,full_name AS label FROM employees",defaultValue:""}];
test("shared controls persist only for used datasets and defaults advance with UTC calendar",()=>{
 const data=toDatasets([{id:"tasks",name:"tasks",source:{kind:"sql",sql:"SELECT :start,:end,:employee",parameters}}]);
 expect(dashboardSqlControls(data,new Set(["tasks"]))).toEqual(parameters);expect(dashboardSqlControls(data,new Set())).toEqual([]);
 expect(dashboardSqlValues(parameters,{},new Date("2027-01-01T00:00:00Z"))).toEqual({start:"2027-01-01",end:"2027-12-31",employee:""});
});
test("period bounds, week/year navigation and all-time use complete calendar dates",()=>{
 expect(periodBounds("week","2026-11-02")).toEqual(["2026-11-02","2026-11-08"]);
 expect(periodBounds("month","2024-02-29")).toEqual(["2024-02-01","2024-02-29"]);
 expect(shiftPeriod("month","2026-01-31",1)).toBe("2026-02-01");
 expect(dashboardSqlValues(parameters,{[sqlPeriodKey("tasks")]:["all","2026-11-02"]})).toMatchObject({start:"0001-01-01",end:"9999-12-31"});
 expect(dashboardSqlValues(parameters,{[sqlPeriodKey("tasks")]:["custom"],"sql-param:start":["2024-02-29"],"sql-param:end":["2024-03-01"],"sql-param:employee":["id"]})).toEqual({start:"2024-02-29",end:"2024-03-01",employee:"id"});
});

test("calendar input labels use the report locale without changing the UTC date",async()=>{
 const {sqlCalendarLabel}=await import("./sql-controls");expect(sqlCalendarLabel("2026-11-02","ru")).toBe("02.11.2026");expect(sqlCalendarLabel("2026-11-02","en-US")).toBe("11/02/2026");expect(sqlCalendarLabel("2024-02-29","ru")).toBe("29.02.2024");expect(sqlCalendarLabel("2026-02-31","ru")).toBe("—");
});
