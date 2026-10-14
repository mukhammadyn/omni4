import { useState } from "react";
import { XIcon, FilterIcon, SlidersHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { ChartCard, ChartRoles, FilterBar, chartTitle, filterKind, splittable, needsSplit } from "@/features/item";
import { localized, useTables, type Field as TableField, type Relation } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import { Modal } from "@/shared/ui/modal";
import { Popover } from "@/shared/ui/popover";
import { SelectMenu } from "@/shared/ui/select-menu";
import { useWidgetData } from "../api/widget-data";
import { useDashboardSchema } from "../api/schema";
import { resetWidgetSource } from "../model/widget-source";
import { widgetReady } from "../model/widget-advanced";
import { selectVisualization, visualizationOf } from "../model/widget-editor";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { filterKey, type Answer, type DashFilter, type FilterValues } from "../model/filters";
import { WidgetContents, WidgetStatus } from "./WidgetContents";
import { WidgetFields } from "./WidgetFields";
import { VisualizationPicker } from "./VisualizationPicker";

const noop = () => {};

/** One local draft, compact controls and a large real preview. No writes until dashboard Save. */
export function WidgetEditor({ initial, datasets, isNew, filters, values, menuId, onSave, onClose }: {
  initial: Widget; datasets: Dataset[]; filters: DashFilter[]; values: FilterValues; menuId: string;
  isNew: boolean; onSave: (widget: Widget) => void; onClose: () => void;
}) {
  const dialog = useDialogFocus(onClose);
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [draft, setDraft] = useState(initial);
  const [previewPage, setPreviewPage] = useState(1);
  const [custom, setCustom] = useState(() => Boolean(initial.title));
  const data = useWidgetData(draft, filters, values, menuId, {}, previewPage, draft.sorts ?? [], datasets);
  const { schema } = data;
  const tables = useTables("");
  const effectiveTable = data.dataset?.source.kind === "table" ? data.dataset.source.tableSlug : draft.tableSlug;
  const source = tables.items.find((table) => table.slug === effectiveTable);
  const sourceName = source ? localized(source.labels, language, source.label) : effectiveTable;
  const grouping = schema.fields.find((field) => field.slug === draft.groupSlug);
  const context = [sourceName, grouping ? localized(grouping.labels, language, grouping.label) : ""].filter(Boolean).join(" · ");
  const slug = effectiveTable || undefined;
  const chart = !draft.type || draft.type === "chart";
  const derived = chart ? chartTitle(draft, schema.fields, language, t) : t(`dashboard.widget.${draft.type}` as "dashboard.widget.records");
  const title = custom ? draft.title : derived;
  const change = (patch: Partial<Widget>) => { setDraft((current) => ({ ...current, ...patch })); setPreviewPage(1); };
  const filterCount = Object.values(draft.filters).filter((filter) => filter.values.length).length;
  const grouped = chart && !["stat", "scatter", "bubble", "map"].includes(draft.kind);
  const ready = draft.type === "heading" ? widgetReady({ ...draft, title }, schema.fields) : Boolean(slug && data.ready && !data.error && !data.forbidden && (draft.type === "records" ? (draft.columns ?? schema.fields).length > 0 : widgetReady(draft, schema.fields)));

  return <Modal onClose={onClose} className="flex items-start justify-center px-3 pt-[4dvh]">
    <div ref={dialog} data-modal role="dialog" aria-modal="true" aria-label={t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")} className="flex h-[min(820px,92dvh)] w-[1100px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">{t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")}</h2><p className="mt-1 text-sm text-fg-muted">{context || t("dashboard.simpleEditorHint")}</p></div>
        <button type="button" aria-label={t("action.close")} onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"><Icon as={XIcon} size={18} /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:overflow-hidden">
        <div className="flex min-h-0 min-w-0 shrink-0 flex-col gap-2">
          <div className="flex shrink-0 flex-col gap-2">
          <TablePicker value={effectiveTable} onPick={(tableSlug) => { if (tableSlug === effectiveTable) return; setDraft((current) => resetWidgetSource(current, tableSlug)); setPreviewPage(1); }} />
          {(slug || draft.type === "heading") && <WidgetFields widget={draft} fields={schema.fields} language={language} onChange={change} />}
          </div>
          <div className="flex min-h-0 flex-col gap-2 md:overflow-y-auto md:pr-2">
          {slug || draft.type === "heading" ? <>
            <VisualizationPicker value={visualizationOf(draft)} onChange={(kind) => { setDraft((current) => selectVisualization(current, kind, schema.fields)); setPreviewPage(1); }} />
            <Field label={t("dashboard.widgetTitle")}><Input aria-label={t("dashboard.widgetTitle")} value={title} placeholder={t("dashboard.widgetTitleHint")} onChange={(event) => { setCustom(Boolean(event.target.value.trim())); change({ title: event.target.value }); }} /></Field>
            {grouped && <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span>{t("dashboard.showEmpty")}<span className="mt-0.5 block text-xs text-fg-muted">{t("dashboard.showEmptyHint")}</span></span><input type="checkbox" role="switch" aria-label={t("dashboard.showEmpty")} checked={draft.showEmpty ?? false} onChange={(event) => change({ showEmpty: event.target.checked })} className="size-4 shrink-0 accent-accent" /></label>}
            {draft.type !== "heading" && <Popover trigger={({ open, toggle }) => <Button type="button" size="sm" variant="secondary" aria-expanded={open} className="self-start" onClick={toggle}><Icon as={FilterIcon} size={14} />{t("dashboard.cardFilters")}{filterCount > 0 ? ` (${filterCount})` : ""}</Button>}>
              {() => <div className="w-[360px] max-w-[85vw] p-2"><p className="mb-2 text-sm font-medium">{t("dashboard.cardFilters")}</p><div className="[&>div]:mx-0 [&>div]:border-b-0 [&>div]:px-0"><FilterBar columns={schema.fields} relations={schema.relations} language={language} filters={draft.filters} sorts={[]} onFilters={(own) => change({ filters: own })} onSorts={noop} /></div></div>}
            </Popover>}
          </> : <p className="py-3 text-sm text-fg-muted">{t("dashboard.pickTableFirst")}</p>}
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted"><Icon as={SlidersHorizontalIcon} size={14} />{t("dashboard.advancedSettings")}{draft.measures?.length ? ` · ${draft.measures.length}` : ""}</summary>
            <div className="mt-3 flex flex-col gap-3">
              {chart && !["scatter", "bubble", "map"].includes(draft.kind) && <ChartRoles config={draft} columns={schema.fields} language={language} onChange={change} />}
              {chart && splittable(draft.kind) && !needsSplit(draft.kind) && !draft.measures?.length && <Field label={t("chart.split")}><Dropdown ariaLabel={t("chart.split")} value={draft.splitSlug} items={[{ value: "", label: t("chart.splitNone") }, ...schema.fields.filter((field) => field.slug !== draft.groupSlug).map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }))]} onChange={(splitSlug) => change({ splitSlug, splitBucket: "" })} /></Field>}
              {draft.type === "records" && <Field label={t("dashboard.pageSize")}><Dropdown ariaLabel={t("dashboard.pageSize")} value={String(draft.pageSize ?? 20)} items={[10, 20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => change({ pageSize: Number(value) })} /></Field>}
              {draft.type !== "records" && draft.aggregation !== "count" && <Field label={t("dashboard.currencyField")}><Dropdown value={draft.currencySlug ?? ""} items={[{ value: "", label: t("dashboard.currencyAuto") }, ...schema.fields.map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }))]} onChange={(currencySlug) => change({ currencySlug })} /></Field>}
              {filters.length > 0 && draft.type !== "heading" && <div className="flex flex-col gap-2"><span className="text-sm font-medium">{t("dashboard.answers")}</span>{filters.map((filter) => { const key = filterKey(filter); return <AnswerPicker key={key} menuId={menuId} filter={filter} fields={schema.fields} relations={schema.relations} language={language} value={draft.answers[key]} onChange={(answer) => { const answers = { ...draft.answers }; if (answer) answers[key] = answer; else delete answers[key]; change({ answers }); }} />; })}</div>}
              {grouped && draft.groupSlug && !draft.groupBucket && <Field label={t("dashboard.chartInteraction")}><Dropdown value={draft.interaction?.scope ?? "off"} items={[{ value: "off", label: t("dashboard.interactionOff") }, { value: "card", label: t("dashboard.interactionCard") }, { value: "dashboard", label: t("dashboard.interactionDashboard") }]} onChange={(scope) => { const next = { ...draft }; if (scope === "off") delete next.interaction; else next.interaction = { scope: scope as "card" | "dashboard" }; setDraft(next); }} /></Field>}
              {datasets.some((dataset) => dataset.source.kind === "table" && !dataset.source.joins.length) && <Field label={t("dashboard.savedDataset")}><Dropdown ariaLabel={t("dashboard.savedDataset")} value={draft.datasetId ?? ""} items={[{ value: "", label: t("dashboard.directTable") }, ...datasets.filter((dataset) => dataset.source.kind === "table" && !dataset.source.joins.length).map((dataset) => ({ value: dataset.id, label: dataset.name }))]} onChange={(id) => { const dataset = datasets.find((item) => item.id === id); if (dataset?.source.kind === "table") { const next = resetWidgetSource(draft, dataset.source.tableSlug); setDraft({ ...next, datasetId: id, ...(draft.type === "records" ? { columns: dataset.source.fields } : {}) }); } else { const next = { ...draft }; delete next.datasetId; setDraft(next); } setPreviewPage(1); }} /></Field>}
              {!slug && <Button type="button" size="sm" variant="secondary" onClick={() => setDraft((current) => selectVisualization(current, "heading", schema.fields))}>{t("dashboard.widget.heading")}</Button>}
            </div>
          </details>
          </div>
        </div>
        <div className="dashboard-widget-preview flex h-[420px] min-h-0 shrink-0 min-w-0 flex-col gap-3 rounded-xl border border-border p-4 md:h-full">
          <span className="text-sm text-fg-muted">{t("dashboard.preview")}</span>
          <ChartCard config={{ ...draft, title, width: 12 }} columns={schema.fields} relations={schema.relations} rows={[]} language={language} showRowCount={false} scrollContent={draft.type !== "records"} aside={draft.type === "records" ? undefined : <WidgetStatus widget={draft} data={data} compact />} content={<WidgetContents widget={draft} data={data} language={language} editing page={previewPage} sorts={draft.sorts ?? []} onPage={setPreviewPage} onSorts={(sorts) => change({ sorts })} onChange={change} />} editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} plain />
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3"><span className="mr-auto hidden text-xs text-fg-muted sm:block">{t("dashboard.saveAfterAdding")}</span><Button type="button" variant="secondary" onClick={onClose}>{t("action.cancel")}</Button><Button type="button" disabled={!ready} onClick={() => onSave({ ...draft, title: title.trim() })}>{t(isNew ? "dashboard.addToDraft" : "dashboard.applyToDraft")}</Button></footer>
    </div>
  </Modal>;
}

