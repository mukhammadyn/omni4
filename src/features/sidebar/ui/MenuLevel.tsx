import { type DragEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useUi } from "@/shared/lib/ui-store";
import { useMenuChildren } from "../api/menus";
import type { MenuNode } from "../model/types";
import { positionIn, useDnd } from "./dnd-context";
import { Chevron, MenuIcon } from "./MenuIcon";
import { MenuRowActions } from "./MenuRowActions";

/**
 * Обёртка строки: держит перетаскивание, наведение и кнопку действий.
 * Подсветка живёт здесь, а не на ссылке, иначе активный пункт окрашен
 * не целиком — место под «⋮» остаётся незакрашенным.
 *
 * has-[.row-active] ловит класс, который роутер вешает на активную ссылку.
 *
 * `.sb-item` прототипа (docs/REDESIGN.md, 4.2): 28px, приглушённый
 * полужирный текст; выбранный — подложкой `surface-active` и основным
 * цветом, без белой плашки с тенью.
 */
const row =
  "group/row relative flex h-7 w-full items-center rounded-md pr-1 transition-colors hover:bg-surface-hover has-[.row-active]:bg-surface-active";

/**
 * Папка — заголовок группы, как `.sb-section-label` прототипа: 22px,
 * 11.5px полужирным бледным, без значка, стрелка справа. Пункты под ней
 * идут без отступа: группа — подпись над ними, а не ветка дерева.
 *
 * Размеры — из ДЕЙСТВУЮЩИХ правил прототипа: у него два набора для
 * сайдбара, и второй, плотный (22 / 28 / 6), перекрывает первый.
 */
const groupRow =
  "group/row relative flex h-5.5 w-full items-center rounded-md pr-1 transition-colors hover:bg-surface-hover";
const groupInner =
  "flex h-5.5 min-w-0 flex-1 items-center gap-1 rounded-md text-left text-[11.5px] font-semibold text-fg-subtle";

/** Сама ссылка или кнопка раскрытия — занимает всю строку, кроме «⋮». */
const inner_row =
  "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-medium text-fg-muted";

/** Активный пункт: класс ловится обёрткой через has-[]. */
const activeRow = "row-active text-fg";

/**
 * Один уровень меню. Бэкенд отдаёт меню по одному уровню за запрос
 * (parent_id обязателен), поэтому уровень — это и компонент, и единица
 * загрузки: запрос уходит, когда папку раскрыли.
 *
 * path — id от корня до родителя этого уровня включительно. Он же задаёт
 * и отступ (длина), и родителя (последний элемент), и защиту от переноса
 * папки внутрь собственного потомка.
 */
export function MenuLevel({ items, path }: { items: MenuNode[]; path: string[] }) {
  return (
    /* Пункты — встык, как `.sb-item` прототипа (margin 0). */
    <ul className="flex flex-col">
      {items.map((node, index) => (
        /* Над группой — воздух, как `.sb-section` прототипа (6px), кроме
           первой: над ней и так заголовок «Меню». */
        <li key={node.id} className={node.kind === "group" && index > 0 ? "mt-1.5" : ""}>
          <MenuRow node={node} siblings={items} path={path} />
        </li>
      ))}
    </ul>
  );
}

