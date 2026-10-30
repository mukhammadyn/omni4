import type { Field } from "@/features/table";
export type FieldPresentation = Record<string, { label?: string; description?: string; hidden?: boolean }>;
export function parseFieldPresentation(value: unknown): FieldPresentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["__proto__", "prototype", "constructor"].includes(key)).flatMap(([key, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const v = raw as Record<string, unknown>;
    return [[key, { ...(typeof v.label === "string" ? { label: v.label.slice(0, 200) } : {}), ...(typeof v.description === "string" ? { description: v.description.slice(0, 1000) } : {}), ...(typeof v.hidden === "boolean" ? { hidden: v.hidden } : {}) }]];
  }));
}
/** Presentation never creates a field or changes its type/permissions. */
export function presentFields(fields: Field[], presentation?: FieldPresentation): Field[] {
  return fields.map((field) => presentation?.[field.slug]?.label?.trim() ? { ...field, label: presentation[field.slug]!.label!.trim(), labels: {} } : field);
}
