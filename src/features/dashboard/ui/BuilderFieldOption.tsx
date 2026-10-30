import { fieldIcon } from "@/features/item";
import { localized, type Field } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import { numericField } from "../model/builder-fields";

export function builderFieldOption(field: Field, language: string) {
  return { value: field.slug, label: localized(field.labels, language, field.label), icon: <span className={`${numericField(field) ? "builder-chip-measure" : "builder-chip-dimension"} inline-grid size-5 shrink-0 place-items-center rounded`}><Icon as={fieldIcon(field.type)} size={14} /></span> };
}
