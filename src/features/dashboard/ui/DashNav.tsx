import { useRef, useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  ChevronsLeftIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LayoutDashboardIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuIcon, type MenuNode } from "@/features/sidebar";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import type { Folder, Tree } from "../model/dashboard";
import { NO_MODULE } from "../model/prefs";

/**
 * Цвет модуля — `MODULES[].color` прототипа. Модуль меню своего цвета
 * не хранит, поэтому узнаём его по названию.
 *
 * ponytail: по названию модуля; переименуют — плашка станет цветом
 * акцента. Хранить цвет в `attributes` модуля, когда его будут задавать.
 */
const MODULE_TINTS: Record<string, string> = {
  crm: "bg-module-crm",
  hrms: "bg-module-hrms",
  склад: "bg-module-wms",
  финансы: "bg-module-fin",
  проекты: "bg-module-pm",
};

/** Плашка модуля — `.dn-mic` прототипа: белый значок на цвете модуля. */
export function ModuleMark({ module, small = false }: { module: MenuNode; small?: boolean }) {
  const tint = MODULE_TINTS[module.label.trim().toLowerCase()] ?? "bg-accent";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[5px] text-white [&_svg]:size-3 ${tint} ${small ? "size-4.5" : "size-5"}`}
    >
      <MenuIcon name={module.icon} type={module.type} />
    </span>
  );
}

const ROW =
  "flex h-7.5 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-surface-hover";

/** Пункт меню строки: подпись, значок, опасный ли. */
type RowAction = { label: string; icon: LucideIcon; danger?: boolean; separated?: boolean; run: () => void };

/**
 * Сайдбар дашбордов — `DashNav` прототипа (index.html): «Избранное»,
 * дерево «модуль → папка → дашборд», поиск, «+ Новый дашборд».
 * Это второй уровень навигации, а не главный сайдбар: он живёт
 * внутри экрана дашбордов.
 *
 * Всё, что делается с деревом, делается в нём же, при наведении на
 * строку: у модуля «+» (дашборд или папка), у папки «+» и «⋯»
 * (переименовать, удалить), у дашборда «⋯» (переименовать, избранное,
 * удалить) — как «⋯» у пунктов главного сайдбара (MenuRowActions).
 */
export function DashNav({
  tree,
  modules,
  currentId,
  favorites,
  closed,
  canEdit,
  onToggle,
  onOpen,
  onNewDashboard,
  onNewFolder,
  onRenameFolder,
  onRemoveFolder,
  onRenameDashboard,
  onRemoveDashboard,
  onFavorite,
  onHide,
}: {
  tree: Tree;
  /** Модули проекта — папки меню с `is_tab`. */
  modules: MenuNode[];
  currentId: string;
  favorites: string[];
  /** Свёрнутые узлы: id модуля или папки. */
  closed: ReadonlySet<string>;
  canEdit: boolean;
  onToggle: (key: string) => void;
  onOpen: (id: string) => void;
  /**
   * Без папки — в папку открытого дашборда или первую папку модуля.
   * С модулем — в первую папку этого модуля, а нет папок — в новую.
   */
  onNewDashboard: (folderId?: string, moduleId?: string) => void;
  /** Без модуля — в модуль открытого дашборда. Отдаёт id новой папки: её сразу переименовывают. */
  onNewFolder: (moduleId?: string) => string;
  onRenameFolder: (id: string, title: string) => void;
  /** Папку с дашбордами страница удаляет только после подтверждения. */
  onRemoveFolder: (id: string) => void;
  onRenameDashboard: (id: string, title: string) => void;
  /** Удаление спрашивает подтверждение у страницы. */
  onRemoveDashboard: (id: string) => void;
  onFavorite: (id: string) => void;
  onHide: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  /**
   * Чьё имя правится в строке: `folder:<id>` или `<место>:<id>` дашборда.
   * Место — потому что дашборд из «Избранного» виден дважды, а поле
   * нужно одно — там, где нажали.
   */
  const [renaming, setRenaming] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const match = (title: string) => !q || title.toLowerCase().includes(q);
  const name = (title: string) => title || t("dashboard.untitled");

  /*
   * Группы дерева — модули меню, плюс «Без модуля» для папок, чей
   * модуль удалили или не указали: дашборды не пропадают молча.
   */
  const known = new Set(modules.map((module) => module.id));
  const orphans = tree.folders.filter((folder) => !known.has(folder.moduleId));
  const groups = [
    ...modules.map((module) => ({
      id: module.id,
      label: module.label,
      icon: <ModuleMark module={module} />,
      folders: tree.folders.filter((folder) => folder.moduleId === module.id),
    })),
    ...(orphans.length
      ? [{ id: NO_MODULE, label: t("dashboard.noModule"), icon: <Icon as={FolderIcon} size={16} />, folders: orphans }]
      : []),
  ];

  const all = tree.folders.flatMap((folder) =>
    folder.dashboards.map((dashboard) => ({ folder, dashboard })),
  );
  const favs = favorites
    .map((id) => all.find((item) => item.dashboard.id === id))
    .filter((item) => item !== undefined);
  const moduleLabel = (folder: Folder) =>
    modules.find((module) => module.id === folder.moduleId)?.label ?? t("dashboard.noModule");

  /** «Пустой дашборд» и «Новая папка» — в модуль `moduleId` или в модуль открытого. */
  const createActions = (moduleId?: string): RowAction[] => [
    { label: t("dashboard.newEmpty"), icon: LayoutDashboardIcon, run: () => onNewDashboard(undefined, moduleId) },
    { label: t("dashboard.newFolder"), icon: FolderPlusIcon, run: () => setRenaming(`folder:${onNewFolder(moduleId)}`) },
  ];

  const create = (className: string, label?: string) => (
    <Popover
      align="start"
      className={className}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={t("dashboard.new")}
          aria-label={t("dashboard.new")}
          className={label ? `${ROW} text-fg-muted` : "grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"}
        >
          <Icon as={PlusIcon} size={16} />
          {label}
        </button>
      )}
    >
      {(close) => <ActionItems actions={createActions()} close={close} />}
    </Popover>
  );

  const item = (place: "fav" | "tree", id: string, emoji: string, title: string, indent: string, trailing?: string) => {
    const favorite = favorites.includes(id);
    const key = `${place}:${id}`;
    return (
      <div
        key={id}
        className={`${ROW} group/row ${indent} ${id === currentId ? "bg-surface-active font-medium text-fg" : "text-fg-muted"}`}
      >
        {renaming === key ? (
          <>
            <span className="w-4.5 shrink-0 text-center">{emoji}</span>
            <RenameInput
              value={title}
              label={t("dashboard.dashboardTitle")}
              onDone={(next) => {
                setRenaming(null);
                if (next !== undefined && next !== title) onRenameDashboard(id, next);
              }}
            />
          </>
        ) : (
          <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="w-4.5 shrink-0 text-center">{emoji}</span>
            <span className="truncate">{name(title)}</span>
            {trailing && <span className="ml-auto shrink-0 text-2xs text-fg-subtle">{trailing}</span>}
          </button>
        )}
        <RowMenu
          label={t("dashboard.more")}
          icon={EllipsisIcon}
          actions={[
            ...(canEdit ? [{ label: t("dashboard.rename"), icon: PencilIcon, run: () => setRenaming(key) }] : []),
            {
              label: t(favorite ? "dashboard.unfavorite" : "dashboard.favorite"),
              icon: StarIcon,
              run: () => onFavorite(id),
            },
            ...(canEdit
              ? [{ label: t("dashboard.remove"), icon: Trash2Icon, danger: true, separated: true, run: () => onRemoveDashboard(id) }]
              : []),
          ]}
        />
      </div>
    );
  };

  return (
    <nav aria-label={t("dashboard.title")} className="flex h-full w-65 shrink-0 flex-col border-r border-border bg-surface-soft">
      <div className="flex items-center gap-0.5 pt-3 pr-2.5 pb-1.5 pl-3.5">
        <b className="flex-1 text-sm font-semibold">{t("dashboard.title")}</b>
        {canEdit && create("")}
        <button
          type="button"
          onClick={onHide}
          title={t("dashboard.hideNav")}
          aria-label={t("dashboard.hideNav")}
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={ChevronsLeftIcon} size={16} />
        </button>
      </div>

      <label className="mx-2.5 mt-0.5 mb-1.5 flex h-7.5 items-center gap-1.5 rounded-md border border-border bg-bg px-2 text-fg-subtle">
        <Icon as={SearchIcon} size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("dashboard.search")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2.5">
        {!q && favs.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-xs font-semibold text-fg-subtle">{t("dashboard.favorites")}</div>
            {favs.map(({ folder, dashboard }) =>
              item("fav", dashboard.id, dashboard.emoji, dashboard.title, "", moduleLabel(folder)),
            )}
          </>
        )}

        <div className="px-2 pt-3 pb-1 text-xs font-semibold text-fg-subtle">{t("dashboard.modules")}</div>
        {groups.map((group) => {
          const folders = group.folders
            .map((folder) => ({ folder, dashboards: folder.dashboards.filter((d) => match(d.title || t("dashboard.untitled"))) }))
            .filter((entry) => !q || entry.dashboards.length);
          if (q && !folders.length) return null;
          const groupOpen = Boolean(q) || !closed.has(group.id);
          const count = group.folders.reduce((sum, folder) => sum + folder.dashboards.length, 0);

          return (
            <div key={group.id}>
              <div className={`${ROW} group/row font-semibold text-fg`}>
                <button type="button" onClick={() => onToggle(group.id)} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Chevron open={groupOpen} />
                  <span className="flex shrink-0">{group.icon}</span>
                  <span className="truncate">{group.label}</span>
                </button>
                {/* Модуль без папок иначе не заполнить: «+» в шапке кладёт
                    в модуль открытого дашборда. */}
                {canEdit && group.id !== NO_MODULE && (
                  <RowMenu label={t("dashboard.addToModule")} icon={PlusIcon} actions={createActions(group.id)} />
                )}
                <span className="text-xs font-medium text-fg-subtle">{count}</span>
              </div>

              {groupOpen &&
                folders.map(({ folder, dashboards }) => {
                  const folderOpen = Boolean(q) || !closed.has(folder.id);
                  return (
                    <div key={folder.id}>
                      <div className={`${ROW} group/row pl-6 text-fg-muted`}>
                        {renaming === `folder:${folder.id}` ? (
                          <RenameInput
                            value={folder.title}
                            label={t("dashboard.folderTitle")}
                            onDone={(next) => {
                              setRenaming(null);
                              if (next !== undefined && next !== folder.title) onRenameFolder(folder.id, next);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggle(folder.id)}
                            onDoubleClick={() => canEdit && setRenaming(`folder:${folder.id}`)}
                            className="flex min-w-0 flex-1 items-center gap-1.5"
                          >
                            <Chevron open={folderOpen} />
                            <Icon as={folderOpen ? FolderOpenIcon : FolderIcon} size={15} className="shrink-0 text-fg-subtle" />
                            <span className="truncate">{name(folder.title)}</span>
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <HoverButton label={t("dashboard.addToFolder")} onClick={() => onNewDashboard(folder.id)}>
                              <Icon as={PlusIcon} size={14} />
                            </HoverButton>
                            <RowMenu
                              label={t("dashboard.more")}
                              icon={EllipsisIcon}
                              actions={[
                                { label: t("dashboard.rename"), icon: PencilIcon, run: () => setRenaming(`folder:${folder.id}`) },
                                {
                                  label: t("dashboard.removeFolder"),
                                  icon: Trash2Icon,
                                  danger: true,
                                  separated: true,
                                  run: () => onRemoveFolder(folder.id),
                                },
                              ]}
                            />
                          </>
                        )}
                      </div>
                      {folderOpen && dashboards.map((d) => item("tree", d.id, d.emoji, d.title, "pl-12"))}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {q && !all.some(({ dashboard }) => match(dashboard.title || t("dashboard.untitled"))) && (
          <p className="px-3 py-2.5 text-sm text-fg-subtle">{t("dashboard.notFound")}</p>
        )}
      </div>

      {canEdit && <div className="border-t border-border p-1.5">{create("w-full", t("dashboard.new"))}</div>}
    </nav>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Icon
      as={ChevronRightIcon}
      size={14}
      className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`}
    />
  );
}

