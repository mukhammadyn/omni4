import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsRightIcon, SearchIcon } from "lucide-react";
import { errorText } from "@/shared/api/client";
import { Icon } from "@/shared/ui/icon";
import { ResizeHandle } from "@/shared/ui/resize-handle";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useUi } from "@/shared/lib/ui-store";
import { ROOT_MENU_ID, useMenuChildren } from "../api/menus";
import type { MenuNode } from "../model/types";
import { AddMenuButton } from "./AddMenuButton";
import { MenuDndProvider } from "./dnd-context";
import { MenuLevel } from "./MenuLevel";
import { CommandPalette } from "./CommandPalette";
import { ModuleSwitcher } from "./ModuleSwitcher";
import { SidebarFooter } from "./SidebarFooter";
import { WorkspaceHeader } from "./WorkspaceHeader";

/**
 * Свёрнутый сайдбар не оставляет после себя ничего: ни рельса иконок,
 * ни полосы — контент занимает весь экран. Достать меню можно двумя
 * способами: кнопкой в шапке контента и наведением на левый край,
 * от которого сайдбар всплывает поверх (peek) и уезжает, как только
 * курсор ушёл.
 *
 * Панель ОДНА на все три состояния и с экрана не снимается: свёрнутая
 * уезжает за левый край и ждёт там. Двух копий быть не должно (у них
 * разошлась бы строка поиска), а снять и вернуть — значит показывать
 * рывком: у снятого с экрана нечему ехать обратно.
 */
export function Sidebar() {
  const { sidebarCollapsed, moduleId, setModule } = useUi();
  // Корневой уровень: бэкенд требует parent_id всегда, без него он вернёт
  // не список, а сам корневой пункт.
  const root = useMenuChildren(ROOT_MENU_ID);
  /*
   * Модули — папки корня с `is_tab` (CONTEXT.md, «Module»). Есть они —
   * дерево показывает содержимое выбранного, а сами папки уходят в ряд
   * над деревом. Нет — меню как было, от корня.
   */
  const modules = root.items.filter((node) => node.isModule);
  const active = modules.find((node) => node.id === moduleId) ?? modules[0];
  const level = useMenuChildren(active?.id ?? ROOT_MENU_ID, Boolean(active));
  const items = active ? level.items : root.items;
  const isLoading = root.isLoading || (Boolean(active) && level.isLoading);
  const error = root.error ?? (active ? level.error : null);
  const [peeking, setPeeking] = useState(false);
  const stopPeek = useCallback(() => setPeeking(false), []);

  useEffect(() => {
    if (!sidebarCollapsed) setPeeking(false);
  }, [sidebarCollapsed]);

  return (
    <>
      {/* Полоса-ловушка у самого края: попасть в неё можно броском мыши
          влево, не целясь в кнопку. */}
      {sidebarCollapsed && (
        <div
          className="fixed inset-y-0 left-0 z-30 w-2"
          onPointerEnter={() => setPeeking(true)}
          aria-hidden
        />
      )}

      <SidebarPanel
        menus={items}
        isLoading={isLoading}
        error={error}
        modules={modules}
        active={active}
        onModule={setModule}
        collapsed={sidebarCollapsed}
        peeking={sidebarCollapsed && peeking}
        onLeave={stopPeek}
      />
    </>
  );
}

/** Кнопка в шапке контента: единственный способ вернуть сайдбар насовсем. */
export function SidebarToggleButton() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useUi();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={t("sidebar.open")}
      title={t("sidebar.open")}
      /* Закреплённому сайдбару кнопка не нужна, но снимать её с места
         нельзя: заголовок страницы прыгнул бы влево ровно в тот момент,
         когда сайдбар плавно выезжает. Поэтому она схлопывается, а
         отрицательный отступ съедает зазор ряда (gap-2), который у
         нулевой ширины остался бы лишним. */
      inert={!sidebarCollapsed}
      className={`grid h-7 shrink-0 place-items-center overflow-hidden rounded-md text-fg-muted transition-[width,margin,background-color,color] duration-200 ease-out hover:bg-surface-hover hover:text-fg ${
        sidebarCollapsed ? "w-7" : "-mr-2 w-0"
      }`}
    >
      {/* Стрелки вправо — зеркало «свернуть» в шапке сайдбара
          (WorkspaceHeader, CollapseButton): направление, а не картинка
          панели, которой сейчас нет на экране. */}
      <Icon as={ChevronsRightIcon} size={16} />
    </button>
  );
}

