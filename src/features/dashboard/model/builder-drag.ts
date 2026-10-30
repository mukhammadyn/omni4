import type { Field } from "@/features/table";
import type { Widget } from "./dashboard";
import { assignBuilderField, builderRoles, type BuilderRole } from "./builder-fields";

export const BUILDER_FIELD_MIME = "application/x-omni4-field";
type DragEvent = {
  dataTransfer: Pick<DataTransfer, "types" | "getData" | "setData" | "effectAllowed" | "dropEffect">;
  preventDefault: () => void;
  stopPropagation: () => void;
};
const sourceKey = (widget: Widget, sql: boolean) => JSON.stringify([sql ? "sql" : "table", widget.datasetId ?? "", widget.tableSlug]);
export function fieldRole(widget: Widget, field: Field, preferred: BuilderRole | undefined, sql: boolean): BuilderRole | undefined {
  return builderRoles(widget, sql).find((role) => role === preferred && Boolean(assignBuilderField(widget, field, role, sql)))
    ?? builderRoles(widget, sql).find((role) => Boolean(assignBuilderField(widget, field, role, sql)));
}
export function startFieldDrag(event: DragEvent, widget: Widget, field: Field, sql: boolean) {
  if (!fieldRole(widget, field, undefined, sql)) { event.preventDefault(); return; }
  event.stopPropagation();
  event.dataTransfer.setData(BUILDER_FIELD_MIME, JSON.stringify({ version: 1, source: sourceKey(widget, sql), field: field.slug }));
  event.dataTransfer.effectAllowed = "copy";
}
export function overFieldSlot(event: DragEvent, widget: Widget, role: BuilderRole, sql: boolean) {
  // Browsers protect payload contents until drop. Only the MIME type is available here.
  if (!event.dataTransfer.types.includes(BUILDER_FIELD_MIME) || !builderRoles(widget, sql).includes(role)) return;
  event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy";
}
export function dropField(event: DragEvent, widget: Widget, fields: Field[], role: BuilderRole, sql: boolean, onChange: (patch: Partial<Widget>) => void) {
  if (!event.dataTransfer.types.includes(BUILDER_FIELD_MIME)) return;
  event.preventDefault(); event.stopPropagation();
  try {
    const payload: unknown = JSON.parse(event.dataTransfer.getData(BUILDER_FIELD_MIME));
    if (!payload || typeof payload !== "object" || !("version" in payload) || payload.version !== 1 || !("source" in payload) || payload.source !== sourceKey(widget, sql) || !("field" in payload) || typeof payload.field !== "string") return;
    const field = fields.find((item) => item.slug === payload.field);
    const patch = field && assignBuilderField(widget, field, role, sql);
    if (patch) onChange(patch);
  } catch { /* External or stale payloads never mutate the draft. */ }
}
