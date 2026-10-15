import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, FilePlusIcon, PlusIcon, SearchIcon } from "lucide-react";
import { formatDate } from "@/shared/lib/date-value";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { useKbActions, useKbPages } from "../api/kb";
import { childrenOf, docText, pathTo, toDoc, type KbPage } from "../model/kb";

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
  const [query, setQuery] = useState("");
  /* Раскрытые и свёрнутые руками. Ветка к открытой странице раскрыта
     сама, пока её не свернули. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());

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
    if (parentId) expand(parentId);
    onOpen(actions.create(parentId));
  };
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
          <button
            type="button"
            title={t("kb.addSub")}
            aria-label={t("kb.addSub")}
            onClick={(event) => {
              event.stopPropagation();
              create(page.id);
            }}
            className="grid size-5.5 shrink-0 place-items-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-border focus-visible:opacity-100"
          >
            <Icon as={PlusIcon} size={13} />
          </button>
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
        <button
          type="button"
          onClick={() => create("")}
          className="flex h-10 items-center gap-2 border-t border-border px-4 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={FilePlusIcon} size={15} />
          {t("kb.newPage")}
        </button>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {current ? (
          <Page key={current.id} page={current} path={path} pages={pages} onOpen={go} onCreate={create} />
        ) : (
          !loading && <p className="p-8 text-center text-sm text-fg-subtle">{t("kb.empty")}</p>
        )}
      </div>
    </div>
  );
}

/** Страница справа — `kbDoc()` прототипа. */
function Page({
  page,
  path,
  pages,
  onOpen,
  onCreate,
}: {
  page: KbPage;
  path: KbPage[];
  pages: KbPage[];
  onOpen: (id: string) => void;
  onCreate: (parentId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const actions = useKbActions();
  const [title, setTitle] = useState(page.title);
  const kids = childrenOf(pages, page.id);
  const doc = useMemo(() => toDoc(page.content), [page.content]);
  const updated = formatDate(page.updatedAt, "date", i18n.language);

  return (
    <>
      {/* `.kd-top`: крошки. */}
      <div className="sticky top-0 z-10 flex h-11 items-center gap-1 bg-surface px-5 text-[13px] text-fg-muted">
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
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() !== page.title && actions.save(page.id, { title: title.trim() })}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          placeholder={t("kb.untitled")}
          className="mt-2 w-full bg-transparent text-[34px] leading-tight font-bold tracking-[-0.01em] outline-none placeholder:text-fg-subtle"
        />
        <div className="mt-1.5 mb-5 text-[13px] text-fg-subtle">
          {[updated && t("kb.updated", { date: updated }), page.author].filter(Boolean).join(" · ")}
        </div>

        <Suspense fallback={null}>
          <KbEditor doc={doc} editable={false} placeholder={t("kb.placeholder")} />
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
        <button
          type="button"
          onClick={() => onCreate(page.id)}
          className="mt-3 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-subtle hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={PlusIcon} size={15} />
          {t("kb.addSub")}
        </button>
      </article>
    </>
  );
}
