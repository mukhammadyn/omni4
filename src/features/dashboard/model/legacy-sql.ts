import type { SqlResult } from "@/features/settings";
import { quoteSqlName, sqlLex } from "./sql-assist";
import { sqlSupportIssue } from "./sql-query-guidance";
import { toQueryResult } from "./query-result";

type Parameter = { name: string; type: "text" | "number" | "date" | "boolean"; value: string };

/** Client shaping only: existing ExecuteSQL does not enforce dashboard read-only/bounds. */
export function prepareDashboardSql(sql: string, parameters: Parameter[], limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || sql.length > 32768) throw new Error("Invalid dashboard preview limits");
  if (sqlSupportIssue(sql)) throw new Error("Dashboard preview accepts one SELECT query with supported JOINs and aggregates");
  const tokens = sqlLex(sql), params: string[] = [], names = new Map<string, number>();
  const casts = { text: "text", number: "numeric", date: "date", boolean: "boolean" };
  let text = "", end = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!, next = tokens[i + 1];
    if (token.text !== ":" || next?.kind !== "name" || next.quoted || token.end !== next.start || tokens[i - 1]?.text === ":") continue;
    const parameter = parameters.find((item) => item.name === next.text);
    if (!parameter || !Object.hasOwn(casts, parameter.type)) throw new Error(`Missing query parameter: ${next.text}`);
    if (parameter.type === "number" && !/^[+-]?\d+(?:\.\d+)?$/.test(parameter.value)) throw new Error(`Invalid numeric parameter: ${next.text}`);
    if (parameter.type === "boolean" && !["true", "false"].includes(parameter.value)) throw new Error(`Invalid boolean parameter: ${next.text}`);
    if (parameter.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(parameter.value) || Number.isNaN(Date.parse(parameter.value)) || new Date(parameter.value).toISOString().slice(0, 10) !== parameter.value)) throw new Error(`Invalid date parameter: ${next.text}`);
    if (!names.has(next.text)) { params.push(parameter.value); names.set(next.text, params.length); }
    text += sql.slice(end, token.start) + `$${names.get(next.text)}::${casts[parameter.type]}`;
    end = next.end; i++;
  }
  text += sql.slice(end);
  const terminal = sqlLex(text).filter((token) => token.kind !== "comment").at(-1);
  if (terminal?.text === ";") text = text.slice(0, terminal.start) + text.slice(terminal.end);
  // One extra row reports clipping. This changes only the sent statement, never the draft.
  return { sql: `SELECT * FROM (\n${text}\n) AS "dashboard_preview" LIMIT ${limit + 1}`, params };
}

const exactNumeric = new Set(["numeric", "int8"]);
const missingMetadata = "SQL returned no column metadata. The existing endpoint hides SQL/conversion errors; verify syntax and source columns.";

/** LIMIT 0 obtains native output types without serializing numeric result values. */
export function numericProjection(sql: string, schema: SqlResult) {
  if (!schema.columns.length) throw new Error(missingMetadata);
  if (schema.columns.length > 64 || schema.columns.some((key) => !key || ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Unsupported SQL output schema");
  const exactColumns = schema.columns.filter((key) => exactNumeric.has(schema.types[key] ?? ""));
  if (!exactColumns.length) return { sql, exactColumns };
  const fields = schema.columns.map((key) => `"dashboard_values".${quoteSqlName(key)}${exactColumns.includes(key) ? `::text AS ${quoteSqlName(key)}` : ""}`);
  return { sql: `SELECT ${fields.join(", ")} FROM (\n${sql}\n) AS "dashboard_values"`, exactColumns };
}

/** The data response must match the inspected schema and text transport exactly. */
export function restoreNumericSchema(schema: SqlResult, result: SqlResult, exactColumns: string[]): SqlResult {
  if (!result.columns.length) throw new Error(missingMetadata);
  if (result.columns.length !== schema.columns.length || schema.columns.some((key) => !result.columns.includes(key) || result.types[key] !== (exactColumns.includes(key) ? "text" : schema.types[key]))) throw new Error("SQL output schema changed during preview; run again");
  for (const row of result.rows) for (const key of exactColumns) {
    if (row[key] !== null && typeof row[key] !== "string") throw new Error("Exact SQL numeric text was not returned");
  }
  return { ...result, columns: schema.columns, types: schema.types };
}

/** Legacy output maps lose SELECT order; native numeric/int8 are transported as SQL text. */
export function legacyQueryResult(result: SqlResult, limit: number) {
  if (!result.columns.length) throw new Error(missingMetadata);
  if (new TextEncoder().encode(JSON.stringify(result)).length > 2 * 1024 * 1024) throw new Error("SQL preview response is too large");
  const numeric = ["int8", "numeric"], supported = new Set(["int2", "int4", "float4", "float8", ...numeric, "text", "varchar", "bpchar", "uuid", "bool", "date", "timestamp", "timestamptz"]);
  const columns = result.columns.map((key) => {
    const first = result.rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
    const raw = result.types[key] ?? "unknown";
    const type = supported.has(raw) ? raw : typeof first === "number" ? "float8" : typeof first === "boolean" ? "bool" : "text";
    return { key, type };
  });
  const rows = result.rows.slice(0, limit).map((row) => columns.map(({ key, type }) => {
    const cell = row[key]; if (cell === null || cell === undefined) return null;
    if (numeric.includes(type)) return String(cell);
    if (["int2", "int4", "float4", "float8"].includes(type) || type === "bool") return cell;
    return typeof cell === "string" ? cell : JSON.stringify(cell);
  }));
  return toQueryResult({ columns, rows, limit, truncated: result.rows.length > limit });
}
