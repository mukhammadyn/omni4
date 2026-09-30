import { type LucideIcon, type LucideProps } from "lucide-react";

/**
 * Обёртка над Lucide — теми же иконками, что в прототипе omni4
 * (docs/REDESIGN.md). Задаёт наш размер и толщину линии в одном месте:
 * 16px и 1.8, как `svg.lucide` прототипа, вместо родных 24px и 2.
 *
 * Импортировать иконки поимённо и с суффиксом
 * (`import { PlusIcon } from "lucide-react"`): пакет древовидно
 * вытряхивается, а короткие имена (`Link`, `File`, `Image`, `Infinity`)
 * совпадают с компонентом роутера и глобальными именами браузера.
 */
export function Icon({
  as: Component,
  size = 16,
  className = "",
  ...props
}: LucideProps & { as: LucideIcon; size?: number }) {
  return (
    <Component
      size={size}
      strokeWidth={1.8}
      className={`shrink-0 ${className}`}
      aria-hidden
      {...props}
    />
  );
}
