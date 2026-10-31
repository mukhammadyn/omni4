import type { Dataset, DatasetParameter } from "./datasets";

/** Only explicitly opted-in date parameters become shared dashboard controls. */
export function dashboardMonthParameters(datasets: Dataset[], datasetIds: Set<string>): DatasetParameter[] {
  const found = new Map<string, DatasetParameter>();
  for (const dataset of datasets) if (datasetIds.has(dataset.id) && dataset.source.kind === "sql") {
    for (const parameter of dataset.source.parameters) if (parameter.type === "date" && parameter.dashboardControl === "month") found.set(parameter.name, parameter);
  }
  return [...found.values()];
}

export const monthKey = (name: string) => `sql-month:${name}`;
export function validMonth(value: string | undefined): value is string {
  return Boolean(value && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value));
}
export function selectedMonth(value?: string, now = new Date()): string {
  return validMonth(value) ? value : now.toISOString().slice(0, 7);
}
export function shiftMonth(value: string, amount: -1 | 1): string {
  const [year, month] = value.split("-").map(Number) as [number, number];
  const index = (year - 1) * 12 + month - 1 + amount;
  return index < 0 || index >= 9999 * 12 ? value : `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}
