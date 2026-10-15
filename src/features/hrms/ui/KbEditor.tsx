import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import type { KbDoc } from "../model/kb";

/*
 * Тело страницы базы знаний — tiptap (ADR-0015), как MULTI_LINE, но
 * документом JSON и с блоками Notion из прототипа (knowledge.html):
 * таблица, чек-лист. Оформление — наше, токенами; `.kd-body` прототипа.
 */
const BODY =
  "kb-body text-[15px] leading-[1.65] outline-none " +
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
  "[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-2 [&_li[data-type=taskItem]>label]:mt-[5px] " +
  "[&_li[data-checked=true]>div]:text-fg-subtle [&_li[data-checked=true]>div]:line-through " +
  "[&_.tableWrapper]:my-3 [&_.tableWrapper]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm " +
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-surface-hover [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold " +
  "[&>*:first-child]:mt-0 " +
  "[&_.is-empty:first-child]:before:pointer-events-none [&_.is-empty:first-child]:before:float-left [&_.is-empty:first-child]:before:h-0 [&_.is-empty:first-child]:before:text-fg-subtle [&_.is-empty:first-child]:before:content-[attr(data-placeholder)]";

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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !editable, autolink: true, defaultProtocol: "https" },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: doc,
    editable,
    editorProps: { attributes: { class: BODY } },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON() as KbDoc),
  });

  return <EditorContent editor={editor} />;
}
