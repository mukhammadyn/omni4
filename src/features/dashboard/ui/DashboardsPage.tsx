import {useCallback, useEffect,useLayoutEffect, useRef, useState, type ReactNode,type ChangeEvent,type KeyboardEvent } from "react";
import {
  CheckIcon,
  StarIcon,
  LayoutDashboardIcon,
  PanelLeftIcon,
  Settings2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROOT_MENU_ID, useMenuChildren } from "@/features/sidebar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import {Modal} from "@/shared/ui/modal";
import { useDashboardTree } from "../api/tree";
import {
  findDashboard,
  folderForNew,
  newDashboard,
  newFolder,
  patchDashboard,
  patchFolder,
  type Dashboard,
  type Widget,
  type Tree,
} from "../model/dashboard";
import type { DashFilter, FilterValues } from "../model/filters";
import {toggle} from "../model/prefs";
import {useDashboardPreferences} from "../api/preferences";
import {accessibleDashboardTree} from "../model/navigation";
import { DashFilters } from "./DashFilters";
import { DashNav } from "./DashNav";
import type { Dataset } from "../model/datasets";
import { DatasetEditor } from "./DatasetEditor";
import { WidgetGrid } from "./WidgetGrid";
import { SqlMonthControls } from "./SqlMonthControls";

/**
 * Экран дашбордов (ADR-0013): свой сайдбар с деревом «модуль → папка →
 * дашборд», над дашбордом — вкладки его папки, ниже — виджеты.
 *
 * Без явного id правая область остаётся пустой; ссылки открывают только
 * выбранный доступный дашборд.
 */