/**
 * Каким полем виджет отвечает на общий фильтр: датой на «Период»,
 * ссылкой на «Запись таблицы» — прямой или через справочник
 * («Филиал» для сделок: сотрудник → его филиал).
 */
function AnswerPicker({
  menuId,
  filter,
  fields,
  relations,
  language,
  value,
  onChange,
}: {
  menuId: string;
  filter: DashFilter;
  fields: TableField[];
  relations: Relation[];
  language: string;
  value: Answer | undefined;
  onChange: (answer: Answer | undefined) => void;
}) {
  const { t } = useTranslation();
  const target = (field: TableField) => relations.find((item) => item.id === field.relationId)?.toSlug ?? "";
  const options = fields.filter((field) =>
    filter.kind === "period" ? ["DATE", "DATE_TIME", "DATE_TIME_WITHOUT_TIME_ZONE"].includes(field.type) : filterKind(field) === "relation" && target(field),
  );
  const chosen = fields.find((field) => field.slug === value?.field);
  const through = filter.kind === "record" && chosen && target(chosen) !== filter.table ? target(chosen) : "";
  const label = (field: TableField) => localized(field.labels, language, field.label);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{filter.label || t("dashboard.period")}</span>
      <Dropdown
        value={value?.field ?? ""}
        size="sm"
        items={[
          { value: "", label: t("dashboard.answerNone") },
          ...options.map((field) => ({ value: field.slug, label: label(field) })),
        ]}
        onChange={(field) => onChange(field ? { field } : undefined)}
      />
      {through && value && (
        <ViaPicker
          menuId={menuId}
          table={through}
          target={filter.kind === "record" ? filter.table : ""}
          language={language}
          value={value.via ?? ""}
          onChange={(via) => onChange(via ? { field: value.field, via } : { field: value.field })}
        />
      )}
    </div>
  );
}

