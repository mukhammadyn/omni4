import { Icon } from "@/shared/ui/icon";
import { type LucideIcon } from "lucide-react";

/**
 * Кнопка-иконка в строке над таблицей: фильтр, сортировка, поиск,
 * настройки view.
 *
 * Две независимые подсветки, и это не украшение.
 *
 *   open — панель раскрыта: подложка. Она говорит «вот куда ты смотришь».
 *   on   — отбор задан: цвет самой иконки. Он говорит «список неполный».
 *
 * Складывать их в одно «активно» нельзя: закрытая панель с заданным
 * фильтром выглядела бы раскрытой, а раскрытая пустая — как будто
 * что-то отфильтровано.
 */
export function ToolButton({
  icon,
  label,
  open = false,
  on = false,
  spin = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  open?: boolean;
  on?: boolean;
  /** Действие уже выполняется: значок крутится, повторный щелчок не нужен. */
  spin?: boolean;
  onClick: () => void;
}) {
  const color = on ? "text-accent-text" : open ? "text-fg" : "text-fg-muted hover:text-fg";

  /* Размеры — `.va-btn` прототипа (docs/REDESIGN.md): 28px, поля 7px,
     радиус 5. Раскрытую панель отмечает нейтральная подложка наведения,
     а не цветная: цвет остаётся за «отбор задан» (`on`). */

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={spin}
      aria-label={label}
      aria-pressed={open}
      title={label}
      className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-[5px] px-1.5 transition-colors ${color} ${
        open ? "bg-surface-hover" : "hover:bg-surface-hover"
      }`}
    >
      <Icon as={icon} size={16} className={spin ? "animate-spin" : ""} />
    </button>
  );
}