export function DashboardsPage({
  dashboardId,
  moduleId,
  values,
  onOpen,
  onValues,
  manage=false,
  onManageClose,
}: {
  manage?:boolean;
  onManageClose?:()=>void;
  dashboardId: string;
  moduleId: string;
  /** Значения общих фильтров — из адреса (ADR-0013). */
  values: FilterValues;
  onOpen: (id: string) => void;
  onValues: (values: FilterValues) => void;
}) {
  const { t } = useTranslation();
  const root = useMenuChildren(ROOT_MENU_ID);
  const modules = root.items.filter((node) => node.isModule);
  const { tree, menuId, isLoading, isSaving, saveError, retrySave, canRead, canEdit:canEditStore, save } = useDashboardTree();
  const canEdit=canEditStore&&!root.isLoading&&!root.error;
  const readableTree=accessibleDashboardTree(tree,modules);
  const {prefs,updatePrefs}=useDashboardPreferences();
  const [navOpen,setNavOpen]=useState(false);
  useEffect(()=>setNavOpen(manage),[manage]);
  const closeNav=useCallback(()=>{setNavOpen(false);onManageClose?.();},[onManageClose]);

  /*
   * Раскладка в правке — черновик, как «Настроить» в professio:
   * «Сохранить» пишет одной записью, «Отмена» возвращает как было.
   * Привязан к дашборду: ушли на соседнюю вкладку — правка брошена.
   */
  const [layout, setLayout] = useState<{ id: string; widgets: Widget[]; filters: DashFilter[]; datasets?: Dataset[] } | null>(null);
  /** Что ждёт подтверждения удаления: дашборд или папка с дашбордами. */
  const [datasetsOpen, setDatasetsOpen] = useState(false);
  const [removing, setRemoving] = useState<{ kind: "dashboard" | "folder"; id: string } | null>(null);

  const home = moduleId || modules[0]?.id || "";
  const catalog=!dashboardId;
  const current = catalog||root.isLoading ? null:findDashboard(readableTree,dashboardId);

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
    const saved = save(next);
    if (open) onOpen(open);
    return saved;
  };

  /** Новое в свёрнутом модуле не должно пропадать из вида: модуль раскрывается. */
  const reveal = (module: string) =>
    prefs.closed.includes(module) && updatePrefs({ ...prefs, closed: prefs.closed.filter((key) => key !== module) });

  /** Папки нет — заводится в модуле (см. folderForNew). */
  const addDashboard = (folderId?: string, moduleOf?: string) => {
    const dashboard = newDashboard("");
    const { folder: target, module } = folderForNew(tree, { folderId, moduleOf, opened: current?.folder, home });

    if (target) {
      apply(patchFolder(tree, target.id, (folder) => ({ ...folder, dashboards: [...folder.dashboards, dashboard] })), dashboard.id);
    } else {
      const folder = { ...newFolder(module, t("dashboard.defaultFolder")), dashboards: [dashboard] };
      apply({ ...tree, folders: [...tree.folders, folder] }, dashboard.id);
    }
  };

  /** Отдаёт id новой папки: сайдбар сразу открывает её на переименование. */
  const addFolder = (moduleOf?: string) => {
    const module = moduleOf ?? current?.folder.moduleId ?? home;
    const folder = newFolder(module, t("dashboard.newFolder"));
    apply({ ...tree, folders: [...tree.folders, folder] });
    reveal(module);
    return folder.id;
  };

  /** Пустая папка удаляется сразу, с дашбордами — после подтверждения. */
  const removeFolder = (id: string) => {
    const folder = tree.folders.find((item) => item.id === id);
    if (folder?.dashboards.length) setRemoving({ kind: "folder", id });
    else apply(patchFolder(tree, id, () => null));
  };

  const patchCurrent = (patch: Partial<Dashboard>) =>
    current && apply(patchDashboard(tree, current.dashboard.id, (dashboard) => ({ ...dashboard, ...patch })));

  const nav = (
      <DashNav
        tree={readableTree}
        catalog={false}
        modules={modules}
        currentId={current?.dashboard.id ?? ""}
        favorites={prefs.favorites}
        closed={closed}
        canEdit={canEdit}
        onToggle={(key) => updatePrefs({ ...prefs, closed: toggle(prefs.closed, key) })}
        onOpen={id=>{closeNav();onOpen(id);}}
        onNewDashboard={addDashboard}
        onNewFolder={addFolder}
        onRenameFolder={(id, title) => apply(patchFolder(tree, id, (folder) => ({ ...folder, title })))}
        onRemoveFolder={removeFolder}
        onRenameDashboard={(id, title) => apply(patchDashboard(tree, id, (dashboard) => ({ ...dashboard, title })))}
        onRemoveDashboard={(id) => setRemoving({ kind: "dashboard", id })}
        onFavorite={(id) => updatePrefs({ ...prefs, favorites: toggle(prefs.favorites, id) })}
        onHide={closeNav}
      />
  );

  if (!canRead) {
    return <p className="p-6 text-sm text-fg-muted">{t("dashboard.noAccess")}</p>;
  }

  const module = modules.find((item) => item.id === (current?.folder.moduleId ?? home));
  const editing = canEdit && layout !== null && layout.id === current?.dashboard.id;

  const showNav = () => setNavOpen(true);
  const removingDashboard = removing?.kind === "dashboard" ? findDashboard(tree, removing.id) : null;
  const removingFolder = removing?.kind === "folder" ? tree.folders.find((folder) => folder.id === removing.id) : undefined;

  return (
    <div className="relative flex min-h-0 flex-1">
      {navOpen&&<DashboardNavigator onClose={closeNav}>{nav}</DashboardNavigator>}
      {datasetsOpen && <DatasetEditor datasets={tree.datasets ?? []} menuId={menuId} onSave={(datasets) => apply({ ...tree, datasets })} onCreateWidget={current && !editing ? (datasets,widget)=>apply(patchDashboard({...tree,datasets},current.dashboard.id,dashboard=>({...dashboard,widgets:[...dashboard.widgets,widget]}))) : undefined} onClose={() => setDatasetsOpen(false)} />}

      {/* Страница прокручивается целиком, полоса вкладок липнет к верху —
          как `.scroller` и `.viewbar` прототипа. */}
      <div className="min-w-0 flex-1 overflow-auto">
        {catalog ? null:!current ? (
          <div className="px-4 pt-6 md:px-6 lg:px-8">
            <ShowNav onClick={showNav} />
            <Empty
              title={
                isLoading
                  ? t("common.loading")
                  : moduleId && module
                    ? t("dashboard.noneInModule", { module: module.label })
                    : t("dashboard.none")
              }
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
          <div className="px-4 pb-8 md:px-6 lg:px-8" data-dashboard-content>
            {/* Значок и заголовок правятся прямо на месте. */}
            <div className="pt-6">
              <InlineText
                key={`${current.dashboard.id}-emoji`}
                value={current.dashboard.emoji}
                label={t("dashboard.emoji")}
                editable={canEdit}
                maxLength={4}
                onCommit={(emoji) => emoji && patchCurrent({ emoji })}
                className="mb-2 w-[1.6em] text-center text-[40px] leading-[1.1]"
              />
              <InlineText
                key={`${current.dashboard.id}-title`}
                value={current.dashboard.title}
                placeholder={t("dashboard.untitled")}
                label={t("dashboard.dashboardTitle")}
                editable={canEdit}
                multiline
                onCommit={(title) => patchCurrent({ title })}
                className="mb-1 w-full text-[24px] font-bold leading-tight tracking-[-0.01em] lg:text-[28px]"
              />
            </div>

            {/* Полоса вкладок — `.viewbar`: вкладки папки слева, действия справа. */}
            <div className="sticky top-0 z-10 flex min-h-10 flex-wrap items-center gap-1 border-b border-border bg-surface">
              <div className="flex min-w-0 flex-1 items-center gap-1 max-sm:basis-full">
                <Tabs
                  tabs={current.folder.dashboards.map((dashboard) => ({
                    id: dashboard.id,
                    label: `${dashboard.emoji} ${dashboard.title || t("dashboard.untitled")}`,
                  }))}
                  activeId={current.dashboard.id}
                  onSelect={onOpen}
                />
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-0.5 max-sm:w-full max-sm:min-w-0 max-sm:pb-1">
                <ViewAction label={t(prefs.favorites.includes(current.dashboard.id) ? "dashboard.unfavorite" : "dashboard.favorite")} pressed={prefs.favorites.includes(current.dashboard.id)} onClick={() => updatePrefs({ ...prefs, favorites: toggle(prefs.favorites, current.dashboard.id) })}>
                  <Icon as={StarIcon} size={16} className={prefs.favorites.includes(current.dashboard.id) ? "fill-current text-warning" : ""} />
                </ViewAction>
                {canEdit && (
                  <>
                    {editing&&<ViewAction label={t("dashboard.datasets")} text onClick={() => setDatasetsOpen(true)}><Icon as={Settings2Icon} size={16} /></ViewAction>}
                    <ViewAction label={t("dashboard.remove")} danger onClick={() => current && setRemoving({ kind: "dashboard", id: current.dashboard.id })}>
                      <Icon as={Trash2Icon} size={16} />
                    </ViewAction>
                    {editing ? (
                      <>
                        <Button type="button" size="sm" variant="secondary" className="ml-1" disabled={isSaving} onClick={() => setLayout(null)}>
                          {t("action.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSaving}
                          onClick={async () => {
                            if (await apply(patchDashboard({ ...tree, datasets: layout.datasets ?? tree.datasets ?? [] }, current.dashboard.id, (dashboard) => ({ ...dashboard, widgets: layout.widgets, filters: layout.filters })))) setLayout(null);
                          }}
                        >
                          <Icon as={CheckIcon} size={14} />
                          {t(isSaving ? "dashboard.saving" : "dashboard.saveDashboard")}
                        </Button>
                      </>
                    ) : (
                      <ViewAction
                        label={t("dashboard.manage")}
                        onClick={() =>
                          setLayout({
                            id: current.dashboard.id,
                            widgets: current.dashboard.widgets,
                            filters: current.dashboard.filters,
                          })
                        }
                        text
                      >
                        <Icon as={Settings2Icon} size={16} />
                      </ViewAction>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              {saveError && <div role="alert" className="flex items-center gap-2 text-sm text-danger"><span>{saveError}</span><Button type="button" size="sm" variant="secondary" disabled={isSaving} onClick={() => { void retrySave(); }}>{t("dashboard.refresh")}</Button></div>}
              {isSaving && <p role="status" className="text-xs text-fg-muted">{t("dashboard.saving")}</p>}
              <DashFilters
                menuId={menuId}
                filters={editing ? layout.filters : current.dashboard.filters}
                values={values}
                editing={editing}
                onValues={onValues}
                onFilters={(filters) => editing && setLayout({ ...layout, filters })}
              />
              <SqlMonthControls menuId={menuId} datasets={editing ? layout.datasets ?? tree.datasets ?? [] : tree.datasets ?? []} widgets={editing ? layout.widgets : current.dashboard.widgets} values={values} onValues={onValues}>
              <WidgetGrid
                key={current.dashboard.id}
                menuId={menuId}
                datasets={editing ? layout.datasets ?? tree.datasets ?? [] : tree.datasets ?? []}
                widgets={editing ? layout.widgets : current.dashboard.widgets}
                filters={editing ? layout.filters : current.dashboard.filters}
                values={values}
                editing={editing}
                editable={canEdit}
                onBeginEditing={() => setLayout({ id: current.dashboard.id, widgets: current.dashboard.widgets, filters: current.dashboard.filters })}
                /* Вне правки меняет только диалог «Добавить первый виджет» —
                   он сам и есть подтверждение, пишем сразу. */
                onWidgets={(widgets) =>
                  editing ? setLayout({ ...layout, widgets }) : patchCurrent({ widgets })
                }
                onSourceSave={(widgets, datasets) => editing ? setLayout({ ...layout, widgets, datasets }) : void apply(patchDashboard({ ...tree, datasets }, current.dashboard.id, (dashboard) => ({ ...dashboard, widgets })))}
              />
              </SqlMonthControls>
            </div>
          </div>
        )}
      </div>

      {removingDashboard && (
        <ConfirmDialog
          title={t("dashboard.removeTitle")}
          description={t("dashboard.removeDescription", {
            name: removingDashboard.dashboard.title || t("dashboard.untitled"),
          })}
          confirmLabel={t("dashboard.remove")}
          busy={false}
          onConfirm={() => {
            setRemoving(null);
            apply(patchDashboard(tree, removingDashboard.dashboard.id, () => null));
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {removingFolder && (
        <ConfirmDialog
          title={t("dashboard.removeFolderTitle")}
          description={t("dashboard.removeFolderDescription", {
            name: removingFolder.title || t("dashboard.untitled"),
            count: removingFolder.dashboards.length,
          })}
          confirmLabel={t("dashboard.removeFolder")}
          busy={false}
          onConfirm={() => {
            setRemoving(null);
            apply(patchFolder(tree, removingFolder.id, () => null));
          }}
          onClose={() => setRemoving(null)}
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
  multiline=false,
}: {
  multiline?:boolean;
  value: string;
  placeholder?: string;
  label: string;
  editable: boolean;
  maxLength?: number;
  onCommit: (value: string) => void;
  className: string;
}) {
  const [text, setText] = useState(value);
  const area=useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{const el=area.current;if(!el)return;const measure=()=>{el.style.height="auto";el.style.height=`${el.scrollHeight}px`;};let width=el.clientWidth;const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;measure();}});observer.observe(el);measure();return()=>observer.disconnect();},[text,multiline]);

  if (!editable) {
    return value ? <div className={`${className} ${multiline?"whitespace-pre-wrap break-words":"truncate"}`}>{value}</div> : null;
  }

  const commit = () => {
    const next = text.trim();
    if (next !== value) onCommit(next);
  };

  const props={
      value:text,placeholder,"aria-label":label,maxLength,spellCheck:false,
      onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setText(event.target.value),
      onBlur:commit,
      onKeyDown:(event:KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
        if(event.key==="Enter"&&(!multiline||!event.shiftKey)){event.preventDefault();event.currentTarget.blur();}
        if(event.key==="Escape"){const input=event.currentTarget;setText(value);requestAnimationFrame(()=>input.blur());}
      },
      className:`block rounded-md bg-transparent text-fg outline-none transition-colors placeholder:text-fg-subtle hover:bg-surface-hover focus:bg-transparent focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`,
  };
  return multiline?<textarea ref={area} rows={1} {...props} className={`${props.className} resize-none overflow-hidden`}/>:<input {...props}/>;
}

function DashboardNavigator({children,onClose}:{children:ReactNode;onClose:()=>void}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const root=panel.current;root?.querySelector<HTMLElement>("button,input")?.focus();const key=(e:globalThis.KeyboardEvent)=>{if(e.key==="Escape"&&!document.querySelector('[role="menu"]'))onClose();if(e.key==="Tab"&&root){const nodes=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener("keydown",key);return()=>{document.removeEventListener("keydown",key);previous?.focus();};},[onClose]);
 return <Modal onClose={onClose} className="flex justify-start"><div ref={panel} role="dialog" aria-modal="true" aria-label="Dashboard navigation" className="h-full shadow-raised">{children}</div></Modal>;
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
