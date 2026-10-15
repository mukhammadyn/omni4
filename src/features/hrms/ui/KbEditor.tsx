import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Extension, Node, type Editor, type Range } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import Suggestion from "@tiptap/suggestion";
import {
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LightbulbIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react";
import { useUploadFiles } from "@/features/item";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Icon } from "@/shared/ui/icon";
import type { KbDoc } from "../model/kb";

/*
 * Тело страницы базы знаний — tiptap (ADR-0015), как MULTI_LINE, но
 * документом JSON и с блоками Notion из прототипа (knowledge.html):
 * таблица, чек-лист, выноска, меню «/». Оформление — наше, токенами;
 * `.kd-body` прототипа.
 */
const BODY =
  "kb-body min-h-40 text-[15px] leading-[1.65] outline-none " +
  "[&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-fg [&_blockquote]:pl-3.5 " +
  "[&_code]:rounded-[4px] [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:text-[0.9em] " +
  "[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-surface-hover [&_pre]:p-3 " +
  "[&_h1]:mt-6 [&_h1]:mb-1 [&_h1]:text-[26px] [&_h1]:font-bold " +
  "[&_h2]:mt-5 [&_h2]:mb-1 [&_h2]:text-[21px] [&_h2]:font-semibold " +
  "[&_h3]:mt-4 [&_h3]:mb-0.5 [&_h3]:text-[17px] [&_h3]:font-semibold " +
  "[&_hr]:my-4 [&_hr]:border-border " +
  "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-accent " +
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:my-[3px] " +
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0.5 " +
  "[&_ul[data-type=taskList]>li]:flex [&_ul[data-type=taskList]>li]:gap-2 [&_ul[data-type=taskList]>li>label]:mt-[5px] [&_ul[data-type=taskList]>li>div]:min-w-0 [&_ul[data-type=taskList]>li>div]:flex-1 " +
  "[&_li[data-checked=true]>div]:text-fg-subtle [&_li[data-checked=true]>div]:line-through " +
  /* `.kb-callout`: значок слева, текст справа. */
  "[&_div[data-callout]]:my-2 [&_div[data-callout]]:flex [&_div[data-callout]]:gap-2.5 [&_div[data-callout]]:rounded-lg [&_div[data-callout]]:bg-surface-hover [&_div[data-callout]]:px-4 [&_div[data-callout]]:py-3 " +
  "[&_div[data-callout]]:before:content-['💡'] [&_div[data-callout]>div]:min-w-0 [&_div[data-callout]>div]:flex-1 " +
  "[&_.tableWrapper]:my-3 [&_.tableWrapper]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm " +
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-surface-hover [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold " +
  "[&_.selectedCell]:bg-accent-subtle [&>*:first-child]:mt-0 " +
  "[&_.is-empty:first-child]:before:pointer-events-none [&_.is-empty:first-child]:before:float-left [&_.is-empty:first-child]:before:h-0 [&_.is-empty:first-child]:before:text-fg-subtle [&_.is-empty:first-child]:before:content-[attr(data-placeholder)]";

/** Папка картинок в хранилище — та же, что у hrms: статьи пришли оттуда. */
const FOLDER = "knowledge-base";

/** Выноска `.kb-callout` прототипа: блоки в плашке со значком. */
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: () => ["div", { "data-callout": "" }, ["div", 0]],
});

type SlashItem = { id: string; icon: LucideIcon; label: TranslationKey; run: (editor: Editor) => void };

/** `SLASH` прототипа, тем же порядком; плюс картинка. */
const SLASH: SlashItem[] = [
  { id: "h2", icon: Heading2Icon, label: "kb.slash.h2", run: (e) => e.chain().focus().setNode("heading", { level: 2 }).run() },
  { id: "h3", icon: Heading3Icon, label: "kb.slash.h3", run: (e) => e.chain().focus().setNode("heading", { level: 3 }).run() },
  { id: "ul", icon: ListIcon, label: "kb.slash.ul", run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ol", icon: ListOrderedIcon, label: "kb.slash.ol", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "todo", icon: ListChecksIcon, label: "kb.slash.todo", run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", icon: QuoteIcon, label: "kb.slash.quote", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "callout", icon: LightbulbIcon, label: "kb.slash.callout", run: (e) => e.chain().focus().wrapIn("callout").run() },
  { id: "hr", icon: MinusIcon, label: "kb.slash.hr", run: (e) => e.chain().focus().setHorizontalRule().run() },
  {
    id: "table",
    icon: TableIcon,
    label: "kb.slash.table",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
  },
  /* Картинке нужен файл — его выбирает редактор (`pickImage`). */
  { id: "image", icon: ImageIcon, label: "kb.slash.image", run: () => {} },
];

