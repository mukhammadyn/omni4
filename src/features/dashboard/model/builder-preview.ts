/** Ephemeral schema preview limit; never changes a saved widget's page size. */
export function builderPreviewLimit(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) && String(value).trim() ? Math.max(1, Math.min(1000, Math.round(parsed))) : 10;
}
