import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownFromLineIcon,
  ArrowRightFromLineIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  FoldVerticalIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  UnfoldVerticalIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChipColor } from "@/shared/ui/chip";
import { Tabs } from "@/shared/ui/tabs";
import { ToolButton } from "@/shared/ui/tool-button";
import { collapsedFrom, countBelow, type OrgNode } from "../model/org-tree";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Цвет кромки — тот же токен, что у подложки чипа: читается в обеих темах. */
export const edgeStyle = (color: ChipColor) =>
  ({ "--edge": `var(--color-chip-${color}-bg)` }) as CSSProperties;

/**
 * Холст оргструктуры — `drawOrg` прототипа (employees.html): дерево
 * карточек с линиями, сверху вниз или слева направо, зум, перетаскивание,
 * «по размеру экрана», свернуть и развернуть всё.
 *
 * Что внутри карточки и что за дерево — решает вызывающий: холст знает
 * только узлы и их детей (model/org-tree). Поэтому он один на деревья
 * сотрудников, отделов и юрлиц.
 *
 * Масштаб — CSS `zoom`, а не `transform: scale`: `zoom` меняет размер
 * в раскладке, и прокрутка с полосами продолжают совпадать с тем, что
 * видно. У `scale` содержимое уменьшается, а прокручиваемая область —
 * нет. Перетаскивание — та же прокрутка контейнера.
 */
