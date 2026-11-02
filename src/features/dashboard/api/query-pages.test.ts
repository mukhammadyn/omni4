import { expect, test, vi } from "vitest";
import { executeDashboardPages } from "./query-pages";
import type { QueryExecutionInput } from "./query-execution";
import type { QueryResult } from "../model/query-result";
const input:QueryExecutionInput={menu_id:"fixture",sql:"SELECT guid, amount FROM tasks",parameters:[],limit:1000};
const result=(start:number,n:number,truncated=false):QueryResult=>({columns:[{key:"guid",type:"text"},{key:"amount",type:"numeric"}],rows:Array.from({length:n},(_,i)=>({guid:String(start+i),amount:`${start+i}.01`})),limit:1000,truncated});
test("loads 12,092 unique rows sequentially without losing exact decimal text",async()=>{
 const read=vi.fn(async(input:QueryExecutionInput)=>{const offset=input.page!.offset;return result(offset,Math.min(1000,12092-offset),offset+1000<12092);});
 const all=await executeDashboardPages(input,"guid",undefined,read);
 expect(all.rows).toHaveLength(12092);expect(all.rows.at(-1)?.amount).toBe("12091.01");expect(all.truncated).toBe(false);
 expect(read).toHaveBeenCalledTimes(13);expect(read.mock.calls.map(([r])=>r.page?.offset)).toEqual(Array.from({length:13},(_,i)=>i*1000));
});
test("schema changes, duplicate or absent IDs fail instead of claiming full population",async()=>{
 const duplicate=vi.fn().mockResolvedValueOnce(result(0,1000,true)).mockResolvedValueOnce(result(999,2));
 await expect(executeDashboardPages(input,"guid",undefined,duplicate)).rejects.toThrow("unique");
 await expect(executeDashboardPages(input,"missing",undefined,async()=>result(0,1))).rejects.toThrow("identifier");
 const changed=vi.fn().mockResolvedValueOnce(result(0,1000,true)).mockResolvedValueOnce({...result(1000,1),columns:[{key:"guid",type:"uuid"}]});
 await expect(executeDashboardPages(input,"guid",undefined,changed)).rejects.toThrow("schema");
});
test("scope cancellation stops subsequent pages and total row cap stays explicit",async()=>{
 const abort=new AbortController(); const read=vi.fn(async()=>{abort.abort();return result(0,1000,true);});
 await expect(executeDashboardPages(input,"guid",abort.signal,read)).rejects.toThrow();expect(read).toHaveBeenCalledTimes(1);
 const capped=await executeDashboardPages(input,"guid",undefined,async i=>result(i.page!.offset,1000,true));
 expect(capped.rows).toHaveLength(20000);expect(capped.truncated).toBe(true);
});
