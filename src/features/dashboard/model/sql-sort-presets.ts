import type { QueryResult } from "./query-result";
import { compareDecimal } from "./sql-result-filters";

export type SqlSortPreset = { label: string; field: string; direction: "asc" | "desc"; nulls: "first" | "last" };
export function parseSqlSortPresets(raw: unknown): SqlSortPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const p = value as Record<string, unknown>;
    return typeof p.label === "string" && typeof p.field === "string" && ["asc", "desc"].includes(String(p.direction)) && ["first", "last"].includes(String(p.nulls))
      ? [{ label: p.label.slice(0, 80), field: p.field.slice(0, 200), direction: p.direction as SqlSortPreset["direction"], nulls: p.nulls as SqlSortPreset["nulls"] }] : [];
  });
}

/** Sort the whole filtered, permitted result before pagination. Never mutate server rows.
 * Decimal/int8 text retains precision; unknowns have an explicit direction-independent position.
 * Equal keys retain deterministic query order, including ties and unknown values. */
export function sortSqlResult(result: QueryResult, preset: SqlSortPreset | undefined, language: string): QueryResult {
  const column = preset && result.columns.find(c => c.key === preset.field);
  if (!preset || !column) return result;
  const numeric = ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(column.type);
  const collator = new Intl.Collator(language, { numeric: true, sensitivity: "base" });
  // JS float columns may stringify in exponent notation; keep them numeric too.
  const numericText = (value: unknown) => {
    const text = String(value);
    const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
    if (!match) return text;
    const digits = match[2]! + (match[3] ?? ""), point = match[2]!.length + Number(match[4]);
    if (Math.abs(point) > 1000) return "invalid";
    return match[1]! + (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0,point) + "." + digits.slice(point));
  };
  const unknown = (value: unknown) => value === null || value === undefined || value === "" || numeric && Number.isNaN(compareDecimal(numericText(value), "0"));
  const rows = result.rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row[preset.field], right = b.row[preset.field];
    const x = unknown(left), y = unknown(right);
    if (x || y) return x === y ? a.index - b.index : (x ? 1 : -1) * (preset.nulls === "last" ? 1 : -1);
    const compared = numeric ? compareDecimal(numericText(left), numericText(right)) : collator.compare(String(left), String(right));
    return (preset.direction === "desc" ? -compared : compared) || a.index - b.index;
  }).map(value => value.row);
  return { ...result, rows };
}
