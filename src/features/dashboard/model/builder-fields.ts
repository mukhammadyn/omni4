import { RAW_CHART_KINDS, splittable } from "@/features/item";
import type { Field } from "@/features/table";
import type { Widget } from "./dashboard";
import { isDateField } from "./widget-editor";

export type BuilderRole = "group" | "value" | "split" | "columns";
export const numericField = (field: Pick<Field, "type">) => ["NUMBER", "FLOAT", "FLOAT_NOLIMIT", "MONEY", "PROGRESS", "RATING", "INCREMENT_ID"].includes(field.type);
export function builderRoles(widget: Widget, sql: boolean): BuilderRole[] {
  if (widget.type === "records") return sql ? [] : ["columns"];
  if ((widget.type && widget.type !== "chart") || RAW_CHART_KINDS.has(widget.kind)) return [];
  return [...(widget.kind === "stat" ? [] : ["group" as const]), ...(!widget.measures?.length ? ["value" as const] : []), ...(widget.kind !== "stat" && splittable(widget.kind) && !widget.measures?.length ? ["split" as const] : [])];
}
/** Translate the field library into the existing widget contract; no separate builder state. */
export function assignBuilderField(widget: Widget, field: Field, role: BuilderRole, sql: boolean): Partial<Widget> | null {
  if (!builderRoles(widget, sql).includes(role)) return null;
  if (role === "columns") return { columns: [...new Set([...(widget.columns ?? []), field.slug])] };
  if (role === "value") return numericField(field) ? { valueSlug: field.slug, aggregation: "sum" } : null;
  if (role === "group") return { groupSlug: field.slug, ...(!sql ? { groupBucket: isDateField(field) ? "month" : "" } : {}) };
  return { splitSlug: field.slug, ...(!sql ? { splitBucket: isDateField(field) ? "month" : "" } : {}) };
}
