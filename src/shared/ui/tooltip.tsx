import { useEffect, useLayoutEffect, useRef, useState, isValidElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Подсказка по наведению.
 *
 * Своя, а не браузерный `title`: тот появляется через секунду с лишним,
 * рисуется системным шрифтом мимо темы, не открывается с клавиатуры
 * и не умеет ничего, кроме одной строки. На доске, в календаре и на
 * таймлайне подсказка — рабочий инструмент: ею подписаны дни оси,
 * колонки карточки и даты события, и выглядеть она должна как часть
 * интерфейса.
 *
 * Обёртка не занимает места (`display: contents`) — разметку вокруг
 * можно не трогать: ни сетка, ни flex не узнают, что элемент завёрнут.
 * Мерить при этом приходится ребёнка: у элемента без бокса своего
 * прямоугольника нет.
 */

/** Через сколько появляется. Меньше — мигает при проходе курсора мимо. */
const DELAY = 300;

/** Зазор между подсказкой и тем, к чему она относится. */
const GAP = 6;
let activeTooltip: { hide: () => void } | null = null;

export function Tooltip({
  label,
  children,
  placement = "top",
  as = "span",
}: {
  /** Пусто — подсказки нет вовсе: обёртка становится прозрачной. */
  label: ReactNode;
  children: ReactNode;
  /** Сверху по умолчанию; снизу — когда сверху мешает липкая шапка. */
  placement?: "top" | "bottom";
  /** SVG marks need an SVG group, not an HTML span inside an SVG. */
  as?: "span" | "g";
}) {
  const anchor = useRef<Element | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const owner = useRef({ hide: () => {} });

  /** Прямоугольник того, к чему привязана подсказка. null — скрыта. */
  const [at, setAt] = useState<DOMRect | null>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  const hide = () => {
    window.clearTimeout(timer.current);
    if (activeTooltip === owner.current) activeTooltip = null;
    setAt(null);
    setPlaced(null);
  };
  owner.current.hide = hide;

  const show = () => {
    if (!label) return;
    if (activeTooltip !== owner.current) activeTooltip?.hide();
    activeTooltip = owner.current;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      /* Ребёнок, а не сама обёртка: у элемента с display: contents
         прямоугольник нулевой. */
      const target = anchor.current?.firstElementChild;
      if (target) setAt(target.getBoundingClientRect());
    }, DELAY);
  };

  useEffect(() => { const identity = owner.current; return () => {
    window.clearTimeout(timer.current);
    if (activeTooltip === identity) activeTooltip = null;
  }; }, []);

  /*
   * Место считается после отрисовки: ширина зависит от текста. Слоем,
   * а не сдвигом трансформом — так подсказка не размывается на дробных
   * координатах.
   */
  useLayoutEffect(() => {
    const element = box.current;
    if (!at || !element) return;

    const size = element.getBoundingClientRect();
    const above = placement === "top" ? at.top - size.height - GAP : at.bottom + GAP;
    const below = placement === "top" ? at.bottom + GAP : at.top - size.height - GAP;

    setPlaced({
      left: clamp(at.left + at.width / 2 - size.width / 2, GAP, window.innerWidth - size.width - GAP),
      // Не поместилось с той стороны, куда просили, — становимся с другой.
      top: clamp(above >= GAP && above + size.height <= window.innerHeight - GAP ? above : below, GAP, window.innerHeight - size.height - GAP),
    });
  }, [at, placement]);

  /* Уехало из-под курсора — подсказка врёт: прокрутка её закрывает. */
  useEffect(() => {
    if (!at) return;

    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [at]);

  const Anchor = as;
  return (
    <>
      <Anchor
        ref={(element: Element | null) => { anchor.current = element; }}
        data-tooltip-anchor
        tabIndex={as === "g" && !(isValidElement<{ tabIndex?: number }>(children) && children.props.tabIndex !== undefined) ? 0 : undefined}
        aria-label={as === "g" && typeof label === "string" ? label : undefined}
        style={as === "span" ? { display: "contents" } : undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        /* Нажали — значит уже не читают: подсказка поверх перетаскиваемой
           карточки только мешает. */
        onPointerDown={as === "g" ? undefined : hide}
        /* С клавиатуры — тоже: фокус всплывает, и отдельного обработчика
           на каждую кнопку не нужно. */
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Anchor>

      {at &&
        createPortal(
          <div
            ref={box}
            role="tooltip"
            className="text-2xs pointer-events-none fixed z-60 max-w-64 rounded-md bg-fg px-2 py-1 font-medium text-bg shadow-popover"
            style={{
              left: placed?.left ?? at.left,
              top: placed?.top ?? at.top,
              // До замера уже в DOM, но показывать на черновом месте нельзя.
              opacity: placed ? 1 : 0,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
