import type { Field } from "@/features/table";
import { cellKind } from "./cell-kind";

/**
 * Колонка-картинка (фото сотрудника, логотип) отдельно не стоит: её
 * значение — аватар слева от ближайшей текстовой колонки, как в прототипе
 * («Имя» с аватаром). Ближайшая — по месту в списке; при равенстве правая:
 * фото обычно стоит перед именем. Текстовой нет — колонка остаётся как есть.
 * Одной текстовой — одна картинка.
 */
export function mergeImageColumns(columns: Field[]): { columns: Field[]; imageOf: Map<string, Field> } {
  const imageOf = new Map<string, Field>();
  const absorbed = new Set<string>();
  columns.forEach((field, at) => {
    if (cellKind(field.type) !== "image") return;
    const host = columns
      .map((other, index) => ({ other, distance: Math.abs(index - at), right: index > at }))
      .filter(({ other }) => cellKind(other.type) === "text" && !imageOf.has(other.id))
      .sort((a, b) => a.distance - b.distance || Number(b.right) - Number(a.right))[0]?.other;
    if (!host) return;
    imageOf.set(host.id, field);
    absorbed.add(field.id);
  });
  return { columns: columns.filter((field) => !absorbed.has(field.id)), imageOf };
}
