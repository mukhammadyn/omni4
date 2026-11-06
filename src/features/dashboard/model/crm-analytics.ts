/** Reference CRM reports. Aggregations retain source IDs and never infer transitions. */
export type CrmRow = Record<string, unknown>;
export type CrmView = "funnel" | "tasks" | "calls";
export const CRM_REPORTS: Record<string, CrmView> = {
  "ab663efb-fcf4-4ec1-a7c1-e9814dde89ad": "funnel",
  "87eb9515-cbaf-462c-aef2-87e82ed26888": "tasks",
  "b012d84e-0408-4fe1-a19d-b2da697dd711": "calls",
};
export const text = (row: CrmRow, key: string, fallback = "") => typeof row[key] === "string" && row[key] ? String(row[key]) : fallback;
export const number = (row: CrmRow, key: string) => row[key] === null || row[key] === undefined || row[key] === "" ? null : Number.isFinite(Number(row[key])) ? Number(row[key]) : null;
export const lost = (row: CrmRow) => row.is_lost === true || row.is_lost === "true";
export const won = (row: CrmRow) => !lost(row) && text(row, "container") === "done";
export const completed = (row: CrmRow) => text(row, "status") === "done";
export const date = (value: unknown) => { const d = typeof value === "string" && value ? new Date(value) : null; return d && Number.isFinite(d.getTime()) ? d : null; };
export const day = (value: unknown) => typeof value === "string" ? value.slice(0, 10) : "";
export function overdueDays(row: CrmRow, now = new Date()) {
  if (completed(row)) return 0;
  const due = date(day(row.due_date));
  return due ? Math.max(0, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())) / 86400000)) : 0;
}
export function duration(seconds: number) {
  const total = Math.max(0, Math.round(seconds)), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
export function sum(rows: CrmRow[], key: string): number | null {
  const values = rows.map(row => number(row, key)).filter((value): value is number => value !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
export function groups(rows: CrmRow[], key: string) {
  const map = new Map<string, CrmRow[]>();
  for (const row of rows) { const value = text(row, key); map.set(value, [...(map.get(value) ?? []), row]); }
  return [...map].map(([id, rows]) => ({ id, rows }));
}
export function stagePoints(deals: CrmRow[], stages: CrmRow[], history: CrmRow[]) {
  const ids = new Set(deals.map(row => text(row, "guid"))), reached = new Map<string, Set<string>>();
  const mark = (stage: string, id: string) => { if (stage && ids.has(id)) { const set = reached.get(stage) ?? new Set<string>(); set.add(id); reached.set(stage, set); } };
  for (const row of deals) mark(text(row, "stage_id"), text(row, "guid"));
  for (const row of history) { mark(text(row, "from_id"), text(row, "deal_id")); mark(text(row, "to_id"), text(row, "deal_id")); }
  return stages.map(stage => ({ id: text(stage, "guid"), label: text(stage, "name"), color: text(stage, "color"), count: reached.get(text(stage, "guid"))?.size ?? 0 }));
}
export function stageTimes(deals: CrmRow[], history: CrmRow[], now = new Date(), dimension: "pipeline" | "stage" | "all" = "pipeline") {
  const lookup = new Map(deals.map(row => [text(row, "guid"), row]));
  const durations = new Map<string, number[]>();
  for (const group of groups(history, "deal_id")) {
    const deal = lookup.get(group.id); if (!deal) continue;
    const sorted = group.rows.filter(row => date(row.moved_at)).sort((a, b) => date(a.moved_at)!.getTime() - date(b.moved_at)!.getTime());
    for (const [i, row] of sorted.entries()) {
      const start = date(row.moved_at)!, end = date(sorted[i + 1]?.moved_at) ?? now;
      if (end < start || !text(row, "to_id")) continue;
      const key = dimension === "all" ? "all" : dimension === "stage" ? text(row, "to_id") : text(deal, "pipeline_id"), list = durations.get(key) ?? []; list.push((end.getTime() - start.getTime()) / 86400000); durations.set(key, list);
    }
  }
  return [...durations].map(([id, values]) => { values.sort((a, b) => a - b); const half = Math.floor(values.length / 2); return { id, max: values.at(-1)!, min: values[0]!, avg: values.reduce((a, b) => a + b, 0) / values.length, median: values.length % 2 ? values[half]! : (values[half - 1]! + values[half]!) / 2, transitions: values.length }; });
}
export function heatmap(rows: CrmRow[]) {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const row of rows) { const created = date(row.created_at); if (created) cells[(created.getDay() + 6) % 7]![created.getHours()]!++; }
  return { cells, max: Math.max(0, ...cells.flat()), total: cells.map(row => row.reduce((a, b) => a + b, 0)) };
}
export function timeline(rows: CrmRow[], field: string, weekdays = false) {
  const map = new Map<string, { label: string; rows: CrmRow[] }>();
  if (weekdays) for (let i = 0; i < 7; i++) map.set(String(i), { label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]!, rows: [] });
  for (const row of rows) { const d = date(row[field]); if (!d) continue; const key = weekdays ? String((d.getDay() + 6) % 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; const point = map.get(key) ?? { label: new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(d), rows: [] }; point.rows.push(row); map.set(key, point); }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value }));
}
