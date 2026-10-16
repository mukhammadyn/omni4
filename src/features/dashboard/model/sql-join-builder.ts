import type { DatasetTable } from "./datasets";
import { quoteSqlName } from "./sql-assist";

export type JoinSource = { table: string; alias: string };
export type JoinStep = JoinSource & { kind: "left" | "inner"; from: string; left: string; right: string };
export type JoinColumn = { alias: string; field: string };
export type JoinDraft = { base: JoinSource; joins: JoinStep[]; columns: JoinColumn[]; count: boolean };
type Issue = "source" | "alias" | "fields" | "condition" | "columns" | "limit";

/** Generates only the backend's bounded SELECT/equality JOIN grammar. No user SQL is parsed or rewritten. */
export function buildJoinSql(plan: JoinDraft, catalog: DatasetTable[]): { sql: string; issue: Issue | null } {
  const fail = (issue: Issue) => ({ sql: "", issue });
  if (plan.joins.length > 3 || plan.columns.length + Number(plan.count) > 64) return fail("limit");
  const sources = [plan.base, ...plan.joins], aliases = sources.map((source) => source.alias);
  if (aliases.some((alias) => !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(alias)) || new Set(aliases).size !== aliases.length) return fail("alias");
  const tableOf = (alias: string) => catalog.find((table) => table.slug === sources.find((source) => source.alias === alias)?.table);
  const fieldOf = (alias: string, field: string) => tableOf(alias)?.fields.find((item) => item.slug === field);
  if (sources.some((source) => !catalog.some((table) => table.slug === source.table))) return fail("source");
  for (let index = 0; index < plan.joins.length; index++) {
    const join = plan.joins[index]!;
    if (!["left", "inner"].includes(join.kind) || !sources.slice(0, index + 1).some((source) => source.alias === join.from)) return fail("condition");
    if (!fieldOf(join.from, join.left) || !fieldOf(join.alias, join.right)) return fail("fields");
  }
  if (!plan.count && !plan.columns.length) return fail("columns");
  if (plan.columns.some((column) => !fieldOf(column.alias, column.field))) return fail("fields");
  if (new Set(plan.columns.map((column) => JSON.stringify(column))).size !== plan.columns.length) return fail("columns");
  const ref = (alias: string, field: string) => `${quoteSqlName(alias)}.${quoteSqlName(field)}`;
  const used = new Set(plan.count ? ["total"] : []);
  const columns = plan.columns.map((column, index) => {
    const unique = plan.columns.filter((item) => item.field === column.field).length === 1;
    const proposed = unique ? column.field : `${column.alias}_${column.field}`;
    let name = new TextEncoder().encode(proposed).length <= 63 && !used.has(proposed) ? proposed : `column_${index + 1}`;
    while (used.has(name)) name = `_${name}`;
    used.add(name);
    return `${ref(column.alias, column.field)} AS ${quoteSqlName(name)}`;
  });
  if (plan.count) columns.push('COUNT(*) AS "total"');
  return { issue: null, sql: [
    `SELECT ${columns.join(", ")}`,
    `FROM ${quoteSqlName(plan.base.table)} AS ${quoteSqlName(plan.base.alias)}`,
    ...plan.joins.map((join) => `${join.kind === "left" ? "LEFT" : "INNER"} JOIN ${quoteSqlName(join.table)} AS ${quoteSqlName(join.alias)} ON ${ref(join.from, join.left)} = ${ref(join.alias, join.right)}`),
    ...(plan.count && plan.columns.length ? [`GROUP BY ${plan.columns.map((column) => ref(column.alias, column.field)).join(", ")}`] : []),
    "LIMIT 100",
  ].join("\n") };
}
