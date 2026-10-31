import type { Filters } from "@/features/item";
import type { QueryResult } from "./query-result";

export type SqlSelectionRule = { field: string; operator: "equals" | "month" | "activeAt"; endField?: string };
export type SqlSelection = { field: string; value: string; key?: string; series?: string; operator?: SqlSelectionRule["operator"]; endField?: string };
export function parseSqlSelectionRules(raw: unknown): Record<string,SqlSelectionRule> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0,7).flatMap(([key,value])=>{
    if (["__proto__","constructor","prototype"].includes(key) || !value || typeof value!=="object") return [];
    const rule=value as Record<string,unknown>;
    return typeof rule.field==="string" && ["equals","month","activeAt"].includes(rule.operator as string) ? [[key,{field:rule.field.slice(0,200),operator:rule.operator,...(typeof rule.endField==="string"?{endField:rule.endField.slice(0,200)}:{})}]] : [];
  })) as Record<string,SqlSelectionRule>;
}
const isoDate = (value:unknown) => typeof value==="string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value.slice(0,10))) && new Date(value.slice(0,10)).toISOString().slice(0,10) === value.slice(0,10) ? value.slice(0,10) : null;


/** Presentation filters narrow only already permitted SQL output, never the query/access scope. */
export function filterSqlResult(result: QueryResult, filters: Filters, selections: SqlSelection[] = []): QueryResult {
  const columns = new Map(result.columns.map((column) => [column.key, column]));
  const active = Object.entries(filters).filter(([, filter]) => (filter.values.some(Boolean) || filter.bounds));
  const compare = (key: string, raw: unknown, bound: string) => {
    if (raw === null || raw === undefined) return NaN;
    const type = columns.get(key)?.type;
    if (["int2", "int4", "int8", "numeric", "float4", "float8"].includes(type ?? "")) return compareDecimal(String(raw), bound);
    return String(raw).localeCompare(bound);
  };
  const rows = result.rows.filter((row) => selections.every(({ field, value, operator, endField }) => {
    if (!columns.has(field) || row[field] === null || row[field] === undefined) return false;
    if (!operator || operator === "equals") return String(row[field]) === value;
    const date=isoDate(row[field]), selected=isoDate(value);
    if (!date || !selected) return false;
    if (operator === "month") return date.slice(0,7) === selected.slice(0,7);
    if (!endField || !columns.has(endField)) return false;
    const end=row[endField] === null || row[endField] === undefined || row[endField] === "" ? null : isoDate(row[endField]);
    return date <= selected && (row[endField] === null || row[endField] === undefined || row[endField] === "" || end !== null && end > selected);
  }) && active.every(([key, filter]) => {
    if (!columns.has(key)) return false;
    const raw = row[key], value = raw === null || raw === undefined ? "" : String(raw), first = filter.values[0] ?? "";
    switch (filter.op) {
      case "any": case "is": case "equals": return raw !== null && filter.values.includes(value);
      case "contains": return value.toLocaleLowerCase().includes(first.toLocaleLowerCase());
      case "after": return compare(key, raw, first) > 0;
      case "before": return compare(key, raw, first) < 0;
      case "between": return filter.bounds ? Object.entries(filter.bounds).every(([op, bound]) => !bound || (op === "$gt" ? compare(key, raw, bound) > 0 : op === "$gte" ? compare(key, raw, bound) >= 0 : op === "$lt" ? compare(key, raw, bound) < 0 : compare(key, raw, bound) <= 0)) : (!first || compare(key, raw, first) >= 0) && (!filter.values[1] || compare(key, raw, filter.values[1]) <= 0);
    }
  }));
  return { ...result, rows };
}

/** Compare exact numeric text without converting int8/decimal values to rounded JS numbers. */
function compareDecimal(a: string, b: string): number {
  const parse = (value: string) => { const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value); return match ? { negative: match[1] === "-", whole: match[2]!.replace(/^0+(?=\d)/, ""), fraction: (match[3] ?? "").replace(/0+$/, "") } : null; };
  const left = parse(a), right = parse(b); if (!left || !right) return NaN;
  const zero = (v: NonNullable<typeof left>) => v.whole === "0" && !v.fraction;
  const signA = left.negative && !zero(left), signB = right.negative && !zero(right);
  if (signA !== signB) return signA ? -1 : 1;
  const digits = Math.max(left.fraction.length, right.fraction.length), x = left.fraction.padEnd(digits, "0"), y = right.fraction.padEnd(digits, "0");
  const result = left.whole.length - right.whole.length || left.whole.localeCompare(right.whole) || x.localeCompare(y);
  return signA ? -result : result;
}
