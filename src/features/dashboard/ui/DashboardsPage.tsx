import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  FolderIcon,
  LayoutDashboardIcon,
  PanelLeftIcon,
  Settings2Icon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuIcon, ROOT_MENU_ID, useMenuChildren } from "@/features/sidebar";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import { useDashboardTree } from "../api/tree";
import {
  findDashboard,
  newDashboard,
  newFolder,
  patchDashboard,
  patchFolder,
  type Dashboard,
  type Widget,
  type Tree,
} from "../model/dashboard";
import { readPrefs, toggle, writePrefs, type Prefs } from "../model/prefs";
import { DashNav } from "./DashNav";
import { WidgetGrid } from "./WidgetGrid";

/**
 * Экран дашбордов (ADR-0013): свой сайдбар с деревом «модуль → папка →
 * дашборд», над дашбордом — вкладки его папки, ниже — виджеты.
 *
 * `moduleId` — модуль, из которого пришли: без выбранного дашборда
 * открывается первый дашборд этого модуля.
 */
export function DashboardsPage({
  dashboardId,
  moduleId,
  onOpen,
}: {
  dashboardId: string;
  moduleId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSession();
  const root = useMenuChildren(ROOT_MENU_ID);
  const modules = root.items.filter((node) => node.isModule);
  const { tree, isLoading, canRead, canEdit, save } = useDashboardTree();

  const prefsKey = `omni4.dashboards.${session.getProjectId() ?? ""}.${session.getUserId()}`;
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(prefsKey));
  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    writePrefs(prefsKey, next);
  };

  /*
   * Раскладка в правке — черновик, как «Настроить» в professio:
   * «Сохранить» пишет одной записью, «Отмена» возвращает как было.
   * Привязан к дашборду: ушли на соседнюю вкладку — правка брошена.
   */
  const [layout, setLayout] = useState<{ id: string; widgets: Widget[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const home = moduleId || modules[0]?.id || "";
  const current =
    findDashboard(tree, dashboardId) ??
    (() => {
      const folder =
        tree.folders.find((item) => item.moduleId === home && item.dashboards.length) ??
        tree.folders.find((item) => item.dashboards.length);
      return folder ? { folder, dashboard: folder.dashboards[0]! } : null;
    })();

  /*
   * Путь к дашборду раскрывается ОДИН раз — когда его открыли. Раньше
   * он раскрывался на каждом рендере, и модуль с папкой открытого
   * дашборда нельзя было свернуть: щелчок записывал «свёрнуто»,
   * а отрисовка тут же это отбрасывала.
   */
  const revealed = useRef("");
  const openedId = current?.dashboard.id ?? "";
  const path = current ? [current.folder.id, current.folder.moduleId] : [];
  useEffect(() => {
    if (!openedId || revealed.current === openedId) return;
    revealed.current = openedId;
    if (path.some((key) => prefs.closed.includes(key))) {
      updatePrefs({ ...prefs, closed: prefs.closed.filter((key) => !path.includes(key)) });
    }
  });
  const closed = new Set(prefs.closed);

  const apply = (next: Tree, open?: string) => {
    save(next);
    if (open) onOpen(open);
  };

  /** Папка нового дашборда: заданная → папка открытого → первая папка модуля → новая. */
  const addDashboard = (folderId?: string) => {
    const dashboard = newDashboard("");
    const module = current?.folder.moduleId ?? home;
    const target =
      tree.folders.find((folder) => folder.id === folderId) ??
      current?.folder ??
      tree.folders.find((folder) => folder.moduleId === module);

    if (target) {
      apply(patchFolder(tree, target.id, (folder) => ({ ...folder, dashboards: [...folder.dashboards, dashboard] })), dashboard.id);
    } else {
      const folder = { ...newFolder(module, t("dashboard.defaultFolder")), dashboards: [dashboard] };
      apply({ folders: [...tree.folders, folder] }, dashboard.id);
    }
  };

  const addFolder = () =>
    apply({ folders: [...tree.folders, newFolder(current?.folder.moduleId ?? home, t("dashboard.newFolder"))] });

  const patchCurrent = (patch: Partial<Dashboard>) =>
    current && apply(patchDashboard(tree, current.dashboard.id, (dashboard) => ({ ...dashboard, ...patch })));

  const nav = prefs.hidden ? null : (
    /* На узком экране сайдбар выезжает поверх, а не теснит дашборд. */
    <div className="max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:shadow-raised">
      <DashNav
        tree={tree}
        modules={modules}
        currentId={current?.dashboard.id ?? ""}
        favorites={prefs.favorites}
        closed={closed}
        canEdit={canEdit}
        onToggle={(key) => updatePrefs({ ...prefs, closed: toggle(prefs.closed, key) })}
        onOpen={onOpen}
        onNewDashboard={addDashboard}
        onNewFolder={addFolder}
        onRenameFolder={(id, title) => apply(patchFolder(tree, id, (folder) => ({ ...folder, title })))}
        onRemoveFolder={(id) => apply(patchFolder(tree, id, () => null))}
        onHide={() => updatePrefs({ ...prefs, hidden: true })}
      />
    </div>
  );

  if (!canRead) {
    return <p className="p-6 text-sm text-fg-muted">{t("dashboard.noAccess")}</p>;
  }

  const module = modules.find((item) => item.id === current?.folder.moduleId);
  const editing = canEdit && layout !== null && layout.id === current?.dashboard.id;
  const favorite = Boolean(current && prefs.favorites.includes(current.dashboard.id));

  const showNav = () => updatePrefs({ ...prefs, hidden: false });

  return (
    <div className="relative flex min-h-0 flex-1">
      {nav}

      {/* Страница прокручивается целиком, полоса вкладок липнет к верху —
          как `.scroller` и `.viewbar` прототипа. */}
      <div className="min-w-0 flex-1 overflow-auto">
        {!current ? (
          <div className="px-6 pt-9 lg:px-24">
            {prefs.hidden && <ShowNav onClick={showNav} />}
            <Empty
              title={isLoading ? t("common.loading") : t("dashboard.none")}
              description={isLoading ? "" : t("dashboard.noneDescription")}
              action={
                canEdit && !isLoading ? (
                  <Button type="button" size="sm" onClick={() => addDashboard()}>
                    <Icon as={PlusIcon} size={14} />
                    {t("dashboard.newEmpty")}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="px-6 pb-30 lg:px-24">
            {/* Шапка — `.page-head` прототипа: путь, крупный значок,
                заголовок и описание правятся прямо на месте. */}
            <div className="pt-9">
              <div className="mb-2.5 flex items-center gap-1.5 text-[13px] text-fg-muted">
                {module && <MenuIcon name={module.icon} type={module.type} />}
                <span>{module?.label ?? t("dashboard.noModule")}</span>
                <span className="text-fg-subtle">/</span>
                <Icon as={FolderIcon} size={13} className="text-fg-subtle" />
                <span>{current.folder.title || t("dashboard.untitled")}</span>
              </div>

              <InlineText
                key={`${current.dashboard.id}-emoji`}
                value={current.dashboard.emoji}
                label={t("dashboard.emoji")}
                editable={canEdit}
                maxLength={4}
                onCommit={(emoji) => emoji && patchCurrent({ emoji })}
                className="mb-2 w-[1.6em] text-center text-[52px] leading-[1.1]"
              />
              <InlineText
                key={`${current.dashboard.id}-title`}
                value={current.dashboard.title}
                placeholder={t("dashboard.untitled")}
                label={t("dashboard.dashboardTitle")}
                editable={canEdit}
                onCommit={(title) => patchCurrent({ title })}
                className="mb-1 w-full text-[26px] font-bold leading-tight tracking-[-0.01em] lg:text-[32px]"
              />
              <InlineText
                key={`${current.dashboard.id}-description`}
                value={current.dashboard.description}
                placeholder={canEdit ? t("dashboard.descriptionPlaceholder") : ""}
                label={t("dashboard.description")}
                editable={canEdit}
                onCommit={(description) => patchCurrent({ description })}
                className="mb-4.5 w-full max-w-190 text-sm text-fg-muted"
              />
            </div>

            {/* Полоса вкладок — `.viewbar`: вкладки папки слева, действия справа. */}
            <div className="sticky top-0 z-10 flex min-h-10 items-center gap-1 border-b border-border bg-surface">
              {prefs.hidden && <ShowNav onClick={showNav} />}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Tabs
                  tabs={current.folder.dashboards.map((dashboard) => ({
                    id: dashboard.id,
                    label: `${dashboard.emoji} ${dashboard.title || t("dashboard.untitled")}`,
                  }))}
                  activeId={current.dashboard.id}
                  onSelect={onOpen}
                />
                {canEdit && (
                  <ViewAction label={t("dashboard.addToFolder")} onClick={() => addDashboard(current.folder.id)}>
                    <Icon as={PlusIcon} size={16} />
                  </ViewAction>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <ViewAction
                  label={t(favorite ? "dashboard.unfavorite" : "dashboard.favorite")}
                  pressed={favorite}
                  onClick={() => updatePrefs({ ...prefs, favorites: toggle(prefs.favorites, current.dashboard.id) })}
                >
                  <Icon as={StarIcon} size={16} className={favorite ? "fill-current text-warning" : ""} />
                </ViewAction>
                {/* ponytail: «Обновить» сбрасывает кэш строк всех таблиц, а не
                    только этого дашборда — дешевле, чем собирать его запросы. */}
                <ViewAction
                  label={t("dashboard.refresh")}
                  onClick={() => void queryClient.invalidateQueries({ queryKey: keys.items.all })}
                >
                  <Icon as={RefreshCwIcon} size={16} />
                </ViewAction>
                {canEdit && (
                  <>
                    <ViewAction label={t("dashboard.remove")} danger onClick={() => setDeleting(true)}>
                      <Icon as={Trash2Icon} size={16} />
                    </ViewAction>
                    {editing ? (
                      <>
                        <Button type="button" size="sm" variant="secondary" className="ml-1" onClick={() => setLayout(null)}>
                          {t("action.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            patchCurrent({ widgets: layout.widgets });
                            setLayout(null);
                          }}
                        >
                          <Icon as={CheckIcon} size={14} />
                          {t("action.save")}
                        </Button>
                      </>
                    ) : (
                      <ViewAction
                        label={t("dashboard.manage")}
                        onClick={() => setLayout({ id: current.dashboard.id, widgets: current.dashboard.widgets })}
                        text
                      >
                        <Icon as={Settings2Icon} size={16} />
                      </ViewAction>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="pt-4">
              <WidgetGrid
                key={current.dashboard.id}
                widgets={editing ? layout.widgets : current.dashboard.widgets}
                editing={editing}
                editable={canEdit}
                /* Вне правки меняет только диалог «Добавить первый виджет» —
                   он сам и есть подтверждение, пишем сразу. */
                onWidgets={(widgets) =>
                  editing ? setLayout({ id: layout.id, widgets }) : patchCurrent({ widgets })
                }
              />
            </div>
          </div>
        )}
      </div>

      {deleting && current && (
        <ConfirmDialog
          title={t("dashboard.removeTitle")}
          description={t("dashboard.removeDescription", {
            name: current.dashboard.title || t("dashboard.untitled"),
          })}
          confirmLabel={t("dashboard.remove")}
          busy={false}
          onConfirm={() => {
            setDeleting(false);
            apply(patchDashboard(tree, current.dashboard.id, () => null));
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

/**
 * Текст, который правится на месте, — `contenteditable` заголовка
 * прототипа, но полем: так проще с Enter, Escape и пустым значением.
 * Без права правки — просто текст.
 */
function InlineText({
  value,
  placeholder,
  label,
  editable,
  maxLength,
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  label: string;
  editable: boolean;
  maxLength?: number;
  onCommit: (value: string) => void;
  className: string;
}) {
  const [text, setText] = useState(value);

  if (!editable) {
    return value ? <div className={`${className} truncate`}>{value}</div> : null;
  }

  const commit = () => {
    const next = text.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <input
      value={text}
      placeholder={placeholder}
      aria-label={label}
      maxLength={maxLength}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          const input = event.currentTarget;
          setText(value);
          // Сначала откат, потом blur: иначе blur отправит набранное.
          requestAnimationFrame(() => input.blur());
        }
      }}
      className={`block rounded-md bg-transparent text-fg outline-none transition-colors placeholder:text-fg-subtle hover:bg-surface-hover focus:bg-transparent focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    />
  );
}

/** Кнопка полосы вкладок — `.va-btn` прототипа: без рамки, подсветка на наведении. */
function ViewAction({
  label,
  onClick,
  pressed,
  danger,
  text,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  danger?: boolean;
  /** Подпись рядом со значком — у главного действия полосы. */
  text?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={text ? undefined : label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.25 rounded-[5px] px-1.75 text-sm whitespace-nowrap transition-colors hover:bg-surface-hover ${
        pressed ? "text-accent-text" : danger ? "text-fg-muted hover:text-danger" : "text-fg-muted hover:text-fg"
      }`}
    >
      {children}
      {text && <span>{label}</span>}
    </button>
  );
}

/** Пустое состояние — значок, заголовок, пояснение и действие. */
function Empty({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-xl bg-accent-subtle text-accent-text">
        <Icon as={LayoutDashboardIcon} size={22} />
      </span>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function ShowNav({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      title={t("dashboard.showNav")}
      aria-label={t("dashboard.showNav")}
      onClick={onClick}
      className="grid h-7 w-7.5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <Icon as={PanelLeftIcon} size={16} />
    </button>
  );
}