function SidebarPanel({
  menus,
  isLoading,
  error,
  modules,
  active,
  onModule,
  collapsed,
  peeking,
  onLeave,
}: {
  menus: MenuNode[];
  isLoading: boolean;
  error: Error | null;
  modules: MenuNode[];
  /** Выбранный модуль: его содержимое — это `menus`. Нет модулей — нет и его. */
  active: MenuNode | undefined;
  onModule: (id: string) => void;
  /** Убран с экрана: уехал за левый край, места в раскладке не занимает. */
  collapsed: boolean;
  /** Свёрнутый, но вызванный наведением: лежит ПОВЕРХ контента. */
  peeking: boolean;
  /** Закрыться, когда курсор ушёл. Слушается только у всплывающего. */
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { sidebarWidth, setSidebarWidth } = useUi();
  const aside = useRef<HTMLElement>(null);
  /* ⌘K / Ctrl+K — окно «Поиск или AI», как подсказывает `kbd` на кнопке.
     Работает и при свёрнутой панели: окно от неё не зависит. */
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /*
   * Уход курсора ловится на документе, а не через onPointerLeave: панель
   * закрывается по геометрии, а её собственные слои живут за её пределами,
   * и решать про каждый нужно отдельно.
   */
  useEffect(() => {
    if (!peeking) return;

    const onOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      /*
       * Меню и модальное окно, открытые отсюда, лежат порталом в <body>:
       * курсор, доехавший до них, формально уходит из панели. Без этой
       * проверки панель закрывалась бы по дороге к пункту и уносила слой
       * с собой — он живёт в её поддереве. Та же причина, что и в Popover.
       *
       * Меню сюда добавлено вместе с z-56 (shared/ui/popover): пока оно
       * пряталось ПОД панелью, до него было не дойти, и промах не был виден.
       */
      if (target.closest("[data-modal],[data-popover]")) return;

      if (!aside.current?.contains(target)) onLeave();
    };

    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, [peeking, onLeave]);

  return (
    <aside
      ref={aside}
      /*
       * Свёрнутый уезжает ОТРИЦАТЕЛЬНЫМ ОТСТУПОМ, а не нулевой шириной:
       * ширину в это же время пишет ручка размера (см. ResizeHandle),
       * и переход по ней превратил бы перетаскивание в желе. Отступ
       * же двигает и панель, и контент за ней — одним свойством.
       *
       * Всплывающий сдвигается поверх контента сдвигом (`translate`):
       * раскладку он не трогает, поэтому таблица под ним не дёргается.
       * Сумма даёт ровно край экрана: -width + 100% = 0.
       */
      style={{ width: sidebarWidth, marginLeft: collapsed ? -sidebarWidth : 0 }}
      /* Уехавшая панель остаётся в DOM ради обратного хода — но не в
         порядке обхода с клавиатуры: Tab не должен уводить в невидимое. */
      inert={collapsed && !peeking}
      /* Переход по `translate`, а не по `transform`: утилиты сдвига
         в tailwind 4 пишут отдельное свойство translate. */
      className={`group/aside relative flex shrink-0 flex-col gap-2 p-2 transition-[margin-left,translate,background-color,box-shadow] duration-200 ease-out ${
        collapsed
          /*
           * Свёрнутый — плавающая поверхность: заливка, тень и скруглённый
           * правый край. Не только ради вида наведением вызванной панели:
           * пока она уезжает и приезжает, под ней едет контент, и панель
           * без своей заливки просвечивала бы насквозь.
           *
           * z-55: выше карточки записи (z-50). Широкая карточка накрывает
           * левый край экрана целиком, и панель, вызванная наведением,
           * уезжала под неё — то есть не появлялась вовсе.
           */
          ? `z-55 border-r border-border bg-bg shadow-modal ${peeking ? "translate-x-full" : ""}`
          /* Закреплённый — без своей заливки: он лежит на фоне приложения,
             а это и есть цвет сайдбара прототипа. Линия справа отделяет его
             от белого контента, как `.sidebar` прототипа. Контент (`main`,
             z-10) при этом лежит ВЫШЕ, и раскрытие читается как «контент
             отъехал и открыл меню», а не как наложение. */
          : "border-r border-border"
      }`}
    >
      {/* У свёрнутого ручки нет: тянуть край панели, которая закроется,
          стоит курсору выйти за него, — занятие на любителя. */}
      {!collapsed && (
        <ResizeHandle
          edge="right"
          target={aside}
          value={sidebarWidth}
          min={SIDEBAR_MIN_WIDTH}
          max={SIDEBAR_MAX_WIDTH}
          label={t("sidebar.resize")}
          onCommit={setSidebarWidth}
        />
      )}

      <WorkspaceHeader floating={peeking} />

      {/* `.sb-search` прототипа: не поле, а кнопка — открывает окно
          «Поиск или AI» (CommandPalette). Поиска по меню здесь больше нет. */}
      <button
        type="button"
        onClick={() => setPalette(true)}
        className="flex h-8 items-center gap-2 rounded-lg border border-border-strong bg-sidebar-field px-2.5 text-left text-sm text-fg-subtle transition-colors hover:border-fg-subtle"
      >
        <Icon as={SearchIcon} size={16} />
        <span className="min-w-0 flex-1 truncate">{t("sidebar.search")}</span>
        <kbd className="shrink-0 rounded-sm border border-border-strong px-1 text-[11px] leading-4">
          ⌘K
        </kbd>
      </button>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}

      {modules.length > 0 && (
        <ModuleSwitcher modules={modules} activeId={active?.id ?? ""} onSelect={onModule} />
      )}

      {/* ВРЕМЕННО СКРЫТО. Строка помощника — над меню и вне его: это не
          раздел проекта, а вход в отдельный экран, и в дереве меню он
          не сортируется, не переносится и не удаляется. Тот же ряд 32px
          и та же пара «наведение → surface с тенью у выбранного», что
          у пунктов меню.

          Сам экран жив и открывается по адресу /copilot — убран только
          вход из сайдбара. Вернуть — раскомментировать вместе с
          SparklesIcon и Link (@tanstack/react-router) в импортах выше.

      <Link
        to="/copilot"
        className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-hover"
        activeProps={{ className: "bg-surface font-medium text-fg shadow-raised" }}
      >
        <Icon as={SparklesIcon} size={16} className="shrink-0 text-accent-text" />
        <span className="truncate">{t("copilot.title")}</span>
      </Link>
      */}

      <div className="flex items-center justify-between px-2 pt-1">
        <span className="text-2xs font-semibold text-fg-subtle">
          {t("sidebar.menu")}
        </span>
        {/* Новый пункт — в выбранный модуль: корень занят модулями. */}
        <AddMenuButton parentId={active?.id ?? ROOT_MENU_ID} />
      </div>

      <nav className="flex-1 overflow-y-auto" aria-label={t("sidebar.menu")}>
        {isLoading && <Skeleton />}
        {error && <LoadError error={error} />}
        {!isLoading && !error && menus.length === 0 && (
          <p className="px-2 py-1 text-xs text-fg-subtle">{t("sidebar.empty")}</p>
        )}
        <MenuDndProvider>
          {/* Путь начинается с модуля, а не с корня: уровень модуля — это
              верхний уровень дерева, без лишнего отступа. */}
          <MenuLevel items={menus} path={[active?.id ?? ROOT_MENU_ID]} />
        </MenuDndProvider>
      </nav>

      <SidebarFooter />
    </aside>
  );
}

/**
 * Ошибка показывается словами сервера, а не общей фразой: «project id is
 * an invalid uuid» чинится за минуту, «не удалось загрузить» — за час.
 */
function LoadError({ error }: { error: Error }) {
  const { t } = useTranslation();
  // Разбирает ответ общий errorText: причина приходит и голой строкой,
  // и завёрнутой в {message} — своя проверка знала только первую форму
  // и на самом частом ответе показывала пустоту.
  const detail = errorText(error);

  return (
    <div className="mx-1 flex flex-col gap-1 rounded-md bg-danger-subtle px-2 py-1.5">
      <p className="text-xs font-medium text-danger">{t("sidebar.loadFailed")}</p>
      {detail && <p className="text-2xs break-words text-danger opacity-80">{detail}</p>}
    </div>
  );
}

/** Скелетон повторяет высоту строки — сайдбар не «прыгает» после загрузки. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-0.5" aria-hidden>
      {[70, 55, 80, 60, 45].map((width, index) => (
        <div key={index} className="flex h-8 items-center px-2">
          <div className="h-3 rounded-sm bg-surface-active" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
