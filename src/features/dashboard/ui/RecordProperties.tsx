import { useState } from "react";
import { EyeIcon, EyeOffIcon, GripVerticalIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fieldIcon } from "@/features/item";
import { localized, type Field } from "@/features/table";
import { moveBefore } from "@/shared/lib/order";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Popover } from "@/shared/ui/popover";

/** Same searchable eye/handle controls as Omni4 Properties, restricted to permitted fields. */
export function RecordProperties({ fields, selected, language, onChange }: { fields: Field[]; selected: string[]; language: string; onChange: (slugs: string[]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const visible = selected.filter((slug) => fields.some((field) => field.slug === slug));
  const ordered = [...visible, ...fields.map((field) => field.slug).filter((slug) => !visible.includes(slug))];
  const label = (field: Field) => localized(field.labels, language, field.label);
  const move = (slug: string, delta: number) => {
    const next = [...visible], from = next.indexOf(slug), to = from + delta;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!]; onChange(next);
  };
  return <Popover className="w-full" trigger={({ open, toggle }) => <Button type="button" variant="secondary" className="w-full justify-start" aria-expanded={open} onClick={toggle}><Icon as={SlidersHorizontalIcon} size={15} />{t("view.columns")}<span className="ml-auto text-xs text-fg-muted">{visible.length}</span></Button>}>
    {() => <div className="flex w-80 max-w-full flex-col" aria-label={t("view.columns")}>
      <header className="flex items-center justify-between gap-2 px-2.5 py-1.5"><span className="text-sm font-medium">{t("view.columns")}</span><button type="button" className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface-hover hover:text-fg" onClick={() => onChange(ordered)}>{t("view.showAll")}</button></header>
      <div className="px-2 pb-2"><Input aria-label={t("table.searchField")} placeholder={t("table.searchField")} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="min-h-0 max-h-64 overflow-auto px-1">
        {ordered.map((slug) => fields.find((field) => field.slug === slug)!).filter((field) => label(field).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((field) => {
          const shown = visible.includes(field.slug), name = label(field);
          return <div key={field.slug} data-field={field.slug} draggable={shown && !search} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/plain", field.slug); setDragged(field.slug); }} onDragEnd={() => { setDragged(null); setOver(null); }} onDragOver={(event) => { if (shown && dragged && !search) { event.preventDefault(); event.stopPropagation(); setOver(field.slug); } }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (shown && dragged && !search) onChange(moveBefore(visible, dragged, field.slug)); setDragged(null); setOver(null); }} className={`flex h-8 items-center gap-2 rounded-md px-2.5 text-sm ${shown ? "text-fg" : "text-fg-subtle"} ${dragged === field.slug ? "opacity-40" : over === field.slug && dragged ? "bg-accent-subtle" : "hover:bg-surface-hover"}`}>
            <button type="button" disabled={!shown || Boolean(search)} aria-label={`${t("view.moveColumn")}: ${name}`} title={t("view.moveColumn")} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(field.slug, event.key === "ArrowUp" ? -1 : 1); } }} className="grid size-5 shrink-0 cursor-grab place-items-center text-fg-subtle disabled:opacity-30"><Icon as={GripVerticalIcon} size={14} /></button>
            <Icon as={fieldIcon(field.type)} size={16} className="shrink-0 text-fg-subtle" /><span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
            <button type="button" aria-label={`${t(shown ? "view.hideColumn" : "view.showColumn")}: ${name}`} title={t(shown ? "view.hideColumn" : "view.showColumn")} aria-pressed={shown} onClick={() => onChange(shown ? visible.filter((slug) => slug !== field.slug) : [...visible, field.slug])} className="grid size-6 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-active hover:text-fg"><Icon as={shown ? EyeIcon : EyeOffIcon} size={14} /></button>
          </div>;
        })}
      </div>
    </div>}
  </Popover>;
}
