import { expect, test } from "vitest";
import { toDatasets } from "./datasets";
import { dashboardMonthParameters, monthKey, selectedMonth, shiftMonth, validMonth } from "./sql-month";

test("month navigation retains year boundaries and rejects malformed URL values", () => {
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("0001-01", -1)).toBe("0001-01");
  expect(shiftMonth("9999-12", 1)).toBe("9999-12");
  for (const value of ["0000-01", "2026-00", "2026-13", "2026-2", "2026-02-01", "x"]) expect(validMonth(value)).toBe(false);
  expect(selectedMonth("2024-02")).toBe("2024-02");
  expect(selectedMonth(undefined, new Date("2027-01-01T00:00:00Z"))).toBe("2027-01");
  expect(monthKey("period")).toBe("sql-month:period");
});

test("only explicit date controls from this dashboard are exposed and survive persistence", () => {
  const datasets = toDatasets([
    {id:"used",name:"A",source:{kind:"sql",sql:"SELECT :month",parameters:[{name:"month",type:"date",required:true,dashboardControl:"month"}]}},
    {id:"also",name:"B",source:{kind:"sql",sql:"SELECT :month",parameters:[{name:"month",type:"date",required:true,dashboardControl:"month"}]}},
    {id:"unused",name:"C",source:{kind:"sql",sql:"SELECT :other",parameters:[{name:"other",type:"date",required:true,dashboardControl:"month"}]}},
    {id:"text",name:"D",source:{kind:"sql",sql:"SELECT :text",parameters:[{name:"text",type:"text",required:true,dashboardControl:"month"}]}},
  ]);
  expect(dashboardMonthParameters(datasets,new Set(["used","also","text"]))).toEqual([{name:"month",type:"date",required:true,dashboardControl:"month"}]);
});
