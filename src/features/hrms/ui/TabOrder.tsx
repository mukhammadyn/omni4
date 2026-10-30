import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, GripVerticalIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TabItem } from "@/shared/ui/tabs";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { moveId } from "../model/tab-order";

/** Граница «панель | Больше» — такой же элемент списка, как вкладки: переносится тем же moveId. */
export const MORE = "__more__";

/**
 * «Порядок вкладок» окном: две колонки — «На панели» и «Больше». Внутри это
 * один список с MORE посередине: левее MORE — полоса, правее — меню.
 * Перенос между колонками — стрелкой у строки или перетаскиванием. Пока тянут, порядок уже пересчитан, соседи расступаются
 * FLIP'ом (Web Animations API, без библиотеки).
 */
export function TabOrder({
  tabs,
  ids,
  onOrder,
  onReset,
  onClose,
}: {
  tabs: TabItem[];
  /** Id вкладок с MORE между полосой и «Больше». */
  ids: string[];
  onOrder: (ids: string[]) => void;
  onReset?: (() => void) | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
      if (before && !reduce && before.top !== after.top)
        node.animate([{ transform: `translateY(${before.top - after.top}px)` }, { transform: "none" }], {
          duration: 180,
          easing: "cubic-bezier(.2,.7,.3,1)",
        });
      rects.current.set(id, after);
    });
  });

  /* Переставляем, когда курсор перешёл середину соседа по его КОНЕЧНОМУ месту — иначе вкладки прыгают туда-обратно. */
  const over = (target: string, y: number) => {
    if (!dragged || target === dragged) return;
    const rect = rects.current.get(target);
    if (!rect) return;
    const forward = shown.indexOf(target) > shown.indexOf(dragged);
    const middle = rect.top + rect.height / 2;
    if (forward ? y < middle : y > middle) return;
    const next = moveId(shown, dragged, target);
    if (next.join() !== shown.join()) setPreview(next);
  };
  /* Пустое место колонки: в конец полосы (перед MORE) или в конец «Больше». */
  const toEnd = (more: boolean) => {
    if (!dragged) return;
    const rest = shown.filter((id) => id !== dragged);
    const at = more ? rest.length : rest.indexOf(MORE);
    const next = [...rest.slice(0, at), dragged, ...rest.slice(at)];
    if (next.join() !== shown.join()) setPreview(next);
  };
  /* Стрелкой: с полосы — первой в «Больше», из «Больше» — последней на полосу. */
  const flip = (id: string) => {
    const rest = ids.filter((item) => item !== id);
    const at = rest.indexOf(MORE) + (ids.indexOf(id) < ids.indexOf(MORE) ? 1 : 0);
    onOrder([...rest.slice(0, at), id, ...rest.slice(at)]);
  };
  const end = (commit: boolean) => {
    if (commit && preview) onOrder(preview);
    setDragged(null);
    setPreview(null);
  };
  const ref = (id: string) => (node: HTMLElement | null) =>
    void (node ? nodes.current.set(id, node) : nodes.current.delete(id));
  const cut = shown.indexOf(MORE);

  const row = (id: string, more: boolean) => {
    const tab = byId.get(id);
    if (!tab) return null;
    const hole = id === dragged;
    const label = t(more ? "employee.toBar" : "employee.toMore");
    return (
      <div
        key={id}
        ref={ref(id)}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          /* Кадром позже: браузер снимает картинку перетаскивания с ещё полной вкладки. */
          requestAnimationFrame(() => setDragged(id));
        }}
        onDragOver={(event) => over(id, event.clientY)}
        onDragEnd={() => end(false)}
        className={`group flex h-8 cursor-grab items-center gap-1.5 rounded-md border pr-1 pl-1.5 text-sm transition-colors active:cursor-grabbing ${
          hole ? "border-dashed border-border-strong bg-surface-soft [&>*]:invisible" : "border-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <Icon as={GripVerticalIcon} size={14} className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={() => flip(id)}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-active hover:text-fg focus-visible:opacity-100"
        >
          <Icon as={more ? ArrowLeftIcon : ArrowRightIcon} size={14} />
        </button>
      </div>
    );
  };
  const column = (title: string, items: string[], more: boolean) => (
    <section className="flex min-h-0 min-w-0 flex-col gap-1">
      <p className="flex items-center justify-between px-1 pb-1 text-xs font-medium text-fg-subtle">
        {title}
        <span>{items.length + (more ? 0 : 1)}</span>
      </p>
      {!more && (
        <div className="flex h-8 items-center rounded-md border border-dashed border-border px-2.5 text-sm text-fg-muted">
          {t("employee.tab.personal")}
        </div>
      )}
      {items.map((id) => row(id, more))}
      <div
        onDragOver={() => toEnd(more)}
        className={`grid min-h-10 flex-1 place-items-center rounded-md px-2 text-center text-xs text-fg-subtle ${
          items.length ? "" : "border border-dashed border-border"
        }`}
      >
        {!items.length && t(more ? "employee.dropToMore" : "employee.dropToBar")}
      </div>
    </section>
  );

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{t("employee.arrangeTabs")}</h2>
          <button
            type="button"
            aria-label={t("action.close")}
            onClick={onClose}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Icon as={XIcon} size={16} />
          </button>
        </header>

        <div
          className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-4 max-sm:grid-cols-1"
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => end(true)}
        >
          {column(t("employee.tabsOnBar"), shown.slice(0, cut), false)}
          {column(t("employee.more"), shown.slice(cut + 1), true)}
        </div>

        <footer className="flex justify-between gap-2 border-t border-border px-4 py-3">
          {onReset ? (
            <Button variant="secondary" onClick={onReset}>
              {t("employee.resetTabOrder")}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>{t("employee.done")}</Button>
        </footer>
      </div>
    </Modal>
  );
}
