import type { ComponentProps } from "react";

/**
 * Цвета и размеры — только токенами из app/styles.css. Вид — `.btn`
 * прототипа (docs/REDESIGN.md, шаг 3).
 *
 * primary заливается не самим брендом, а его цветом наведения: белый
 * текст на #2383e2 даёт 3.88:1 при нужных 4.5:1, на #0077d4 — 4.58:1.
 * Бренд при этом остаётся брендом — в фокусе, активном состоянии и акцентах.
 *
 * ghost приглушён, как `.btn.ghost`: это «Отмена» рядом с основной, и
 * спорить с ней за взгляд она не должна. danger обведён сам — раньше
 * рамку дописывали руками, и у половины кнопок удаления её не было.
 */
const variants = {
  primary: "bg-accent-solid text-accent-fg hover:bg-accent-solid-hover",
  secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg",
  danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger-subtle",
} as const;

const sizes = {
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-(--spacing-control) px-3 text-sm gap-1.5",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      {...props}
      /* Подпись кнопки не переносится: в тесной строке «Новый ключ»
         иначе встаёт в две строки и кнопка вырастает вдвое. */
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}
