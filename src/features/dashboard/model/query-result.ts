import type { Item } from "@/features/item";
import { toField, type Field } from "@/features/table";

export type QueryColumn = { key: string; type: string; label?: string };
export type QueryResult = { columns: QueryColumn[]; rows: Item[]; limit: number; truncated: boolean };
const numericTypes = new Set(["int2", "int4", "int8", "numeric", "float4", "float8"]);
const types = new Set([...numericTypes, "text", "varchar", "bpchar", "uuid", "bool", "date", "timestamp", "timestamptz"]);

/** SQL AVG/MIN/MAX of an empty population is NULL, not a measured zero. */
export function hasQueryStatistic(result: QueryResult, key: string): boolean {
  return result.columns.some((column) => column.key === key && numericTypes.has(column.type))
    && result.rows.some((row) => row[key] !== null && row[key] !== undefined);
}

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
    const field = toField({ id: `sql:${column.key}`, slug: column.key, label: column.label ?? column.key, attributes: { disabled: true }, type: numericTypes.has(column.type) ? "NUMBER" : column.type === "bool" ? "CHECKBOX" : column.type === "date" ? "DATE" : ["timestamp", "timestamptz"].includes(column.type) ? "DATE_TIME" : "SINGLE_LINE" });
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


/** Display metadata only: never changes returned keys, data cells or manually written SQL. */
export function labelQueryResult(result: QueryResult, catalog: import("./datasets").DatasetTable[], language = "en"): QueryResult {
  const word = language.startsWith("ru") ? "Колонка" : language.startsWith("uz") ? "Ustun" : "Column";
  return { ...result, columns: result.columns.map((column, index) => {
    const names = [...new Set(catalog.flatMap((table) => table.fields.filter((field) => field.slug === column.key || `t_${field.slug}` === column.key || /^j\d+_/.test(column.key) && column.key.replace(/^j\d+_/, "") === field.slug).map((field) => field.label)))];
    const technical = /[_.]|^(?:guid|uuid|core|crm|hr|created_at|updated_at)$/i.test(column.key);
    return { ...column, label: names.length === 1 ? names[0]! : technical ? `${word} ${index + 1}` : column.key };
  }) };
}

/** Saved visibility affects only rendering; queries and returned rows keep their original schema. */
export function visibleQueryColumns(result: QueryResult, selected?: string[]): QueryColumn[] {
  const visible = selected ? selected.flatMap((key) => result.columns.find((column) => column.key === key) ?? []) : result.columns;
  return visible.length ? visible : result.columns;
}

/** Date-only SQL cells are calendar dates, independent of the viewer's timezone. */
export function formatQueryCell(value: unknown, type: string, language: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString(language, { timeZone: "UTC" });
  }
  return String(value);
}

/** Navigation stays on this app; interpolated record identifiers cannot become URL syntax. */
export function queryRecordHref(template: string | undefined, value: unknown): string | undefined {
  if (!template?.startsWith("/") || template.startsWith("//") || Array.from(template).some((char) => char.charCodeAt(0) <= 32 || char === "\\") || !template.includes("{value}") || value === null || value === undefined) return undefined;
  return template.replaceAll("{value}", encodeURIComponent(String(value)));
}