type Menu = { items: SlashItem[]; rect: DOMRect | null; pick: (item: SlashItem) => void };

export default function KbEditor({
  doc,
  editable,
  placeholder,
  onChange,
}: {
  doc: KbDoc;
  editable: boolean;
  placeholder: string;
  onChange?: (doc: KbDoc) => void;
}) {
  const { t } = useTranslation();
  const upload = useUploadFiles();
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);
  /* Обработчики меню живут в плагине редактора и видят только ref. */
  const live = useRef({ menu, active });
  live.current = { menu, active };

  const label = (item: SlashItem) => t(item.label).toLowerCase();

  const slash = Extension.create({
    name: "slash",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: "/",
          items: ({ query }) => SLASH.filter((item) => label(item).includes(query.toLowerCase())),
          command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
            editor.chain().focus().deleteRange(range).run();
            if (props.id === "image") file.current?.click();
            else props.run(editor);
          },
          render: () => ({
            onStart: (p) => {
              setActive(0);
              setMenu({ items: p.items, rect: p.clientRect?.() ?? null, pick: (item) => p.command(item) });
            },
            onUpdate: (p) => {
              setActive(0);
              setMenu({ items: p.items, rect: p.clientRect?.() ?? null, pick: (item) => p.command(item) });
            },
            onKeyDown: ({ event }) => {
              const { menu: m, active: at } = live.current;
              if (!m?.items.length) return false;
              if (event.key === "ArrowDown") setActive((at + 1) % m.items.length);
              else if (event.key === "ArrowUp") setActive((at - 1 + m.items.length) % m.items.length);
              else if (event.key === "Enter") m.pick(m.items[at]!);
              else if (event.key === "Escape") setMenu(null);
              else return false;
              return true;
            },
            onExit: () => setMenu(null),
          }),
        }),
      ];
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        /* В правке щелчок по ссылке ставит курсор, а не уводит со страницы. */
        link: { openOnClick: !editable, autolink: true, defaultProtocol: "https" },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      Placeholder.configure({ placeholder }),
      slash,
    ],
    content: doc,
    editable,
    editorProps: { attributes: { class: BODY } },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON() as KbDoc),
  });

  const pickImage = (picked: File | undefined) => {
    if (!picked || !editor) return;
    upload.mutate(
      { files: [picked], folder: FOLDER },
      { onSuccess: ([src]) => src && editor.chain().focus().setImage({ src, alt: picked.name }).run() },
    );
  };

  return (
    <>
      <EditorContent editor={editor} />
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          pickImage(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {menu &&
        menu.rect &&
        menu.items.length > 0 &&
        createPortal(
          /* `#kbSlash` прототипа: под курсором, не шире 230px. */
          <div
            role="listbox"
            style={{ top: menu.rect.bottom + 6, left: Math.min(menu.rect.left, window.innerWidth - 240) }}
            className="fixed z-50 w-[230px] rounded-lg border border-border bg-surface p-1 shadow-lg"
          >
            <div className="px-2 pt-1 pb-1.5 text-xs text-fg-subtle">{t("kb.slash.title")}</div>
            {menu.items.map((item, at) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={at === active}
                /* Не уводить фокус из текста: команда работает по курсору. */
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(at)}
                onClick={() => menu.pick(item)}
                className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm aria-selected:bg-surface-hover"
              >
                <Icon as={item.icon} size={15} className="text-fg-muted" />
                {t(item.label)}
              </button>
            ))}
          </div>,
          document.body,
        )}
      {upload.isPending && <p className="mt-2 text-xs text-fg-subtle">{t("richText.uploading")}</p>}
    </>
  );
}
