import type { DatasetTable } from "./datasets";
import { quoteSqlName } from "./sql-assist";

export const JOIN_KINDS = ["inner", "left", "right", "full"] as const;
export type JoinKind = typeof JOIN_KINDS[number];
export type JoinSource = { table: string; alias: string };
export type JoinStep = JoinSource & { kind: JoinKind; from: string; left: string; right: string };
export type JoinColumn = { alias: string; field: string };
export type JoinDraft = { base: JoinSource; joins: JoinStep[]; columns: JoinColumn[]; count: boolean };
type Issue = "source" | "alias" | "fields" | "condition" | "columns" | "limit";

/** Client visual SELECT builder for the existing PostgreSQL endpoint. Manual SQL is never parsed or rewritten. */
export function buildJoinSql(plan: JoinDraft, catalog: DatasetTable[]): { sql: string; issue: Issue | null } {
  const fail = (issue: Issue) => ({ sql: "", issue });
  if (plan.columns.length + Number(plan.count) > 64) return fail("limit");
  const sources = [plan.base, ...plan.joins], aliases = sources.map((source) => source.alias);
  if (aliases.some((alias) => !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(alias)) || new Set(aliases).size !== aliases.length) return fail("alias");
  const tableOf = (alias: string) => catalog.find((table) => table.slug === sources.find((source) => source.alias === alias)?.table);
  const fieldOf = (alias: string, field: string) => tableOf(alias)?.fields.find((item) => item.slug === field);
  if (sources.some((source) => !catalog.some((table) => table.slug === source.table))) return fail("source");
  for (let index = 0; index < plan.joins.length; index++) {
    const join = plan.joins[index]!;
    if (!JOIN_KINDS.includes(join.kind) || !sources.slice(0, index + 1).some((source) => source.alias === join.from)) return fail("condition");
    if (!fieldOf(join.from, join.left) || !fieldOf(join.alias, join.right)) return fail("fields");
  }
  if (!plan.count && !plan.columns.length) return fail("columns");
  if (plan.columns.some((column) => !fieldOf(column.alias, column.field))) return fail("fields");
  if (new Set(plan.columns.map((column) => JSON.stringify(column))).size !== plan.columns.length) return fail("columns");
  const ref = (alias: string, field: string) => `${quoteSqlName(alias)}.${quoteSqlName(field)}`;
  const used = new Set(plan.count ? ["total"] : []);
  const columns = plan.columns.map((column, index) => {
    const unique = plan.columns.filter((item) => item.field === column.field).length === 1;
    const field = fieldOf(column.alias, column.field)!;
    const title = field.label?.trim() && field.label !== field.slug ? field.label : `Column ${index + 1}`;
    const proposed = unique ? title : `${tableOf(column.alias)!.label} · ${title}`;
    const clipped = (value: string) => { let text = value; while (new TextEncoder().encode(text).length > 59) text = text.slice(0, -1); return text; };
    let name = clipped(proposed), suffix = 1;
    while (used.has(name)) name = `${clipped(proposed)} ${++suffix}`;
    used.add(name);
    return `${ref(column.alias, column.field)} AS ${quoteSqlName(name)}`;
  });
  if (plan.count) columns.push('COUNT(*) AS "total"');
  return { issue: null, sql: [
    `SELECT ${columns.join(", ")}`,
    `FROM ${quoteSqlName(plan.base.table)} AS ${quoteSqlName(plan.base.alias)}`,
    ...plan.joins.map((join) => `${join.kind.toUpperCase()} JOIN ${quoteSqlName(join.table)} AS ${quoteSqlName(join.alias)} ON ${ref(join.from, join.left)} = ${ref(join.alias, join.right)}`),
    ...(plan.count && plan.columns.length ? [`GROUP BY ${plan.columns.map((column) => ref(column.alias, column.field)).join(", ")}`] : []),
    "LIMIT 100",
  ].join("\n") };
}


/** Only recognized visual metadata survives save/reopen; live catalog validates identifiers on generation. */
export function parseJoinDraft(value: unknown): JoinDraft | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>, base = v["base"] as JoinSource | undefined;
  if (!base || typeof base.table !== "string" || typeof base.alias !== "string" || !Array.isArray(v["joins"]) || v["joins"].length > 64 || !Array.isArray(v["columns"]) || v["columns"].length > 64 || typeof v["count"] !== "boolean") return;
  const joins: JoinStep[] = [];
  for (const raw of v["joins"]) {
    if (!raw || typeof raw !== "object") return;
    const j = raw as JoinStep;
    if (![j.table, j.alias, j.from, j.left, j.right].every((s) => typeof s === "string") || !JOIN_KINDS.includes(j.kind)) return;
    joins.push({ table: j.table, alias: j.alias, from: j.from, left: j.left, right: j.right, kind: j.kind });
  }
  const columns: JoinColumn[] = [];
  for (const raw of v["columns"]) {
    if (!raw || typeof raw !== "object") return;
    const c = raw as JoinColumn;
    if (typeof c.alias !== "string" || typeof c.field !== "string") return;
    columns.push({ alias: c.alias, field: c.field });
  }
  return { base: { table: base.table, alias: base.alias }, joins, columns, count: v["count"] };
}

export function initialJoinDraft(table: string): JoinDraft {
  return { base: { table, alias: "t" }, joins: [], columns: [], count: false };
}

/** All output columns start enabled; visibility is a preview concern, not a JOIN-builder control. */
export function completeJoinColumns(plan: JoinDraft, catalog: DatasetTable[]): JoinDraft {
  return { ...plan, count: false, columns: [plan.base, ...plan.joins].flatMap((source) => (catalog.find((t) => t.slug === source.table)?.fields ?? []).map((field) => ({ alias: source.alias, field: field.slug }))).slice(0, 64) };
}