/** Кнопка строки: видна при наведении на строку, на фокусе и пока открыто её меню. */
const hoverButton = (open: boolean) =>
  `grid size-5.5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-active hover:text-fg focus-visible:opacity-100 ${
    open ? "bg-surface-active text-fg" : "opacity-0 group-hover/row:opacity-100"
  }`;

function HoverButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={hoverButton(false)}>
      {children}
    </button>
  );
}

/** Кнопка строки с меню: «+» у модуля, «⋯» у папки и дашборда. */
function RowMenu({ label, icon, actions }: { label: string; icon: LucideIcon; actions: RowAction[] }) {
  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <button type="button" title={label} aria-label={label} onClick={toggle} className={hoverButton(open)}>
          <Icon as={icon} size={14} />
        </button>
      )}
    >
      {(close) => <ActionItems actions={actions} close={close} />}
    </Popover>
  );
}

function ActionItems({ actions, close }: { actions: RowAction[]; close: () => void }) {
  return actions.map((action) => (
    <div key={action.label}>
      {action.separated && <PopoverSeparator />}
      <PopoverItem
        danger={action.danger ?? false}
        icon={<Icon as={action.icon} size={16} className={action.danger ? "shrink-0" : "shrink-0 text-fg-muted"} />}
        onClick={() => {
          close();
          action.run();
        }}
      >
        {action.label}
      </PopoverItem>
    </div>
  ));
}

/**
 * Имя в строке: Enter и уход фокуса сохраняют, Esc отменяет
 * (`onDone(undefined)`). Текст выделен сразу — новую папку
 * переименовывают целиком, а не дописывают.
 */
function RenameInput({ value, label, onDone }: { value: string; label: string; onDone: (next: string | undefined) => void }) {
  // Ref, а не состояние: blur() из Esc зовёт onBlur сразу, до перерисовки.
  const cancelled = useRef(false);
  return (
    <input
      defaultValue={value}
      aria-label={label}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => onDone(cancelled.current ? undefined : event.currentTarget.value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className="h-6 min-w-0 flex-1 rounded border border-border bg-bg px-1.5 text-sm text-fg outline-none"
    />
  );
}
