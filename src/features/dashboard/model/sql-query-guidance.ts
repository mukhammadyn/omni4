import type { DatasetTable } from "./datasets";
import { quoteSqlName, sqlLex, sqlSuggestions } from "./sql-assist";

export type SQLSupportIssue = "star" | "cte" | "function" | "nested" | "write" | "clause" | "literal";
const aggregates = new Set(["count", "sum", "avg", "min", "max"]);
const supportedKeywords = new Set(["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "INNER JOIN", "ON", "GROUP BY", "ORDER BY", "LIMIT", "AS", "AND", "COUNT", "SUM", "AVG", "MIN", "MAX"]);

/** Dashboard-only SELECT guidance. The existing exec-query server does not enforce this policy. */
export function sqlSupportIssue(sql: string): SQLSupportIssue | null {
  const code = sqlLex(sql).filter((token) => token.kind !== "comment");
  // Parameter names are values, including names that resemble reserved words.
  const tokens = code.filter((token, index) => !(token.kind === "name" && code[index - 1]?.text === ":" && code[index - 1]?.end === token.start));
  const keyword = (at: number, value: string) => tokens[at]?.kind === "name" && !tokens[at]?.quoted && tokens[at]?.text.toLowerCase() === value;
  if (!keyword(0, "select")) return keyword(0, "with") ? "cte" : "write";
  const semicolons = tokens.filter((token) => token.text === ";");
  if (semicolons.length > 1 || (semicolons.length === 1 && tokens.at(-1)?.text !== ";")) return "write";
  if (tokens.some((token) => token.kind === "name" && !token.quoted && ["insert", "update", "delete", "create", "alter", "drop", "truncate", "grant", "revoke", "call", "copy", "into"].includes(token.text.toLowerCase()))) return "write";
  if (tokens.some((_, index) => keyword(index, "with"))) return "cte";
  if (tokens.filter((_, index) => keyword(index, "select")).length > 1) return "nested";
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind === "name" && !token.quoted && ["or", "in", "having", "offset", "union", "over", "distinct", "right", "full", "cross", "for", "fetch"].includes(token.text.toLowerCase())) return "clause";
    if (token.kind === "name" && tokens[index + 1]?.text === "(" && (token.quoted || !aggregates.has(token.text.toLowerCase()))) return "function";
  }
  return null;
}

export function boundedSqlSuggestions(sql: string, caret: number, catalog: DatasetTable[]) {
  return sqlSuggestions(sql, caret, catalog).filter((suggestion) => suggestion.detail !== "SQL" || supportedKeywords.has(suggestion.value));
}

export type SQLExample = { kind: "table" | "totals" | "join"; sql: string };
export function supportedSqlExamples(catalog: DatasetTable[]): SQLExample[] {
  const source = catalog[0]; if (!source?.fields.length) return [];
  const ref = (alias: string, field: string) => `${quoteSqlName(alias)}.${quoteSqlName(field)}`;
  const examples: SQLExample[] = [{ kind: "table", sql: `SELECT ${source.fields.slice(0, 4).map((field) => ref("t", field.slug)).join(", ")}\nFROM ${quoteSqlName(source.slug)} AS "t"\nLIMIT 100` }];
  const numeric = source.fields.find((field) => ["NUMBER", "FLOAT", "FLOAT_NOLIMIT", "MONEY", "INCREMENT_ID"].includes(field.type));
  const dimension = source.fields.find((field) => field.slug === "currency") ?? source.fields.find((field) => ["SINGLE_LINE", "STATUS"].includes(field.type));
  if (numeric && dimension) examples.push({ kind: "totals", sql: `SELECT ${ref("t", dimension.slug)} AS "label", SUM(${ref("t", numeric.slug)})::float8 AS "total"\nFROM ${quoteSqlName(source.slug)} AS "t"\nGROUP BY ${ref("t", dimension.slug)}\nORDER BY "total" DESC\nLIMIT 100` });
  const relation = source.fields.find((field) => field.type === "LOOKUP" && field.joinable && field.target);
  const target = catalog.find((table) => table.slug === relation?.target);
  const label = target?.fields.find((field) => ["SINGLE_LINE", "STATUS"].includes(field.type));
  if (relation && target && label && target.fields.some((field) => field.slug === "guid")) {
    const currency = source.fields.find((field) => field.slug === "currency");
    const groups = [ref("related", label.slug), ...(currency ? [ref("t", currency.slug)] : [])];
    examples.push({ kind: "join", sql: `SELECT ${groups[0]} AS "label"${currency ? `, ${groups[1]} AS "currency"` : ""}, ${numeric ? `SUM(${ref("t", numeric.slug)})::float8` : "COUNT(*)"} AS "total"\nFROM ${quoteSqlName(source.slug)} AS "t"\nLEFT JOIN ${quoteSqlName(target.slug)} AS "related" ON ${ref("t", relation.slug)} = "related"."guid"\nGROUP BY ${groups.join(", ")}\nORDER BY "total" DESC\nLIMIT 100` });
  }
  return examples;
}
