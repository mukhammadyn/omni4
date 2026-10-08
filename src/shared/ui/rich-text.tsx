import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import {
  BoldIcon,
  CheckIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UnlinkIcon,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Icon } from "@/shared/ui/icon";

/*
 * Текст с разметкой — значение MULTI_LINE. В колонке HTML: так его пишет
 * старая админка (ReactQuill), и так он уже лежит в данных. Почему tiptap,
 * а не своё поле на contentEditable — docs/adr/0015-rich-text-tiptap.md.
 *
 * Только для чтения — тот же редактор без правки: показать HTML как есть
 * через innerHTML нельзя, это чужая разметка из базы. Схема редактора
 * выбрасывает всё, чего не знает, — скрипты и обработчики в том числе,
 * а ссылки с `javascript:` не пропускает расширение ссылок.
 */

/** Оформление содержимого: стилей у tiptap нет, они наши. */
const CONTENT =
  "text-sm leading-relaxed outline-none [&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_code]:rounded-[4px] [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:text-[0.92em] [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-0.5 [&_h3]:text-[15px] [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-h-96 [&_img]:max-w-full [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-accent [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-fg-subtle [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]";

/** Пустой документ tiptap отдаёт как `<p></p>` — в базу это пустое значение. */
const toValue = (editor: Editor) => (editor.isEmpty ? "" : editor.getHTML());

export function RichText({
  value,
  onChange,
  onUpload,
  placeholder = "",
  readOnly = false,
  autoFocus = false,
}: {
  value: string;
  onChange?: (html: string) => void;
  /**
   * Загрузить картинку и вернуть её адрес. Хранилище — забота вызывающего:
   * `shared` не знает ручек. Не задано — кнопки картинки нет.
   */
  onUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        /* В правке щелчок по ссылке ставит курсор, а не уводит со страницы. */
        link: { openOnClick: readOnly, autolink: true, defaultProtocol: "https" },
      }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { class: `${CONTENT} ${readOnly ? "" : "min-h-40 px-3.5 py-3"}` } },
    onUpdate: ({ editor: e }) => onChange?.(toValue(e)),
  });

  /* Значение сменилось снаружи (пришёл ответ, открыли другую запись) —
     в редактор. Своё же эхо пропускаем: setContent сбросил бы курсор.
     Уничтоженный — пропускаем: React переподключает эффекты (StrictMode,
     Suspense) уже после того, как useEditor снёс редактор, и getHTML падает. */
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== toValue(editor))
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (readOnly) return <EditorContent editor={editor} />;

  return (
    <div className="overflow-hidden rounded-md border border-border-strong bg-input transition-colors focus-within:border-accent">
      {editor && <Toolbar editor={editor} onUpload={onUpload} />}
      <EditorContent editor={editor} />
    </div>
  );
}

type Tool = { icon: LucideIcon; label: TranslationKey; run: (e: Editor) => void; on?: (e: Editor) => boolean };

