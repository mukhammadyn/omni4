export type SqlRecordOptions = {
  layout: "list" | "cards";
  columns?: number;
  photoField?: string;
  titleField?: string; subtitleField?: string; badgeField?: string; secondaryField?: string;
  groupField?: string; groupLabelField?: string; filterLabelField?: string;
  avatar?: boolean; groupFilter?: boolean; autoHeight?: boolean; calendarIcon?: boolean;
  emptyDatasetLabel?: string;
  emptyLabel?: string; allLabel?: string;
};
export function parseSqlRecordOptions(raw: unknown): SqlRecordOptions | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const value = raw as Record<string, unknown>;
  if (value.layout !== "list" && value.layout !== "cards") return;
  return { layout: value.layout, ...(typeof value.columns === "number" && Number.isFinite(value.columns) ? { columns: Math.max(1,Math.min(4,Math.round(value.columns))) } : {}),
    ...Object.fromEntries(["photoField", "titleField", "subtitleField", "badgeField", "secondaryField", "groupField", "groupLabelField", "filterLabelField", "emptyDatasetLabel", "emptyLabel", "allLabel"].flatMap(key => typeof value[key] === "string" ? [[key, value[key].slice(0,200)]] : [])),
    ...Object.fromEntries(["avatar", "groupFilter", "autoHeight", "calendarIcon"].flatMap(key => typeof value[key] === "boolean" ? [[key,value[key]]] : [])),
  };
}
