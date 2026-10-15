import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, CopyIcon, FilePlusIcon, FolderInputIcon, LinkIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTablePermissions } from "@/features/auth";
import { formatDate } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { KB, useKbActions, useKbPages } from "../api/kb";
import { childrenOf, descendantsOf, docText, pathTo, toDoc, type KbDoc, type KbPage } from "../model/kb";

/* Редактор — отдельным чанком, как MULTI_LINE (ADR-0015). */
const KbEditor = lazy(() => import("./KbEditor"));

/** Набор `EMO` прототипа. */
const EMOJI = [
  "📄", "📊", "💰", "▶️", "🚨", "📦", "📕", "📘", "📗", "📙", "📂", "📁", "🧴", "💊", "👁️", "❤️", "🧠", "💧", "👋", "🚀",
  "📜", "❓", "💡", "📌", "📎", "🎓", "🧪", "🏥", "🩺", "📈", "🗂️", "🧾", "✅", "⭐", "🔥", "🎯", "🗓️", "📞", "🌍", "🤝",
];
const DEFAULT_ICON = "📄";

/** Тип view экрана (FIXED_VIEW_TYPES). */
export const KB_VIEW = "KNOWLEDGE";

/**
 * База знаний — `knowledge.html` прототипа: дерево страниц слева
 * (поиск по заголовку и тексту, раскрытие, «+» — подстраница) и страница
 * справа: крошки, эмодзи, заголовок, «Обновлено · автор», текст,
 * подстраницы. Открытая страница — в адресе (`pageId`): ссылку на неё
 * пересылают. Сделана под `hr_kb_articles` (FIXED_VIEW_TYPES).
 */
