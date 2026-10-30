import type { DatasetTable } from "./datasets";
import { quoteSqlName, sqlLex, sqlSuggestions } from "./sql-assist";

export type SQLSupportIssue = "star" | "cte" | "function" | "nested" | "write" | "clause" | "literal";
const aggregates = new Set(["count", "sum", "avg", "min", "max"]);
const dateFunctions = new Set(["age", "extract", "round"]);
const supportedKeywords = new Set(["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "INNER JOIN", "RIGHT JOIN", "FULL JOIN", "ON", "GROUP BY", "ORDER BY", "LIMIT", "AS", "AND", "COUNT", "SUM", "AVG", "MIN", "MAX"]);

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
  let series = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind === "name" && !token.quoted && ["or", "in", "having", "offset", "union", "over", "distinct", "cross", "for", "fetch"].includes(token.text.toLowerCase())) return "clause";
    if (token.kind === "name" && tokens[index + 1]?.text === "(") {
      const name = token.text.toLowerCase();
      if (token.quoted) return "function";
      if (aggregates.has(name)) continue;
      // Calendar expressions only; do not enable arbitrary or schema-qualified calls.
      if (tokens[index - 1]?.text === ".") return "function";
      if (dateFunctions.has(name)) {
        if (name === "extract" && !["year", "month"].some((part) => keyword(index + 2, part))) return "function";
        continue;
      }
      // A single literal calendar dimension supplies zero months/bands. No variable,
      // timestamp, step or unbounded series can pass this client-side guidance.
      if (name === "generate_series" && ++series === 1) {
        const close = tokens.findIndex((item, at) => at > index && item.text === ")");
        const args = close < 0 ? null : /^\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/.exec(sql.slice(tokens[index + 1]!.start, tokens[close]!.end));
        if (args && Number(args[1]) >= 1 && Number(args[2]) <= 12 && Number(args[1]) <= Number(args[2])) continue;
      }
      return "function";
    }
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
  if (numeric && dimension) examples.push({ kind: "totals", sql: `SELECT ${ref("t", dimension.slug)} AS "label", SUM(${ref("t", numeric.slug)}) AS "total"\nFROM ${quoteSqlName(source.slug)} AS "t"\nGROUP BY ${ref("t", dimension.slug)}\nORDER BY "total" DESC\nLIMIT 100` });
  const relation = source.fields.find((field) => field.type === "LOOKUP" && field.joinable && field.target);
  const target = catalog.find((table) => table.slug === relation?.target);
  const label = target?.fields.find((field) => ["SINGLE_LINE", "STATUS"].includes(field.type));
  if (relation && target && label && target.fields.some((field) => field.slug === "guid")) {
    const currency = source.fields.find((field) => field.slug === "currency");
    const groups = [ref("related", label.slug), ...(currency ? [ref("t", currency.slug)] : [])];
    examples.push({ kind: "join", sql: `SELECT ${groups[0]} AS "label"${currency ? `, ${groups[1]} AS "currency"` : ""}, ${numeric ? `SUM(${ref("t", numeric.slug)})` : "COUNT(*)"} AS "total"\nFROM ${quoteSqlName(source.slug)} AS "t"\nLEFT JOIN ${quoteSqlName(target.slug)} AS "related" ON ${ref("t", relation.slug)} = "related"."guid"\nGROUP BY ${groups.join(", ")}\nORDER BY "total" DESC\nLIMIT 100` });
  }
  return examples;
}