function MenuRow({
  node,
  siblings,
  path,
}: {
  node: MenuNode;
  siblings: MenuNode[];
  path: string[];
}) {
  const parentId = path[path.length - 1] ?? "";
  const depth = path.length - 1;
  const dnd = useDnd();
  const expandable = node.kind === "group";
  /*
   * Раскрытие переживает перезагрузку — оно в ui-store (см. expandedMenus).
   * Подписка селектором, а не всем стором: строк меню на экране десятки,
   * и правка ширины сайдбара перерисовывала бы каждую.
   */
  const open = useUi((state) => state.expandedMenus.includes(node.id));
  const toggleMenu = useUi((state) => state.toggleMenu);

  // Запрос уходит только когда папку раскрыли.
  const children = useMenuChildren(node.id, expandable && open);

  const dragging = dnd.source?.node.id === node.id;
  const hit = dnd.target?.id === node.id ? dnd.target.position : null;

  // Обработчики перетаскивания живут на обёртке, а не на ссылке: внутри
  // строки есть вторая кнопка, и тащить нужно строку целиком.
  // Без права `menu_drag` их нет вовсе: строка, которая тащится, но
  // никуда не встаёт, хуже неподвижной. Пункт omni4 не тащится, но
  // принимает: свой пункт в системную папку положить можно.
  const dragHandlers = !dnd.enabled
    ? {}
    : {
        draggable: !node.isProtected,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          if (node.isProtected) {
            event.preventDefault();
            return;
          }
          dnd.start({ node, parentId });
          event.dataTransfer.effectAllowed = "move";
          // Без данных Firefox не начинает перетаскивание.
          event.dataTransfer.setData("text/plain", node.id);
          // Призрак — сама строка целиком, взятая под курсором.
          event.dataTransfer.setDragImage(event.currentTarget, 12, 16);
        },
        onDragEnd: dnd.end,
        onDragOver: (event: DragEvent<HTMLElement>) => {
          // Без preventDefault браузер показывает «сюда нельзя» — а подсветка
          // не зажигается, и рамка не обещает переноса, которого не будет.
          if (!dnd.source || dnd.source.node.id === node.id) return;
          if (path.includes(dnd.source.node.id)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          dnd.hover({ id: node.id, position: positionIn(event, expandable) });
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          event.stopPropagation();
          dnd.drop({
            target: node,
            position: positionIn(event, expandable),
            targetSiblings: siblings,
            targetParentId: parentId,
            targetPath: path,
            ...(open ? { insideSiblings: children.items } : {}),
          });
        },
      };

  /* Отступ вложенности инлайном: Tailwind не собирает классы из строк.
     Первый уровень папок сдвига не даёт — он заголовок группы; сдвиг
     начинается с папки внутри папки. */
  const style = { paddingLeft: `${8 + Math.max(0, depth - 1) * 14}px` };

  const inner = expandable ? (
    <>
      {/* Значок у группы — только если его задали (эмодзи из формы
          пункта). Без него папка — чистый заголовок, как у прототипа. */}
      {node.icon && (
        <span className="grid size-5 shrink-0 place-items-center">
          <MenuIcon name={node.icon} type={node.type} />
        </span>
      )}
      <span className="flex-1 truncate">{node.label}</span>
      <Chevron open={open} />
    </>
  ) : (
    <>
      {/* Слот значка 20px и бледный значок — `.sb-item .emoji` и
          `.sb-item svg` прототипа. */}
      <span className="grid size-5 shrink-0 place-items-center text-fg-subtle">
        <MenuIcon name={node.icon} type={node.type} />
      </span>
      <span className="flex-1 truncate">{node.label}</span>
    </>
  );

  // draggable={false} обязателен: ссылки перетаскиваются браузером сами,
  // и вместо строки меню он тащит URL — с собственным призраком поверх
  // нашего. Тащит только обёртка.
  const navigable = expandable ? (
    <button
      type="button"
      onClick={() => toggleMenu(node.id)}
      aria-expanded={open}
      className={groupInner}
      style={style}
    >
      {inner}
    </button>
  ) : node.kind === "link" && node.href ? (
    <a
      href={node.href}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      className={inner_row}
      style={style}
    >
      {inner}
    </a>
  ) : (
    <Link
      to="/m/$menuId"
      params={{ menuId: node.id }}
      draggable={false}
      className={inner_row}
      style={style}
      activeProps={{ className: `${inner_row} ${activeRow}` }}
    >
      {inner}
    </Link>
  );

  return (
    <>
      <div
        className={`${expandable ? groupRow : row} ${dragging ? "opacity-40" : ""} ${
          hit === "inside" ? "bg-accent-subtle ring-1 ring-accent ring-inset" : ""
        }`}
        {...dragHandlers}
      >
        {(hit === "before" || hit === "after") && (
          <span
            aria-hidden
            className={`absolute inset-x-1 h-0.5 rounded-full bg-accent ${
              hit === "before" ? "-top-px" : "-bottom-px"
            }`}
          />
        )}

        {navigable}
        <MenuRowActions node={node} />
      </div>

      {expandable && open && (
        <>
          {children.isLoading && <LevelSkeleton depth={depth + 1} />}
          <MenuLevel items={children.items} path={[...path, node.id]} />
        </>
      )}
    </>
  );
}

function LevelSkeleton({ depth }: { depth: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {[60, 45].map((width, index) => (
        <div
          key={index}
          className="flex h-7 items-center"
          style={{ paddingLeft: `${8 + Math.max(0, depth - 1) * 14}px` }}
        >
          <div className="h-3 rounded-sm bg-surface-active" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
