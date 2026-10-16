import type { Dataset, DatasetTable } from "./datasets";
import { buildJoinSql, completeJoinColumns, initialJoinDraft, type JoinDraft } from "./sql-join-builder";
import { quoteSqlName } from "./sql-assist";

/** A deliberate manual edit, including clearing the draft, wins over later catalog/table changes. */
export function syncVisualSql(dataset: Dataset, table: string, catalog: DatasetTable[], visual?: JoinDraft, replaceManual = false): Dataset {
  if (dataset.source.kind !== "sql") return dataset;
  const source = dataset.source;
  const plan = visual ?? (source.visual?.base.table === table ? source.visual : initialJoinDraft(table));
  const full = completeJoinColumns(plan, catalog), generated = buildJoinSql(full, catalog);
  const automatic = replaceManual || source.sqlMode === "visual" || (source.sqlMode !== "manual" && !source.sql.trim());
  const fallback = table && !plan.joins.length ? `SELECT *\nFROM ${quoteSqlName(table)}\nLIMIT 100` : source.sql;
  const sql = automatic ? generated.issue ? fallback : generated.sql : source.sql;
  const next = { ...dataset, source: { ...source, visual: full, ...(automatic ? { sql, sqlMode: "visual" as const, parameters: [] } : {}) } };
  return JSON.stringify(next) === JSON.stringify(dataset) ? dataset : next;
}
