import { expect, test } from "vitest";
import { newChart } from "@/features/item";
import { newDashboard, newFolder, toTree, toTreeAttribute } from "./dashboard";
import { filterSqlResult } from "./sql-result-filters";
import { visibleQueryColumns, type QueryResult } from "./query-result";
import { stageSqlWidget } from "./sql-widget";

const result: QueryResult = { columns: [{ key: "name", type: "text" }, { key: "age", type: "numeric" }, { key: "month", type: "text" }], rows: [{ name: "Sample A", age: "25", month: "02" }, { name: "Sample B", age: "30", month: "03" }, { name: "Sample C", age: null, month: null }], limit: 1000, truncated: false };
test("chart selections narrow only receiving output, combine, and keep missing dates out", () => {
  expect(filterSqlResult(result, {}, [{ field: "month", value: "02" }]).rows).toEqual([result.rows[0]]);
  expect(filterSqlResult(result, { age: { op: "between", values: ["26", "30"] } }).rows).toEqual([result.rows[1]]);
  expect(filterSqlResult(result, { name: { op: "contains", values: ["sample"] } }, [{ field: "month", value: "02" }, { field: "age", value: "30" }]).rows).toEqual([]);
  expect(filterSqlResult(result, {}, [{ field: "missing", value: "02" }]).rows).toEqual([]);
  expect(result.rows).toHaveLength(3);
  expect(filterSqlResult(result, {}).rows).toHaveLength(3);
});
test("saved filters, compact cards, table order and grid placement round trip without new data access", () => {
  const dataset = { id: "source", name: "Synthetic", source: { kind: "sql" as const, sql: "SELECT age FROM sample", parameters: [], columns: [] } };
  const widget = { ...newChart(), tableSlug: "", datasetId: dataset.id, filters: { age: { op: "after" as const, values: ["20"] } }, answers: {}, sqlDetailField: "name", sqlSuffix: "years", sqlSuffixBelow: true, sqlShowViewerFilters: false, sqlSelectionField: "month", sqlReceiveSelections: true, pageSize: 20, width: 3, layout: { column: 9, row: 1, rows: 1 }, columns: ["name", "age"], body: "Dynamic output" };
  const tree = { folders: [{ ...newFolder("module", "Reports"), dashboards: [{ ...newDashboard("Example"), widgets: [widget] }] }], datasets: [dataset] };
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
  expect(stageSqlWidget([dataset], widget, dataset).widget.filters).toEqual(widget.filters);
  expect(visibleQueryColumns(result, ["month", "name"]).map((column) => column.key)).toEqual(["month", "name"]);
});

test("numeric presentation filters preserve exact decimal and int8 comparisons", () => {
  const exact: QueryResult = { columns: [{ key: "n", type: "numeric" }], rows: [{ n: "9007199254740992.1" }, { n: "9007199254740992.2" }, { n: "-0.0001" }, { n: null }], limit: 1000, truncated: false };
  expect(filterSqlResult(exact, { n: { op: "after", values: ["9007199254740992.1"] } }).rows).toEqual([exact.rows[1]]);
  expect(filterSqlResult(exact, { n: { op: "before", values: ["0"] } }).rows).toEqual([exact.rows[2]]);
});

test("axis appearance and date formatting survive saved configuration", async () => {
  const { formatQueryCell } = await import('./query-result');
  expect(formatQueryCell('2026-10-30T00:00:00Z', 'date', 'ru')).toBe('30.10.2026');
  const widget = { ...newChart(), tableSlug: '', filters: {}, answers: {}, appearance: { hideTitle: true, neutral: true, axisTicks: true, rounded: true, columnWidth: 40, decimals: 1 } };
  const tree = { folders: [{ ...newFolder('module', 'Reports'), dashboards: [{ ...newDashboard('Example'), widgets: [widget] }] }] };
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
});

test("date selections match calendar months and known employment intervals without inventing missing starts", () => {
  const dates: QueryResult = { columns: [{ key: "start",type:"date" },{key:"end",type:"date"}], rows: [{start:"2026-03-01",end:null},{start:"2026-01-01",end:"2026-03-31"},{start:null,end:null},{start:"2026-05-01",end:"2026-02-01"}],limit:100,truncated:false };
  expect(filterSqlResult(dates,{},[{field:"start",value:"2026-03-31",operator:"month"}]).rows).toEqual([dates.rows[0]]);
  expect(filterSqlResult(dates,{},[{field:"start",endField:"end",value:"2026-03-31",operator:"activeAt"}]).rows).toEqual([dates.rows[0]]);
  expect(filterSqlResult(dates,{},[{field:"start",endField:"missing",value:"2026-03-31",operator:"activeAt"}]).rows).toEqual([]);
  expect(filterSqlResult(dates,{},[{field:"start",value:"2026-02-30",operator:"month"}]).rows).toEqual([]);
  expect(filterSqlResult(dates,{}).rows).toHaveLength(4);
});

test("editable grouped records and series date rules survive dashboard reload",()=>{
 const widget={...newChart(),tableSlug:"",answers:{},filters:{},type:"records" as const,sqlRecords:{layout:"cards" as const,titleField:"name",groupField:"month",autoHeight:true,groupFilter:true,allLabel:"All months"},sqlTitleField:"title",sqlQuickFilterField:"status",sqlDetailField:"people",sqlDetailPlacement:"inline" as const,sqlDetailSuffix:"people",sqlDetailSeparator:"|",sqlSelectionValueField:"date",sqlSelectionRules:{total:{field:"start",operator:"activeAt" as const,endField:"end"}},appearance:{axisTitleLeft:"People",axisTitleRight:"Headcount",headerIcon:"calendar" as const,frameless:true,titleBelow:true},aggregation:"avg" as const};
 const tree={folders:[{...newFolder("module","Reports"),dashboards:[{...newDashboard("Example"),widgets:[widget]}]}]};
 expect(toTree(toTreeAttribute(tree))).toEqual(tree);
});
