import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { startPointerDrag } from "@/shared/lib/pointer-drag";

/**
 * Ручка изменения ширины: у сайдбара — на правом краю, у drawer'а — на
 * левом. Один компонент, потому что разница между ними — знак.
 *
 * Во время перетаскивания ширина пишется прямо в стиль элемента, а
 * наружу отдаётся один раз, на отпускании: ширина персистится в
 * localStorage, и запись на каждое движение мыши — это запись 60 раз
 * в секунду.
 */
export function ResizeHandle({
  edge,
  target,
  value,
  min,
  max,
  label,
  onCommit,
  onDrag,
  controlled = false,
  onCancel,
}: {
  /** Какой край тянем. */
  edge: "left" | "right";
  target: RefObject<HTMLElement | null>;
  value: number;
  min: number;
  max: number;
  label: string;
  onCommit: (width: number) => void;
  /** Вызывается на каждое движение — для реакций вроде «сверни сайдбар». */
  onDrag?: (width: number) => void;
  /** A table controls its colgroup from React; do not write to the header. */
  controlled?: boolean;
  onCancel?: () => void;
}) {
  const clamp = (width: number) => Math.round(Math.min(max, Math.max(min, width)));
  const drag = useRef<ReturnType<typeof startPointerDrag> | null>(null);
  useEffect(() => () => drag.current?.dispose(), []);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    drag.current?.cancel();

    const box = el.getBoundingClientRect();
    const original = el.style.width;
    const widthAt = (clientX: number) =>
      clamp(box.width + (clientX - event.clientX) * (edge === "right" ? 1 : -1));
    drag.current = startPointerDrag(event.currentTarget, event, {
      cursor: "col-resize",
      preview: (move) => { const width = widthAt(move.clientX); if (!controlled) el.style.width = `${width}px`; onDrag?.(width); },
      commit: (up) => onCommit(widthAt(up.clientX)),
      cancel: () => { if (!controlled) el.style.width = original; onCancel?.(); },
    });
  };

  // Стрелками — тоже: тянуть мышью полосу шириной 6px может не каждый.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const towards = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!towards) return;
    event.preventDefault();
    onCommit(clamp(value + towards * 16 * (edge === "right" ? 1 : -1)));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      className={`group/resize absolute top-0 z-10 flex h-full w-2 touch-none cursor-col-resize items-center justify-center ${
        edge === "right" ? "right-0" : "left-0"
      }`}
    >
      {/* Видимая только при наведении «пилюля»: полоса во всю высоту
          читается как граница блока и спорит с разделителями таблицы. */}
      <span className="h-8 w-1 rounded-full bg-border-strong opacity-0 transition-opacity group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100" />
    </div>
  );
}
