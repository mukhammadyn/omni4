import { useId } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import type { DatasetTable } from "../model/datasets";
import { JOIN_KINDS, type JoinDraft, type JoinKind, type JoinStep } from "../model/sql-join-builder";

export function JoinIcon({ kind }: { kind: JoinKind }) {
  const id = useId().replaceAll(":", "");
  return <svg viewBox="0 0 28 22" width="28" height="22" aria-hidden="true"><defs><clipPath id={id}><circle cx="18" cy="11" r="7" /></clipPath></defs><g fill="currentColor" opacity=".45">{kind === "inner" ? <circle cx="10" cy="11" r="7" clipPath={`url(#${id})`} /> : <>{(kind === "left" || kind === "full") && <circle cx="10" cy="11" r="7" />}{(kind === "right" || kind === "full") && <circle cx="18" cy="11" r="7" />}</>}</g><g fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10" cy="11" r="7" /><circle cx="18" cy="11" r="7" /></g></svg>;
}

/** The selected table is already the first source. Aliases and output projections stay internal. */
export function SqlJoinBuilder({ catalog, plan, onChange }: { catalog: DatasetTable[]; plan: JoinDraft; onChange: (plan: JoinDraft) => void }) {
  const { i18n } = useTranslation(), ru = i18n.language.startsWith("ru"), uz = i18n.language.startsWith("uz");
  const text = (en: string, russian: string, uzbek: string) => ru ? russian : uz ? uzbek : en;
  const sources = [plan.base, ...plan.joins];
  const tableOf = (alias: string) => catalog.find((table) => table.slug === sources.find((source) => source.alias === alias)?.table);
  const fields = (alias: string) => tableOf(alias)?.fields ?? [];
  const changeJoin = (index: number, patch: Partial<JoinStep>) => onChange({ ...plan, joins: plan.joins.map((join, at) => at === index ? { ...join, ...patch } : join) });
  const tableItems = catalog.map((table) => ({ value: table.slug, label: table.label }));
  const add = () => {
    const base = catalog.find((table) => table.slug === plan.base.table), relation = base?.fields.find((field) => field.joinable && field.target && catalog.some((table) => table.slug === field.target));
    const target = catalog.find((table) => table.slug === relation?.target) ?? catalog.find((table) => table.slug !== plan.base.table);
    onChange({ ...plan, joins: [...plan.joins, { table: target?.slug ?? "", alias: `j${plan.joins.length + 1}`, kind: "left", from: plan.base.alias, left: relation?.slug ?? "", right: relation && target?.fields.some((field) => field.slug === "guid") ? "guid" : "" }] });
  };
  return <div className="flex min-w-0 flex-col gap-2" data-sql-joins>
    {plan.base.table && <p className="truncate text-sm font-medium">{catalog.find((table) => table.slug === plan.base.table)?.label}</p>}
    {plan.joins.map((join, index) => <div key={join.alias} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-1"><div role="group" aria-label={`JOIN ${index + 1}`} className="flex flex-1 gap-1">{JOIN_KINDS.map((kind) => <button key={kind} type="button" aria-label={`${kind.toUpperCase()} JOIN`} title={`${kind.toUpperCase()} JOIN`} aria-pressed={join.kind === kind} onClick={() => changeJoin(index, { kind })} className={`grid h-8 w-10 place-items-center rounded-md ${join.kind === kind ? "bg-accent-subtle text-accent-text" : "text-fg-muted hover:bg-surface-hover"}`}><JoinIcon kind={kind} /></button>)}</div><Button type="button" variant="ghost" size="sm" aria-label={text("Remove JOIN", "Удалить JOIN", "JOINni o‘chirish")} onClick={() => onChange({ ...plan, joins: plan.joins.slice(0, index) })}><Icon as={XIcon} size={14} /></Button></div>
      <Dropdown ariaLabel={`JOIN ${index + 1} table`} value={join.table} items={tableItems} onChange={(table) => changeJoin(index, { table, right: "" })} />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"><Dropdown ariaLabel={`JOIN ${index + 1} left field`} value={join.left} placeholder={text("Field", "Поле", "Maydon")} items={fields(join.from).map((field) => ({ value: field.slug, label: field.label }))} onChange={(left) => changeJoin(index, { left })} /><span className="text-xs text-fg-muted">=</span><Dropdown ariaLabel={`JOIN ${index + 1} right field`} value={join.right} placeholder={text("Field", "Поле", "Maydon")} items={fields(join.alias).map((field) => ({ value: field.slug, label: field.label }))} onChange={(right) => changeJoin(index, { right })} /></div>
    </div>)}
    {plan.joins.length === 0 && <Button type="button" size="sm" variant="secondary" disabled={!plan.base.table || catalog.length < 1} onClick={add}><Icon as={PlusIcon} size={14} />JOIN</Button>}
  </div>;
}