/** Набор `.vf-tb` прототипа; ссылка и картинка — отдельно, им нужен ввод. */
const TOOLS: (Tool | "|")[] = [
  { icon: BoldIcon, label: "richText.bold", run: (e) => e.chain().focus().toggleBold().run(), on: (e) => e.isActive("bold") },
  { icon: ItalicIcon, label: "richText.italic", run: (e) => e.chain().focus().toggleItalic().run(), on: (e) => e.isActive("italic") },
  {
    icon: UnderlineIcon,
    label: "richText.underline",
    run: (e) => e.chain().focus().toggleUnderline().run(),
    on: (e) => e.isActive("underline"),
  },
  { icon: StrikethroughIcon, label: "richText.strike", run: (e) => e.chain().focus().toggleStrike().run(), on: (e) => e.isActive("strike") },
  "|",
  {
    icon: Heading2Icon,
    label: "richText.heading",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    on: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    icon: Heading3Icon,
    label: "richText.subheading",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    on: (e) => e.isActive("heading", { level: 3 }),
  },
  { icon: ListIcon, label: "richText.bullets", run: (e) => e.chain().focus().toggleBulletList().run(), on: (e) => e.isActive("bulletList") },
  {
    icon: ListOrderedIcon,
    label: "richText.numbers",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    on: (e) => e.isActive("orderedList"),
  },
  "|",
  { icon: QuoteIcon, label: "richText.quote", run: (e) => e.chain().focus().toggleBlockquote().run(), on: (e) => e.isActive("blockquote") },
  { icon: RemoveFormattingIcon, label: "richText.clear", run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
];

const toolClass =
  "grid size-7 place-items-center rounded-[5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg aria-pressed:bg-surface-active aria-pressed:text-fg disabled:opacity-40";

/* Не уводить фокус из текста: иначе кнопка сработает без выделения. */
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

function Toolbar({ editor, onUpload }: { editor: Editor; onUpload?: ((file: File) => Promise<string>) | undefined }) {
  const { t } = useTranslation();
  /* Подсветка кнопок — по выделению: перерисовываемся на каждую его смену. */
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      on: TOOLS.map((tool) => (tool !== "|" && tool.on ? tool.on(e) : false)),
      link: e.isActive("link"),
    }),
  });
  /* Адрес ссылки правится строкой под панелью, а не окном: окно браузера
     (prompt) блокирует страницу и выглядит чужим. null — строка закрыта. */
  const [href, setHref] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const applyLink = () => {
    const raw = href?.trim() ?? "";
    /* «example.com» без схемы браузер прочтёт как путь на нашем сайте. */
    const url = !raw || /^[a-z][\w+.-]*:|^[/#]/i.test(raw) ? raw : `https://${raw}`;
    const chain = editor.chain().focus().extendMarkRange("link");
    (url ? chain.setLink({ href: url }) : chain.unsetLink()).run();
    setHref(null);
  };

  const upload = async (picked: File | undefined) => {
    if (!picked || !onUpload) return;
    setUploading(true);
    try {
      const src = await onUpload(picked);
      if (src) editor.chain().focus().setImage({ src, alt: picked.name }).run();
    } catch {
      /* Об ошибке сообщает тот, кто грузил (onUpload): он знает ручку. */
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        {TOOLS.map((tool, at) =>
          tool === "|" ? (
            <span key={at} className="mx-1 h-4.5 w-px bg-border-strong" />
          ) : (
            <button
              key={tool.label}
              type="button"
              title={t(tool.label)}
              aria-label={t(tool.label)}
              aria-pressed={tool.on ? state.on[at] : undefined}
              onMouseDown={keepFocus}
              onClick={() => tool.run(editor)}
              className={toolClass}
            >
              <Icon as={tool.icon} size={15} />
            </button>
          ),
        )}
        <span className="mx-1 h-4.5 w-px bg-border-strong" />
        <button
          type="button"
          title={t("richText.link")}
          aria-label={t("richText.link")}
          aria-pressed={state.link || href !== null}
          onMouseDown={keepFocus}
          onClick={() => setHref(href === null ? String(editor.getAttributes("link").href ?? "") : null)}
          className={toolClass}
        >
          <Icon as={LinkIcon} size={15} />
        </button>
        {onUpload && (
          <>
            <button
              type="button"
              title={t("richText.image")}
              aria-label={t("richText.image")}
              disabled={uploading}
              onMouseDown={keepFocus}
              onClick={() => file.current?.click()}
              className={toolClass}
            >
              <Icon as={ImageIcon} size={15} />
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        )}
        {uploading && <span className="px-1 text-xs text-fg-subtle">{t("richText.uploading")}</span>}
      </div>

      {href !== null && (
        <form
          className="flex items-center gap-1.5 border-t border-border px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <Icon as={LinkIcon} size={14} className="shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              /* Escape закрывает строку, а не всё вокруг (ячейку, форму). */
              if (event.key === "Escape") {
                event.stopPropagation();
                event.nativeEvent.stopImmediatePropagation();
                setHref(null);
                editor.commands.focus();
              }
            }}
            placeholder="https://"
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
          {state.link && (
            <button
              type="button"
              title={t("richText.unlink")}
              aria-label={t("richText.unlink")}
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setHref(null);
              }}
              className={toolClass}
            >
              <Icon as={UnlinkIcon} size={15} />
            </button>
          )}
          <button type="submit" title={t("action.apply")} aria-label={t("action.apply")} className={toolClass}>
            <Icon as={CheckIcon} size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