export function OrgChart<T>({
  roots,
  renderNode,
  colorOf,
  onOpen,
  collapseFrom,
  autoFit = false,
  toolbar,
  legend,
}: {
  roots: OrgNode<T>[];
  /** Содержимое карточки узла. Рамку, кромку и кнопку свёртки рисует холст. */
  renderNode: (node: OrgNode<T>) => ReactNode;
  colorOf: (node: OrgNode<T>) => ChipColor;
  /** Щелчок по карточке. Нет — карточка не нажимается. */
  onOpen?: ((node: OrgNode<T>) => void) | undefined;
  /** С какой глубины узлы свёрнуты сразу. Нет — всё раскрыто. */
  collapseFrom?: number | undefined;
  /** Вписать дерево в экран при открытии, а не показать в натуральную величину. */
  autoFit?: boolean;
  /** Слева в полосе над холстом — переключатель дерева и подсказка. */
  toolbar?: ReactNode;
  /** Внизу слева поверх холста — что значат цвета. */
  legend?: ReactNode;
}) {
  const { t } = useTranslation();
  const [closed, setClosed] = useState(() =>
    collapseFrom === undefined ? new Set<string>() : collapsedFrom(roots, collapseFrom),
  );
  const [horizontal, setHorizontal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /*
   * Масштаб живёт и в состоянии (им рисуется), и в ссылке: прокрутку
   * нужно пересчитать в том же кадре, что и масштаб, а состояние
   * доедет только к следующему рендеру. Поэтому `zoom` ставится
   * на элемент сразу, руками, — и сразу же сдвигается прокрутка.
   */
  const zoomNow = useRef(1);
  const applyZoom = (next: number) => {
    if (content.current) content.current.style.zoom = String(next);
    zoomNow.current = next;
    setZoom(next);
  };

  /*
   * Масштаб «во весь экран». `offsetWidth` у элемента с `zoom` —
   * натуральный размер, без масштаба: ответ от текущего зума не зависит,
   * и повторный вызов (StrictMode зовёт эффекты дважды) не уменьшает
   * дерево ещё раз.
   */
  const fitZoom = (floor = MIN_ZOOM) => {
    const box = canvas.current;
    const tree = content.current;
    if (!box || !tree?.offsetWidth) return 1;
    return clamp(
      Math.max(
        floor,
        Math.min(
          1,
          (box.clientWidth - 40) / tree.offsetWidth,
          (box.clientHeight - 40) / tree.offsetHeight,
        ),
      ),
    );
  };

  /* Встать на корень: сверху по центру, а у горизонтального — слева по середине. */
  const place = (next: number) => {
    const box = canvas.current;
    if (!box) return;
    applyZoom(next);
    box.scrollLeft = horizontal ? 0 : (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = horizontal ? (box.scrollHeight - box.clientHeight) / 2 : 0;
  };

  /*
   * Масштаб вокруг точки: что было под курсором (или в центре экрана),
   * там и остаётся. Иначе зум уводил бы ветку, к которой подошли, за край.
   */
  const zoomTo = (target: number, at?: { x: number; y: number }) => {
    const box = canvas.current;
    const before = zoomNow.current;
    const next = clamp(target);
    if (!box || next === before) return;
    const x = at?.x ?? box.clientWidth / 2;
    const y = at?.y ?? box.clientHeight / 2;
    const pointX = (box.scrollLeft + x) / before;
    const pointY = (box.scrollTop + y) / before;
    applyZoom(next);
    box.scrollLeft = pointX * next - x;
    box.scrollTop = pointY * next - y;
  };

  /* Открылось или сменилось направление — встать на корень; широкое дерево вписать. */
  useLayoutEffect(() => {
    place(autoFit ? fitZoom(0.42) : 1);
  }, [horizontal]);

  /* Ctrl/⌘ + колесо — масштаб под курсором, как в прототипе. Без модификатора — прокрутка. */
  useLayoutEffect(() => {
    const box = canvas.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomTo(zoomNow.current - event.deltaY * 0.002, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = canvas.current;
    if (!box || event.button !== 0 || (event.target as Element).closest("[data-org-node]")) return;
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = canvas.current;
    if (!box || !drag.current) return;
    box.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    box.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const renderTree = (node: OrgNode<T>): ReactNode => {
    const shut = closed.has(node.id);

    return (
      <li key={node.id}>
        <div
          data-org-node
          style={edgeStyle(colorOf(node))}
          {...(onOpen
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => onOpen(node),
                onKeyDown: (event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(node);
                  }
                },
              }
            : {})}
          className={`relative w-52.5 shrink-0 rounded-[8px] border border-border bg-surface px-2.5 pt-2.5 pb-3 text-left shadow-raised transition-shadow ${
            horizontal ? "border-l-3 border-l-(--edge)" : "border-t-3 border-t-(--edge)"
          } ${onOpen ? "cursor-pointer hover:shadow-popover" : ""}`}
        >
          {renderNode(node)}

          {node.kids.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id);
              }}
              title={t(shut ? "org.expand" : "org.collapse")}
              aria-label={t(shut ? "org.expand" : "org.collapse")}
              aria-expanded={!shut}
              className={`absolute z-2 grid h-5.5 min-w-5.5 place-items-center rounded-full border border-border-strong bg-surface px-1.5 text-[11px] font-semibold text-fg-muted hover:bg-surface-hover ${
                horizontal ? "top-1/2 -right-3 -translate-y-1/2" : "-bottom-3 left-1/2 -translate-x-1/2"
              }`}
            >
              {shut ? `+${countBelow(node)}` : horizontal ? <ChevronLeftIcon size={13} /> : <ChevronUpIcon size={13} />}
            </button>
          )}
        </div>

        {node.kids.length > 0 && !shut && <ul>{node.kids.map(renderTree)}</ul>}
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 pt-2.5 pb-2">
        {toolbar}
        <span className="flex-1" />
        <Tabs
          variant="segment"
          activeId={horizontal ? "h" : "v"}
          onSelect={(id) => setHorizontal(id === "h")}
          tabs={[
            { id: "v", label: t("org.vertical"), icon: ArrowDownFromLineIcon },
            { id: "h", label: t("org.horizontal"), icon: ArrowRightFromLineIcon },
          ]}
        />
      </div>

      <div className="relative mb-2.5 min-h-105 flex-1">
        <div
          ref={canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute inset-0 cursor-grab overflow-auto rounded-[8px] bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[18px_18px] active:cursor-grabbing"
        >
          <div ref={content} style={{ zoom }} className="mx-auto w-max px-15 pt-10 pb-20">
            <ul className={`org-tree ${horizontal ? "h" : ""}`}>{roots.map(renderTree)}</ul>
          </div>
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-0.5 rounded-[8px] bg-surface p-1 shadow-popover">
          <ToolButton icon={PlusIcon} label={t("org.zoomIn")} onClick={() => zoomTo(zoomNow.current + 0.15)} />
          <ToolButton icon={MinusIcon} label={t("org.zoomOut")} onClick={() => zoomTo(zoomNow.current - 0.15)} />
          <ToolButton icon={MaximizeIcon} label={t("org.fit")} onClick={() => place(fitZoom())} />
          <span className="mx-1 my-0.5 h-px bg-border" />
          <ToolButton
            icon={FoldVerticalIcon}
            label={t("org.collapseAll")}
            onClick={() => setClosed(collapsedFrom(roots, 1))}
          />
          <ToolButton icon={UnfoldVerticalIcon} label={t("org.expandAll")} onClick={() => setClosed(new Set())} />
        </div>

        {legend && (
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-90px)] flex-wrap gap-2.5 rounded-[8px] bg-surface px-2.5 py-1.5 text-xs text-fg-muted shadow-raised">
            {legend}
          </div>
        )}
      </div>
    </div>
  );
}

/** Строка легенды: квадратик цвета и подпись. */
export function OrgLegendItem({ color, label }: { color: ChipColor; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i style={edgeStyle(color)} className="size-2 rounded-[2px] bg-(--edge)" />
      {label}
    </span>
  );
}