/** Поле справочника `table`, которое ссылается на таблицу фильтра. */
function ViaPicker({
  menuId,
  table,
  target,
  language,
  value,
  onChange,
}: {
  menuId: string;
  table: string;
  target: string;
  language: string;
  value: string;
  onChange: (via: string) => void;
}) {
  const { t } = useTranslation();
  const { schema, ready } = useDashboardSchema(table, menuId);
  const options = schema.fields.filter(
    (field) =>
      filterKind(field) === "relation" &&
      schema.relations.find((item) => item.id === field.relationId)?.toSlug === target,
  );

  return (
    <Dropdown
      value={value}
      size="sm"
      placeholder={options.length ? t("dashboard.via") : t("dashboard.noLinks")}
      disabled={!ready || !options.length}
      items={options.map((field) => ({
        value: field.slug,
        label: `${t("dashboard.via")}: ${localized(field.labels, language, field.label)}`,
      }))}
      onChange={onChange}
    />
  );
}

export function TablePicker({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { current: language } = useDataLanguages();
  const tables = useTables(search);
  const permissionOf = useTablePermissions();
  const picked = tables.items.find((table) => table.slug === value);

  return (
    <SelectMenu
      label={t("menuForm.table")}
      placeholder={picked ? localized(picked.labels, language, picked.label) : value || t("menuForm.tablePick")}
      searchPlaceholder={t("menuForm.tableSearch")}
      emptyText={t("menuForm.tableEmpty")}
      items={tables.items.filter((table) => permissionOf(table.slug).read).map((table) => ({
        value: table.slug,
        label: localized(table.labels, language, table.label),
        icon: table.icon,
      }))}
      selected={new Set(value ? [value] : [])}
      search={search}
      loading={tables.isLoading}
      hasMore={tables.hasMore}
      onSearch={setSearch}
      onLoadMore={tables.loadMore}
      onPick={onPick}
    />
  );
}
