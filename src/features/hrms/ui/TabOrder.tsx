import { useLayoutEffect, useRef, useState } from "react";
import { GripVerticalIcon } from "lucide-react";
import type { TabItem } from "@/shared/ui/tabs";
import { Icon } from "@/shared/ui/icon";
import { moveId } from "../model/tab-order";

/**
 * Перетаскивание вкладок. Пока тянут, порядок уже пересчитан: на месте,
 * куда вкладка ляжет, — пустая ячейка её размера, соседи расступаются.
 * Сдвиг анимирован FLIP'ом: замер до и после, разница проигрывается
 * Web Animations API — без библиотеки.
 */
export function TabOrder({ tabs, onOrder }: { tabs: TabItem[]; onOrder: (ids: string[]) => void }) {
  const ids = tabs.map((tab) => tab.id);
  const [dragged, setDragged] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const shown = preview ?? ids;
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));

  const nodes = useRef(new Map<string, HTMLElement>());
  const rects = useRef(new Map<string, DOMRect>());
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useLayoutEffect(() => {
    nodes.current.forEach((node, id) => {
      const before = rects.current.get(id);
      const after = node.getBoundingClientRect();
      if (before && !reduce && (before.left !== after.left || before.top !== after.top))
        node.animate(
          [{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: "none" }],
          { duration: 180, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
      rects.current.set(id, after);
    });
  });

  /*
   * Переставляем, только когда курсор перешёл середину соседа в сторону
   * движения, — и по его КОНЕЧНОМУ месту (rects), а не по анимированному:
   * иначе уехавший сосед снова оказывался под курсором, и вкладки
   * прыгали туда-обратно.
   */
  const over = (target: string, x: number, y: number) => {
    if (!dragged || target === dragged) return;
    const rect = rects.current.get(target);
    if (!rect) return;
    if (y < rect.top || y > rect.bottom) return;
    const forward = shown.indexOf(target) > shown.indexOf(dragged);
    const middle = rect.left + rect.width / 2;
    if (forward ? x < middle : x > middle) return;
    const next = moveId(shown, dragged, target);
    if (next.join() !== shown.join()) setPreview(next);
  };
  const end = (commit: boolean) => {
    if (commit && preview) onOrder(preview);
    setDragged(null);
    setPreview(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1.5" onDragOver={(event) => event.preventDefault()} onDrop={() => end(true)}>
      {shown.map((id) => {
        const tab = byId.get(id);
        if (!tab) return null;
        const hole = id === dragged;
        return (
          <span
            key={id}
            ref={(node) => void (node ? nodes.current.set(id, node) : nodes.current.delete(id))}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              /* Кадром позже: браузер снимает картинку перетаскивания с ещё полной вкладки. */
              requestAnimationFrame(() => setDragged(id));
            }}
            onDragOver={(event) => over(id, event.clientX, event.clientY)}
            onDragEnd={() => end(false)}
            className={`inline-flex cursor-grab items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors active:cursor-grabbing ${
              hole ? "border-dashed border-border-strong bg-surface-soft [&>*]:invisible" : "border-border bg-surface hover:bg-surface-hover"
            }`}
          >
            <Icon as={GripVerticalIcon} size={14} className="text-fg-subtle" />
            {tab.label}
          </span>
        );
      })}
    </div>
  );
}
