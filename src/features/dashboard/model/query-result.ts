import type { Item } from "@/features/item";
import { toField, type Field } from "@/features/table";

export type QueryColumn = { key: string; type: string };
export type QueryResult = { columns: QueryColumn[]; rows: Item[]; limit: number; truncated: boolean };
const numericTypes = new Set(["int2", "int4", "int8", "numeric", "float4", "float8"]);
const types = new Set([...numericTypes, "text", "varchar", "bpchar", "uuid", "bool", "date", "timestamp", "timestamptz"]);

/** Decode the ordered server schema and tuples; persisted menu columns are not trusted. */
export function toQueryResult(value: unknown): QueryResult {
  if (!value || typeof value !== "object") throw new Error("Invalid dashboard query response");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data["columns"]) || !data["columns"].length || data["columns"].length > 64 || !Array.isArray(data["rows"]) || !Number.isInteger(data["limit"]) || (data["limit"] as number) < 1 || (data["limit"] as number) > 1000 || typeof data["truncated"] !== "boolean" || data["rows"].length > (data["limit"] as number)) throw new Error("Invalid dashboard query response");
  const seen = new Set<string>();
  const columns = data["columns"].map((raw): QueryColumn => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid query column");
    const column = raw as Record<string, unknown>, key = column["key"], type = column["type"];
    if (typeof key !== "string" || !key || key.length > 63 || ["__proto__", "constructor", "prototype"].includes(key) || seen.has(key) || typeof type !== "string" || !types.has(type)) throw new Error("Unsupported query column");
    seen.add(key); return { key, type };
  });
  const rows = data["rows"].map((raw): Item => {
    if (!Array.isArray(raw) || raw.length !== columns.length) throw new Error("Invalid query row");
    return Object.fromEntries(columns.map((column, index) => {
      const cell: unknown = raw[index];
      if (cell !== null) {
        if (column.type === "bool" ? typeof cell !== "boolean" : ["int2", "int4", "float4", "float8"].includes(column.type) ? typeof cell !== "number" || !Number.isFinite(cell) : typeof cell !== "string") throw new Error("Invalid query cell type");
        if (typeof cell === "string" && numericTypes.has(column.type) && !/^[+-]?\d+(?:\.\d+)?$/.test(cell)) throw new Error("Invalid query number");
      }
      return [column.key, cell];
    }));
  });
  return { columns, rows, limit: data["limit"] as number, truncated: data["truncated"] };
}

export function queryFields(result: QueryResult): Field[] {
  return result.columns.map((column) => {
    const field = toField({ id: `sql:${column.key}`, slug: column.key, label: column.key, attributes: { disabled: true }, type: numericTypes.has(column.type) ? "NUMBER" : column.type === "bool" ? "CHECKBOX" : column.type === "date" ? "DATE" : ["timestamp", "timestamptz"].includes(column.type) ? "DATE_TIME" : "SINGLE_LINE" });
    // Native chart axes use option labels; derive them only from returned SQL cells.
    for (const row of result.rows) {
      const cell = row[column.key]; if (cell === null) continue;
      const value = numericTypes.has(column.type) ? String(Number(cell)) : String(cell);
      field.options.set(value, { value, label: String(cell), labels: {}, color: null, icon: null, group: null });
    }
    return field;
  });
}

/** Tables retain decimal/int8 strings; charts reject values beyond safe numeric range. */
export function queryChartRows(result: QueryResult): Item[] {
  const numeric = result.columns.filter((column) => numericTypes.has(column.type));
  return result.rows.map((row) => {
    const converted = { ...row };
    for (const column of numeric) {
      const raw = row[column.key]; if (raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (typeof raw === "string" && canonicalDecimal(raw) !== canonicalDecimal(String(value)))) throw new Error("Query values exceed chart numeric precision; use a table");
      converted[column.key] = value;
    }
    return converted;
  });
}

function canonicalDecimal(value: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return "invalid";
  let digits = (match[2]! + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1] === "-" ? "-" : ""}${digits}e${exponent}`;
}
