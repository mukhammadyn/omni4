import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon, MoveHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Cell, nextSorts, type Item, type Sort } from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ResizeHandle } from "@/shared/ui/resize-handle";
import { Icon } from "@/shared/ui/icon";
import type { Widget } from "../model/dashboard";
import { fitRecordWidths } from "../model/widget-editor";

export function RecordsTable({ widget, fields, relations, rows, count, page, sorts, language, editing, onPage, onSorts, onChange }: {
  widget: Widget; fields: Field[]; relations: Relation[]; rows: Item[]; count: number; page: number; sorts: Sort[];
  language: string; editing: boolean; onPage: (page: number) => void; onSorts: (sorts: Sort[]) => void; onChange: (patch: Partial<Widget>) => void;
}) {
  const { t, i18n } = useTranslation();
  const context = JSON.stringify([widget.id, widget.tableSlug, widget.columnWidths, editing]);
  const [viewerWidths, setViewerWidths] = useState<{ context: string; values: Record<string, number> }>({ context, values: {} });
  const [previewWidth, setPreviewWidth] = useState<{ slug: string; values: Record<string, number> } | null>(null);
  useEffect(() => { setViewerWidths({ context, values: {} }); setPreviewWidth(null); }, [context]);
  const widths = !editing && viewerWidths.context === context ? viewerWidths.values : {};
  const [opened, setOpened] = useState<Item | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const bySlug = new Map(fields.map((field) => [field.slug, field]));
  const columns = (widget.columns ?? fields.slice(0, 5).map((f) => f.slug)).flatMap((slug) => bySlug.has(slug) ? [bySlug.get(slug)!] : []);
  const scroll = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const slugs = columns.map((field) => field.slug);
  const fitted = fitRecordWidths(slugs, previewWidth?.values ?? { ...widget.columnWidths, ...widths }, available, previewWidth?.slug);
  const byRelation = new Map(relations.map((relation) => [relation.id, relation]));
  const currencyVisible = fields.some((field) => field.slug === "currency");
  const limit = widget.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(count / limit));
  const close = () => { setOpened(null); opener.current?.focus(); };
  const resize = (slug: string, width: number) => {
    const values = fitRecordWidths(slugs, { ...fitted, [slug]: width }, available, slug);
    if (editing) onChange({ columnWidths: { ...widget.columnWidths, ...values } });
    else setViewerWidths({ context, values });
  };
  const widthOf = (slug: string) => fitted[slug] ?? 160;
  const overflow = columns.reduce((sum, field) => sum + widthOf(field.slug), 44) > available + 1;
  return <>
    <div ref={scroll} data-record-scroll className="min-h-0 min-w-0 flex-1 overflow-auto">
      <table style={{ width: columns.reduce((sum, field) => sum + widthOf(field.slug), 44), minWidth: "100%" }} className="table-fixed border-collapse text-sm">
        <colgroup>{columns.map((field) => <col key={field.slug} style={{ width: widthOf(field.slug) }} />)}<col style={{ width: 44 }} /></colgroup>
        <thead><tr>{columns.map((field) => <RecordsColumn key={field.slug} field={field} language={language} width={widthOf(field.slug)} sorts={sorts} onSort={() => { onSorts(nextSorts(sorts, field.slug)); onPage(1); }} onPreview={(width) => setPreviewWidth({ slug: field.slug, values: { ...fitted, [field.slug]: width } })} onCancel={() => setPreviewWidth(null)} onResize={(width) => { setPreviewWidth(null); resize(field.slug, width); }} />)}<th scope="col" className="sticky top-0 z-10 border-b border-border bg-surface-soft"><span className="sr-only">{t("dashboard.openRecord")}</span></th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={String(row.guid ?? index)} className="hover:bg-surface-hover">
          {columns.map((field) => <td key={field.slug} className="h-row overflow-hidden border-b border-border px-2"><div className="flex items-center gap-1 overflow-hidden"><Cell field={field} row={row} tableSlug={widget.tableSlug} relations={byRelation} locale={i18n.language} language={language} />{(field.type === "MONEY" || /amount|salary|price|cost/i.test(field.slug)) && currencyVisible && row.currency !== undefined && <small className="shrink-0 text-fg-muted">{String(row.currency)}</small>}</div></td>)}
          <td className="border-b border-border text-center"><button type="button" aria-label={t("dashboard.openRecord")} onClick={(event) => { opener.current = event.currentTarget; setOpened(row); }} className="rounded px-2 py-1 text-fg-muted hover:bg-surface-hover"><Icon as={ArrowUpRightIcon} size={14} /></button></td>
        </tr>)}{!rows.length && <tr><td colSpan={columns.length + 1} className="p-6 text-center text-fg-muted">{t("pivot.empty")}</td></tr>}</tbody>
      </table>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2 text-xs text-fg-muted">
      <span>{t("dashboard.recordCount", { count })} · {Math.min(page, pages)} / {pages}</span>
      <div className="flex gap-1">{overflow && <Button type="button" size="sm" variant="ghost" aria-label={t("dashboard.horizontalScroll")} title={t("dashboard.horizontalScroll")} onClick={() => { const element = scroll.current; if (element) element.scrollTo({ left: element.scrollLeft >= element.scrollWidth - element.clientWidth - 1 ? 0 : Math.min(element.scrollLeft + element.clientWidth / 2, element.scrollWidth), behavior: "smooth" }); }}><Icon as={MoveHorizontalIcon} size={14} /></Button>}<Button type="button" size="sm" variant="secondary" aria-label={t("table.prevPage")} disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon as={ChevronLeftIcon} size={14} /></Button><Button type="button" size="sm" variant="secondary" aria-label={t("table.nextPage")} disabled={page >= pages} onClick={() => onPage(page + 1)}><Icon as={ChevronRightIcon} size={14} /></Button></div>
    </div>
    {opened && <ReadRecord row={opened} widget={widget} fields={fields} relations={byRelation} language={language} onClose={close} />}
  </>;
}

