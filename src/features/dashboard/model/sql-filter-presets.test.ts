import {expect,test} from 'vitest';
import {parseSqlFilterPresets} from './sql-filter-presets';
import {filterSqlResult} from './sql-result-filters';
test('presets narrow permitted output and preserve unknown values instead of comparing them to zero',()=>{
 const presets=parseSqlFilterPresets([{label:'Pending',field:'pending',op:'after',value:'0'},{label:'Exhausted',field:'left',op:'is',value:'0'}]);
 const result={columns:[{key:'pending',type:'numeric'},{key:'left',type:'numeric'}],rows:[{pending:2,left:0},{pending:0,left:null},{pending:0,left:3}],limit:100,truncated:false};
 expect(filterSqlResult(result,{[presets[0]!.field]:{op:presets[0]!.op,values:[presets[0]!.value]}}).rows).toEqual([result.rows[0]]);
 expect(filterSqlResult(result,{[presets[1]!.field]:{op:presets[1]!.op,values:[presets[1]!.value]}}).rows).toEqual([result.rows[0]]);
 expect(parseSqlFilterPresets([{label:'Invalid',field:'left',op:'delete',value:'0'}])).toEqual([]);
 expect(parseSqlFilterPresets(Array(20).fill(presets[0]))).toHaveLength(8);
});
