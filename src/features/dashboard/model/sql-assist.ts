import type { DatasetTable } from "./datasets";

type Token = { text: string; start: number; end: number; kind: "name" | "symbol" | "literal" | "comment"; quoted?: boolean };
const WORD = /[\p{L}\p{N}_$]/u;
const KEYWORDS = ["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "INNER JOIN", "ON", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "AS", "AND", "OR", "WITH", "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF"];
const RESERVED = new Set([...KEYWORDS.flatMap((word) => word.toLowerCase().split(" ")), "asc", "desc", "union", "all", "distinct", "right", "full", "outer", "cross", "offset", "returning", "using", "then", "else", "end"]);

/** Advisory lexer only. PostgreSQL and the permission-aware server remain authoritative. */
export function sqlLex(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i]!)) { i++; continue; }
    const start = i;
    let kind: Token["kind"] = "symbol", quoted = false;
    if (sql.slice(i, i + 2) === "--") {
      kind = "comment"; i = sql.indexOf("\n", i); if (i < 0) i = sql.length;
    } else if (sql.slice(i, i + 2) === "/*") {
      kind = "comment"; i += 2; let depth = 1;
      while (i < sql.length && depth) { if (sql.slice(i, i + 2) === "/*") { depth++; i += 2; } else if (sql.slice(i, i + 2) === "*/") { depth--; i += 2; } else i++; }
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]!; kind = quote === "'" ? "literal" : "name"; quoted = quote === '"';
      while (i < sql.length) { if (sql[i++] === quote) { if (sql[i] === quote) i++; else break; } }
    } else if (sql[i] === "$" && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      kind = "literal"; const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))![0];
      const end = sql.indexOf(delimiter, i + delimiter.length); i = end < 0 ? sql.length : end + delimiter.length;
    } else if (/[\p{L}_]/u.test(sql[i]!)) {
      kind = "name"; while (i < sql.length && WORD.test(sql[i]!)) i++;
    } else { i++; }
    tokens.push({ text: sql.slice(start, i), start, end: i, kind, ...(quoted ? { quoted: true } : {}) });
  }
  return tokens;
}

const nameOf = (token: Token | undefined) => token?.quoted ? token.text.slice(1, -1).replaceAll('""', '"') : token?.text.toLowerCase() ?? "";
export const quoteSqlName = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Parameters for a future typed-binding contract; strings/comments/casts are excluded. */
export function namedSqlParameters(sql: string): string[] {
  const tokens = sqlLex(sql), names: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i]!, next = tokens[i + 1]!;
    if (current.text !== ":" || next.kind !== "name" || current.end !== next.start || tokens[i - 1]?.text === ":" || tokens[i + 1]?.text === ":") continue;
    if (!names.includes(next.text)) names.push(next.text);
  }
  return names;
}

export type SqlSuggestion = { value: string; label: string; detail: string; replaceFrom: number; replaceTo: number };

function aliasesOf(tokens: Token[], catalog: DatasetTable[]) {
  const aliases = new Map<string, DatasetTable>();
  for (let i = 0; i < tokens.length; i++) {
    if (!["from", "join"].includes(nameOf(tokens[i]))) continue;
    const name = tokens[i + 1]; if (name?.kind !== "name") continue;
    let at = i + 2, slug = nameOf(name);
    if (tokens[at]?.text === "." && tokens[at + 1]?.kind === "name") { slug = nameOf(tokens[at + 1]); at += 2; }
    const table = catalog.find((item) => item.slug === slug); if (!table) continue;
    if (nameOf(tokens[at]) === "as") at++;
    const alias = tokens[at]?.kind === "name" && !RESERVED.has(nameOf(tokens[at])) ? nameOf(tokens[at]) : table.slug;
    // Duplicate aliases cannot be resolved faithfully without a complete scope parser.
    if (aliases.has(alias) && aliases.get(alias)?.slug !== table.slug) aliases.delete(alias);
    else aliases.set(alias, table);
  }
  return aliases;
}