/** Opens only an already-authorized get-list item; no mutation controls. */
function ReadRecord({ row, widget, fields, relations, language, onClose }: { row: Item; widget: Widget; fields: Field[]; relations: Map<string, Relation>; language: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const button = dialog.current?.querySelector<HTMLButtonElement>("button"); button?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const targets = [...(dialog.current?.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex='0']") ?? [])];
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, []);
  return <Modal onClose={onClose}><div ref={dialog} role="dialog" aria-modal="true" aria-label={t("dashboard.openRecord")} className="max-h-[85vh] w-[640px] max-w-full overflow-auto rounded-xl border border-border bg-surface p-5 shadow-modal">
    <header className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{t("dashboard.openRecord")}</h3><Button type="button" variant="secondary" size="sm" onClick={onClose}>{t("action.close")}</Button></header>
    <dl className="grid gap-3">{fields.map((field) => <div key={field.slug} className="grid grid-cols-[140px_1fr] gap-3"><dt className="text-sm text-fg-muted">{localized(field.labels, language, field.label)}</dt><dd className="min-w-0 text-sm"><Cell field={field} row={row} tableSlug={widget.tableSlug} relations={relations} locale={i18n.language} language={language} wrap /></dd></div>)}</dl>
  </div></Modal>;
}

function RecordsColumn({ field, language, width, sorts, onSort, onResize, onPreview, onCancel }: { field: Field; language: string; width: number; sorts: Sort[]; onSort: () => void; onResize: (width: number) => void; onPreview: (width: number) => void; onCancel: () => void }) {
  const { t } = useTranslation(), target = useRef<HTMLTableCellElement>(null);
  const label = localized(field.labels, language, field.label);
  return <th ref={target} scope="col" aria-sort={sorts[0]?.field === field.slug ? sorts[0].direction === "asc" ? "ascending" : "descending" : "none"} className="sticky top-0 z-10 border-b border-border bg-surface-soft px-2 py-2 text-left">
    <button type="button" disabled={field.slug === "created_at"} title={field.slug === "created_at" ? t("dashboard.creationSortBlocked") : undefined} onClick={onSort} className="flex w-full items-center gap-1 text-left font-medium disabled:cursor-default"><span className="min-w-0 flex-1 truncate">{label}</span>{sorts[0]?.field === field.slug && <Icon as={sorts[0].direction === "asc" ? ArrowUpIcon : ArrowDownIcon} size={13} />}</button>
    <ResizeHandle edge="right" target={target} value={width} min={80} max={Math.max(600, width)} label={t("dashboard.columnWidth", { field: label })} controlled onDrag={onPreview} onCancel={onCancel} onCommit={onResize} />
  </th>;
}
