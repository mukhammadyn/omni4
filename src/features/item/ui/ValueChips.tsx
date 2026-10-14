import { useMemo } from "react";
import { localized, type Field, type Relation } from "@/features/table";
import { CHIP_HEX, hexToChipColor } from "@/shared/ui/chip";
import { useItems } from "../api/items";
import { NO_GROUP, boardColumns, colorOf, sortOrderOf } from "../model/board";
import type { Filters } from "../model/query";
import { valueLabelOf } from "../model/relation";

/**
 * Полоса значений поля над списком — `.vt-stats` прототипа
 * (candidates.html: этапы над «Активными»). Чип — значение, точка его
 * цвета и сколько строк с ним; нажатие кладёт значение в отбор
 * человека, повторное — убирает.
 *
 * Считается из самих строк, одним запросом: связанная запись приезжает
 * рядом со ссылкой (`<поле>_data`) с подписью, цветом и номером, и
 * раскладка по значениям — та же, что у колонок доски (boardColumns).
 * Отдельной ручки «посчитай по значениям с фильтром» у бэкенда нет
 * (docs/backend-notes.md, «Группировка»).
 *
 * Значения с одной подписью склеиваются в один чип: этапы заведены
 * у каждой воронки свои, и «Скрининг» четырёх воронок — это для
 * человека один этап, а не четыре одинаковых кружка.
 */

/**
 * ponytail: потолок строк, а не страницы. Полоса нужна над рабочим
 * списком (активные кандидаты), а не над архивом; за потолком числа
 * занижаются. Станет мало — просить у бэкенда count с GROUP BY и WHERE.
 */
const LIMIT = 500;

type ValueChip = { label: string; ids: string[]; count: number; color: string | undefined };

export function ValueChips({
  tableSlug,
  field,
  relations,
  language,
  filters,
  search,
  selected,
  onChange,
  className = "",
}: {
  tableSlug: string;
  field: Field;
  relations: Relation[];
  /** Язык ДАННЫХ: подписи вариантов и полей показа. */
  language: string;
  /**
   * Отбор без условия самого поля: иначе после первого нажатия
   * остальные чипы исчезли бы, и выбрать второй было бы не из чего.
   */
  filters: Filters;
  search: string;
  /** Выбранные значения — из отбора человека по этому полю. */
  selected: string[];
  onChange: (values: string[]) => void;
  /** Обёртка полосы: её нет вовсе, когда чипов нет, — и линии под ней тоже. */
  className?: string;
}) {
  const { page } = useItems(tableSlug, { limit: LIMIT, page: 1, filters, search });

  const chips = useMemo(() => {
    const columns = boardColumns({
      rows: page.rows,
      slug: field.slug,
      tabs: [...field.options.values()].map((option) => ({
        id: option.value,
        label: localized(option.labels, language, option.label || option.value),
      })),
      unassigned: "",
      labelOf: valueLabelOf(field, relations, language),
      orderOf: (row) => sortOrderOf(row, field.slug),
      colorOf: (row) => colorOf(row, field.slug),
    });

    const byLabel = new Map<string, ValueChip>();
    for (const column of columns) {
      if (column.id === NO_GROUP || !column.rows.length) continue;

      const color = field.options.get(column.id)?.color ?? column.color;
      const chip = byLabel.get(column.label);
      if (chip) {
        chip.ids.push(column.id);
        chip.count += column.rows.length;
      } else {
        byLabel.set(column.label, {
          label: column.label,
          ids: [column.id],
          count: column.rows.length,
          color: color ?? undefined,
        });
      }
    }
    return [...byLabel.values()];
  }, [page.rows, field, relations, language]);

  if (!chips.length) return null;

  const chosen = new Set(selected);

  return (
    <div className={`flex flex-wrap items-center gap-0.5 ${className}`}>
      {chips.map((chip) => {
        const on = chip.ids.some((id) => chosen.has(id));

        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on
                  ? selected.filter((id) => !chip.ids.includes(id))
                  : [...selected, ...chip.ids],
              )
            }
            className={`inline-flex h-6.5 items-center gap-1.5 rounded-full px-2 text-xs transition-colors ${
              on
                ? "bg-accent-subtle text-accent ring-1 ring-accent/35 ring-inset"
                : "text-fg-muted hover:bg-surface-hover"
            }`}
          >
            {/* Палитрой, а не CHIP_DOT: тот в тёмной теме белый, и все точки
                сливались бы в одну (как у EmployeeAbsences). */}
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: CHIP_HEX[chip.color ? hexToChipColor(chip.color) : "gray"] }}
            />
            {chip.label}
            <b className="font-semibold text-fg tabular-nums">{chip.count}</b>
          </button>
        );
      })}
    </div>
  );
}