/** Schema + alias-aware suggestions. Ambiguous nested scopes stay conservative. */
export function sqlSuggestions(sql: string, caret: number, catalog: DatasetTable[]): SqlSuggestion[] {
  const all = sqlLex(sql);
  const token = all.find((item) => item.start <= caret && caret < item.end) ?? all.find((item) => item.end === caret);
  if (token && (token.kind === "literal" || token.kind === "comment")) return [];
  const before = sql.slice(0, caret), word = /[\p{L}\p{N}_$]*$/u.exec(before)![0];
  const quoted = token?.quoted && token.kind === "name" && caret > token.start;
  const from = quoted ? token.start : caret - word.length, prefix = quoted ? sql.slice(token.start + 1, caret).replaceAll('""', '"').replace(/"$/, "").toLowerCase() : word.toLowerCase();
  const replaceTo = quoted ? token.end : caret;
  const tokens = all.filter((item) => item.kind !== "comment" && item.kind !== "literal");
  const preceding = tokens.filter((item) => item.end <= from);
  const previous = preceding.at(-1), qualifier = previous?.text === "." ? nameOf(preceding.at(-2)) : "";
  const aliases = aliasesOf(tokens, catalog);
  let candidates: { value: string; label: string; detail: string }[];
  if (qualifier) {
    const table = aliases.get(qualifier) ?? catalog.find((item) => item.slug === qualifier);
    candidates = table?.fields.map((field) => ({ value: quoteSqlName(field.slug), label: field.slug, detail: `${field.label} · ${field.type}` })) ?? [];
  } else if (["from", "join"].includes(nameOf(previous))) {
    candidates = catalog.map((table) => ({ value: quoteSqlName(table.slug), label: table.slug, detail: table.label }));
  } else {
    candidates = [...aliases].flatMap(([alias, table]) => table.fields.map((field) => ({ value: `${quoteSqlName(alias)}.${quoteSqlName(field.slug)}`, label: field.slug, detail: `${table.label} · ${field.type}` })));
    candidates.push(...KEYWORDS.map((value) => ({ value, label: value, detail: "SQL" })));
  }
  const unique = new Map(candidates.filter((item) => item.label.toLowerCase().startsWith(prefix)).map((item) => [item.value, item]));
  return [...unique.values()].slice(0, 20).map((item) => ({ ...item, replaceFrom: from, replaceTo }));
}

export function joinSqlGuidance(catalog: DatasetTable[]): string[] {
  return catalog.flatMap((table) => table.fields.flatMap((field) => {
    const target = catalog.find((item) => item.slug === field.target);
    return target && field.type === "LOOKUP" && field.joinable === true ? [`LEFT JOIN ${quoteSqlName(target.slug)} ON ${quoteSqlName(table.slug)}.${quoteSqlName(field.slug)} = ${quoteSqlName(target.slug)}."guid"`] : [];
  }));
}

/** Insert only into a deliberately small, unambiguous SELECT form. null means manual guidance. */
export function insertJoinGuidance(sql: string, join: string, source: string): string | null {
  const tokens = sqlLex(sql);
  const complete = (token: Token) => {
    if (token.kind === "name" && token.quoted) return token.text.length >= 2 && token.text.endsWith('"');
    if (token.kind === "literal") {
      // Backslash escape modes need a PostgreSQL parser; the advisory lexer is not one.
      if (token.text.includes("\\")) return false;
      if (token.text.startsWith("'")) return token.text.length >= 2 && token.text.endsWith("'");
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(token.text)?.[0];
      return Boolean(delimiter && token.text.length >= delimiter.length * 2 && token.text.endsWith(delimiter));
    }
    if (token.kind === "comment" && token.text.startsWith("/*")) {
      let depth = 0;
      for (let at = 0; at < token.text.length - 1; at++) {
        const pair = token.text.slice(at, at + 2);
        if (pair === "/*") { depth++; at++; }
        else if (pair === "*/") { depth--; at++; }
      }
      return depth === 0;
    }
    return true;
  };
  if (tokens.some((token) => !complete(token))) return null;
  const code = tokens.filter((token) => token.kind !== "comment");
  const keyword = (token: Token | undefined, name: string) => token?.kind === "name" && !token.quoted && token.text.toLowerCase() === name;
  if (!keyword(code[0], "select")) return null;
  if (code.filter((token) => keyword(token, "select")).length !== 1 || code.some((token) => token.text === "(" || token.text === ")" || ["join", "union", "intersect", "except", "with"].some((word) => keyword(token, word)))) return null;
  const semicolons = code.filter((token) => token.text === ";");
  if (semicolons.length > 1 || (semicolons.length === 1 && semicolons[0] !== code.at(-1))) return null;
  const from = code.findIndex((token) => keyword(token, "from"));
  if (from < 0 || code.filter((token) => keyword(token, "from")).length !== 1) return null;
  const table = code[from + 1], next = code[from + 2];
  if (table?.kind !== "name" || nameOf(table) !== source) return null;
  const trailing = next && (["where", "having", "limit", "offset", "fetch", "for", "window"].some((word) => keyword(next, word)) || (["group", "order"].some((word) => keyword(next, word)) && keyword(code[from + 3], "by")));
  // Aliases, qualified sources and extra FROM terms need manual placement and alias adjustment.
  if (next && next.text !== ";" && !trailing) return null;
  if (!join.startsWith("LEFT JOIN ") || !join.includes(` ON ${quoteSqlName(source)}.`) || join.startsWith(`LEFT JOIN ${quoteSqlName(source)} `)) return null;
  const suffix = sql.slice(table.end).trimStart();
  return `${sql.slice(0, table.end)}\n${join}${suffix ? `\n${suffix}` : ""}`;
}