export function KnowledgeBase({ pageId, onOpen }: { pageId: string; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { pages, loading } = useKbPages();
  const actions = useKbActions();
  const can = useTablePermissions()(KB);
  const [query, setQuery] = useState("");
  /* Раскрытые и свёрнутые руками. Ветка к открытой странице раскрыта
     сама, пока её не свернули. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<KbPage | null>(null);
  const [moving, setMoving] = useState<KbPage | null>(null);

  const current = pages.find((p) => p.id === pageId) ?? childrenOf(pages, "")[0];
  const path = useMemo(() => (current ? pathTo(pages, current.id) : []), [pages, current]);

  /* Найденные и их предки: ветка к находке раскрыта. Текст — из документа. */
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const page of pages)
      if (`${page.title} ${docText(toDoc(page.content))}`.toLowerCase().includes(q)) pathTo(pages, page.id).forEach((p) => keep.add(p.id));
    return keep;
  }, [pages, query]);

  const without = (set: Set<string>, id: string) => new Set([...set].filter((x) => x !== id));
  const expand = (id: string) => {
    setOpen((cur) => new Set(cur).add(id));
    setClosed((cur) => without(cur, id));
  };
  const go = (id: string) => {
    /* Открытую страницу снова видно в дереве. */
    setClosed((cur) => new Set([...cur].filter((x) => !pathTo(pages, id).some((p) => p.id === x))));
    onOpen(id);
  };
  const create = (parentId: string) => {
    /* Пока предыдущая создаётся — не заводить ещё одну. */
    if (actions.creating) return;
    if (parentId) expand(parentId);
    onOpen(actions.create(parentId));
  };
  /** Удаление с вложенными; открытая среди них — уходим к родителю. */
  const remove = (page: KbPage) => {
    const ids = [page.id, ...descendantsOf(pages, page.id)];
    if (current && ids.includes(current.id)) onOpen(page.parentId || (childrenOf(pages, "").find((p) => p.id !== page.id)?.id ?? ""));
    actions.remove(ids);
    setDeleting(null);
  };
  const copyLink = (page: KbPage) => {
    const url = new URL(window.location.href);
    url.searchParams.set("doc", page.id);
    void navigator.clipboard.writeText(url.toString()).then(() => toast.success(t("kb.linkCopied")));
  };
  /** `kbMenu` прототипа: у строки дерева и в полосе страницы. */
  const menu = (page: KbPage) => (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button
          type="button"
          title={t("kb.actions")}
          aria-label={t("kb.actions")}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          className="grid size-5.5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-border"
        >
          <Icon as={MoreHorizontalIcon} size={14} />
        </button>
      )}
    >
      {(close) => {
        const run = (action: () => void) => () => {
          close();
          action();
        };
        return (
          <div className="w-56 p-1">
            {can.write && (
              <>
                <PopoverItem icon={<Icon as={FilePlusIcon} size={15} />} onClick={run(() => create(page.id))}>
                  {t("kb.addSub")}
                </PopoverItem>
                <PopoverItem icon={<Icon as={CopyIcon} size={15} />} onClick={run(() => onOpen(actions.duplicate(page, t("kb.copySuffix"))))}>
                  {t("kb.duplicate")}
                </PopoverItem>
              </>
            )}
            {can.update && (
              <PopoverItem icon={<Icon as={FolderInputIcon} size={15} />} onClick={run(() => setMoving(page))}>
                {t("kb.move")}
              </PopoverItem>
            )}
            <PopoverItem icon={<Icon as={LinkIcon} size={15} />} onClick={run(() => copyLink(page))}>
              {t("kb.copyLink")}
            </PopoverItem>
            {can.delete && (
              <>
                <PopoverSeparator />
                <PopoverItem danger icon={<Icon as={Trash2Icon} size={15} />} onClick={run(() => setDeleting(page))}>
                  {t("action.delete")}
                </PopoverItem>
              </>
            )}
          </div>
        );
      }}
    </Popover>
  );
  const isOpen = (id: string) => !closed.has(id) && (open.has(id) || path.some((p) => p.id === id));
  const toggle = (id: string) => {
    if (!isOpen(id)) return expand(id);
    setOpen((cur) => without(cur, id));
    setClosed((cur) => new Set(cur).add(id));
  };

  const row = (page: KbPage, depth: number): ReactNode => {
    const kids = childrenOf(pages, page.id).filter((k) => !found || found.has(k.id));
    const expanded = Boolean(found) || isOpen(page.id);
    return (
      <div key={page.id}>
        <div
          role="treeitem"
          aria-selected={page.id === current?.id}
          aria-expanded={kids.length ? expanded : undefined}
          onClick={() => go(page.id)}
          style={{ paddingLeft: 6 + depth * 16 }}
          className="group flex h-7.5 cursor-pointer items-center gap-1 rounded-md pr-1 text-[13.5px] text-fg-muted hover:bg-surface-hover aria-selected:bg-surface-hover aria-selected:font-medium aria-selected:text-fg"
        >
          {kids.length ? (
            <button
              type="button"
              aria-label={t(expanded ? "tree.collapse" : "tree.expand")}
              onClick={(event) => {
                event.stopPropagation();
                toggle(page.id);
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-border"
            >
              <Icon as={ChevronRightIcon} size={13} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <span className="w-5 shrink-0 text-center">{page.icon || DEFAULT_ICON}</span>
          <span className="min-w-0 flex-1 truncate">{page.title || t("kb.untitled")}</span>
          <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">{menu(page)}</span>
          {can.write && <button
            type="button"
            title={t("kb.addSub")}
            aria-label={t("kb.addSub")}
            disabled={actions.creating}
            onClick={(event) => {
              event.stopPropagation();
              create(page.id);
            }}
            className="grid size-5.5 shrink-0 place-items-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-border focus-visible:opacity-100"
          >
            <Icon as={PlusIcon} size={13} />
          </button>}
        </div>
        {kids.length > 0 && expanded && kids.map((kid) => row(kid, depth + 1))}
      </div>
    );
  };

  const roots = childrenOf(pages, "").filter((p) => !found || found.has(p.id));

  return (
    <div className="flex min-h-0 flex-1">
      {/* `.kb-side` прототипа. */}
      <aside className="flex w-[268px] shrink-0 flex-col border-r border-border max-md:hidden">
        <label className="mx-2.5 mt-2.5 mb-1.5 flex h-8 items-center gap-2 rounded-md border border-border-strong px-2.5 text-sm focus-within:border-accent">
          <Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("kb.search")}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
          />
        </label>
        <div role="tree" className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          {loading ? (
            <p className="p-3 text-sm text-fg-subtle">{t("common.loading")}</p>
          ) : roots.length ? (
            roots.map((p) => row(p, 0))
          ) : (
            <p className="p-3 text-sm text-fg-subtle">{t(found ? "kb.notFound" : "kb.empty")}</p>
          )}
        </div>
        {can.write && <button
          type="button"
          disabled={actions.creating}
          onClick={() => create("")}
          className="flex h-10 items-center gap-2 border-t border-border px-4 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-50"
        >
          <Icon as={FilePlusIcon} size={15} />
          {t("kb.newPage")}
        </button>}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {current ? (
          <Page
            key={current.id}
            page={current}
            path={path}
            pages={pages}
            editable={can.update}
            creating={actions.creating}
            menu={menu(current)}
            onOpen={go}
            onCreate={create}
          />
        ) : (
          !loading && <p className="p-8 text-center text-sm text-fg-subtle">{t("kb.empty")}</p>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={t("kb.deleteTitle", { title: deleting.title || t("kb.untitled") })}
          description={
            descendantsOf(pages, deleting.id).length
              ? t("kb.deleteWithKids", { count: descendantsOf(pages, deleting.id).length })
              : t("kb.deleteOne")
          }
          confirmLabel={t("action.delete")}
          busy={false}
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {moving && (
        <MoveDialog
          page={moving}
          pages={pages}
          onMove={(parentId) => {
            actions.save(moving.id, { parentId });
            if (parentId) expand(parentId);
            setMoving(null);
          }}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

/** «Переместить в…» — `kbMove()` прототипа: родитель из дерева без своей ветки. */
function MoveDialog({
  page,
  pages,
  onMove,
  onClose,
}: {
  page: KbPage;
  pages: KbPage[];
  onMove: (parentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [parent, setParent] = useState(page.parentId);
  /* Себя и своих потомков в родители не выбрать — получился бы цикл. */
  const own = new Set([page.id, ...descendantsOf(pages, page.id)]);
  const options: { id: string; label: string }[] = [];
  const walk = (parentId: string, depth: number) =>
    childrenOf(pages, parentId).forEach((p) => {
      if (own.has(p.id)) return;
      options.push({ id: p.id, label: `${"\u00a0\u00a0\u00a0".repeat(depth)}${p.icon || DEFAULT_ICON} ${p.title || t("kb.untitled")}` });
      walk(p.id, depth + 1);
    });
  walk("", 0);

  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <h2 className="text-lg font-semibold">{t("kb.moveTitle", { title: page.title || t("kb.untitled") })}</h2>
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          {t("kb.parent")}
          <select
            value={parent}
            onChange={(event) => setParent(event.target.value)}
            className="h-(--spacing-input) rounded-md border border-border-strong bg-input px-2 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">{t("kb.topLevel")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={parent === page.parentId} onClick={() => onMove(parent)}>
            {t("kb.moveAction")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Страница справа — `kbDoc()` прототипа. */
function Page({
  page,
  path,
  pages,
  editable,
  creating,
  menu,
  onOpen,
  onCreate,
}: {
  page: KbPage;
  path: KbPage[];
  pages: KbPage[];
  editable: boolean;
  creating: boolean;
  menu: ReactNode;
  onOpen: (id: string) => void;
  onCreate: (parentId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const actions = useKbActions();
  const [title, setTitle] = useState(page.title);
  const kids = childrenOf(pages, page.id);
  const doc = useMemo(() => toDoc(page.content), [page.content]);
  const updated = formatDate(page.updatedAt, "date", i18n.language);

  /*
   * Автосохранение, как `touch()` прототипа: правки копятся и уходят
   * одним запросом через 0,6 с тишины; уход со страницы — сразу.
   */
  const pending = useRef<{ title?: string; content?: KbDoc }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saved, setSaved] = useState(false);
  const flush = useRef(() => {});
  flush.current = () => {
    clearTimeout(timer.current);
    const values = pending.current;
    pending.current = {};
    if (!Object.keys(values).length) return;
    actions.save(page.id, values);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), 1500);
  };
  const queue = (values: { title?: string; content?: KbDoc }) => {
    pending.current = { ...pending.current, ...values };
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 600);
  };
  useEffect(() => () => flush.current(), []);

  return (
    <>
      {/* `.kd-top`: крошки. */}
      <div className="sticky top-0 z-10 flex h-11 items-center gap-1 bg-surface px-5 text-[13px] text-fg-muted">
        <span className="order-last ml-auto flex items-center gap-2 pl-3 text-xs text-fg-subtle">
          {saved ? t("kb.saved") : ""}
          {menu}
        </span>
        {path.map((p, at) => (
          <span key={p.id} className="flex min-w-0 items-center gap-1">
            {at > 0 && <span className="text-fg-subtle">/</span>}
            <button type="button" onClick={() => onOpen(p.id)} className="max-w-56 truncate rounded px-1 py-0.5 hover:bg-surface-hover hover:text-fg">
              {p.icon || DEFAULT_ICON} {p.title || t("kb.untitled")}
            </button>
          </span>
        ))}
      </div>

      {/* `.kd`: колонка текста. */}
      <article className="mx-auto max-w-[760px] px-12 pt-8 pb-24 max-md:px-5">
        <Popover
          trigger={({ toggle }) => (
            <button
              type="button"
              title={t("kb.icon")}
              disabled={!editable}
              onClick={toggle}
              className="-ml-1 grid size-14 place-items-center rounded-lg text-[44px] leading-none hover:bg-surface-hover"
            >
              {page.icon || DEFAULT_ICON}
            </button>
          )}
        >
          {(close) => (
            <div className="w-[290px] p-2">
              <div className="px-1 pb-1.5 text-xs text-fg-subtle">{t("kb.icon")}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      actions.save(page.id, { icon: emoji });
                      close();
                    }}
                    className="grid size-8 place-items-center rounded-md text-xl hover:bg-surface-hover"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover>

        <input
          value={title}
          readOnly={!editable}
          onChange={(event) => {
            setTitle(event.target.value);
            queue({ title: event.target.value.trim() });
          }}
          /* Enter — к тексту, как в прототипе: заголовок одной строкой. */
          onKeyDown={(event) => event.key === "Enter" && (document.querySelector<HTMLElement>(".kb-body")?.focus(), event.preventDefault())}
          placeholder={t("kb.untitled")}
          className="mt-2 w-full bg-transparent text-[34px] leading-tight font-bold tracking-[-0.01em] outline-none placeholder:text-fg-subtle"
        />
        <div className="mt-1.5 mb-5 text-[13px] text-fg-subtle">
          {[updated && t("kb.updated", { date: updated }), page.author].filter(Boolean).join(" · ")}
        </div>

        <Suspense fallback={null}>
          <KbEditor doc={doc} editable={editable} placeholder={t("kb.placeholder")} onChange={(content) => queue({ content })} />
        </Suspense>

        {/* `.kd-kids`: подстраницы. */}
        {kids.length > 0 && (
          <div className="mt-6 flex flex-col gap-1 border-t border-border pt-4">
            {kids.map((kid) => (
              <button
                key={kid.id}
                type="button"
                onClick={() => onOpen(kid.id)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] hover:bg-surface-hover"
              >
                <span>{kid.icon || DEFAULT_ICON}</span>
                <span className="min-w-0 flex-1 truncate underline decoration-border-strong underline-offset-4">{kid.title || t("kb.untitled")}</span>
                <Icon as={ChevronRightIcon} size={15} className="text-fg-subtle" />
              </button>
            ))}
          </div>
        )}
        {editable && <button
          type="button"
          disabled={creating}
          onClick={() => onCreate(page.id)}
          className="mt-3 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-subtle hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={PlusIcon} size={15} />
          {t("kb.addSub")}
        </button>}
      </article>
    </>
  );
}
