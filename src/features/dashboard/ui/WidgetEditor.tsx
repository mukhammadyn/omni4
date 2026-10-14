import { useState } from "react";
import { useTablePermissions } from "@/features/auth";
import { useWidgetData } from "../api/widget-data";
import { WidgetContents, WidgetStatus } from "./WidgetContents";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, ChartSetup, FilterBar, chartTitle, filterKind } from "@/features/item";
import { localized, useTables, type Field as TableField, type Relation } from "@/features/table";
import { useDashboardSchema } from "../api/schema";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import { Modal } from "@/shared/ui/modal";
import { SelectMenu } from "@/shared/ui/select-menu";
import { resetWidgetSource } from "../model/widget-source";
import { widgetReady } from "../model/widget-advanced";
import { AdvancedWidgetSetup } from "./AdvancedWidgetSetup";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { filterKey, type Answer, type DashFilter, type FilterValues } from "../model/filters";

const noop = () => {};

/**
 * Редактор виджета — диалог с предпросмотром, как «Добавить виджет»
 * в professio (ADR-0013): слева таблица и настройки, справа тот же
 * график, что встанет на дашборд. Ничего не пишется до «Сохранить».
 */
export function WidgetEditor({
  initial,
  datasets,
  isNew,
  filters,
  values,
  menuId,
  onSave,
  onClose,
}: {
  initial: Widget;
  datasets: Dataset[];
  /** Общие фильтры дашборда — виджет выбирает, каким полем на них отвечать. */
  filters: DashFilter[];
  values: FilterValues;
  menuId: string;
  isNew: boolean;
  onSave: (widget: Widget) => void;
  onClose: () => void;
}) {
  const dialog = useDialogFocus(onClose);
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [draft, setDraft] = useState(initial);
  const slug = draft.tableSlug || undefined;
  const [previewPage, setPreviewPage] = useState(1);
  const data = useWidgetData(draft, filters, values, menuId, {}, previewPage, draft.sorts ?? [], datasets);
  const { schema } = data;
  const change = (patch: Partial<Widget>) => { setDraft((current) => ({ ...current, ...patch })); setPreviewPage(1); };

  /*
   * Название, как в professio: стоит в поле готовым («Отделы · Количество»)
   * и идёт за настройками, пока его не правили руками. Стёрли — снова
   * собирается само. Сохраняется то, что видно.
   */
  const derived = draft.type && draft.type !== "chart" ? t(`dashboard.widget.${draft.type}` as "dashboard.widget.records") : chartTitle(draft, schema.fields, language, t);
  const [custom, setCustom] = useState(() => Boolean(initial.title));
  const title = custom ? draft.title : derived;

  return (
    /* Окно прижато к верху: раскрытый список полей растит его вниз,
       а не дёргает вверх-вниз, как окно по центру. */
    <Modal onClose={onClose} className="flex items-start justify-center px-4 pt-[8vh]">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")}
        className="flex max-h-[88vh] w-[1000px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <header className="flex shrink-0 items-start gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t(draft.type === "heading" ? "dashboard.headingHint" : draft.type === "records" ? "dashboard.recordsEditorHint" : "dashboard.editorHint")}</p>
            <p className="mt-1 text-xs text-fg-muted">{t("dashboard.widgetDraftHint")}</p>
          </div>
          <button
            type="button"
            aria-label={t("action.close")}
            onClick={onClose}
            className="-mt-1 -mr-2 grid size-8 cursor-pointer place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Icon as={XIcon} size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 pb-1 md:grid-cols-[340px_1fr]">
          {/* Настройки — сверху вниз в порядке вопроса: откуда, что, как. */}
          <div className="flex flex-col gap-4 pb-1">
            <Field label={t("dashboard.widgetType")}><Dropdown ariaLabel={t("dashboard.widgetType")} value={draft.type ?? "chart"} items={["chart", "records", "pivot", "ratio", "goal", "heading"].map((type) => ({ value: type, label: t(`dashboard.widget.${type}` as "dashboard.widget.chart") }))} onChange={(type) => { change({ type: type as NonNullable<Widget["type"]>, measures: [], ...(type === "records" ? { columns: schema.fields.slice(0, 5).map((f) => f.slug), width: 12, height: 2 } : {}), ...(type === "heading" ? { width: 12, height: 1 } : {}), ...(["ratio", "goal"].includes(type) ? { kind: "stat" } : {}), ...(type === "pivot" ? { pivotRows: [draft.groupSlug], width: 12, height: 2 } : {}), ...(type === "ratio" ? { ratio: { numerator: { id: "numerator", field: "", aggregation: "count" }, denominator: { id: "denominator", field: "", aggregation: "count" }, percent: false } } : {}) }); }} /></Field>
            {draft.type === "heading" ? <AdvancedWidgetSetup widget={draft} fields={schema.fields} language={language} onChange={change} /> : <>
            <Field label={t("dashboard.savedDataset")}><Dropdown ariaLabel={t("dashboard.savedDataset")} value={draft.datasetId ?? ""} items={[{ value: "", label: t("dashboard.directTable") }, ...datasets.filter((dataset) => dataset.source.kind === "table" && !dataset.source.joins.length).map((dataset) => ({ value: dataset.id, label: dataset.name }))]} onChange={(id) => { const dataset = datasets.find((item) => item.id === id); if (dataset?.source.kind === "table") { const next = resetWidgetSource(draft, dataset.source.tableSlug); setDraft({ ...next, datasetId: id, ...(draft.type === "records" ? { columns: dataset.source.fields } : {}) }); } else { const next = { ...draft }; delete next.datasetId; setDraft(next); } setPreviewPage(1); }} /></Field>
            {!draft.datasetId && <TablePicker
              value={draft.tableSlug}
              // Поля прежней таблицы в новой не значат ничего.
              onPick={(tableSlug) =>
                setDraft((current) => resetWidgetSource(current, tableSlug))
              }
            />}
            {slug ? (
              <>
                <div className="flex flex-wrap gap-1">{[{ key: "count", patch: { type: "chart" as const, kind: "stat" as const, aggregation: "count" as const } }, ...(schema.fields.some((f) => ["DATE", "DATE_TIME", "DATE_TIME_WITHOUT_TIME_ZONE"].includes(f.type)) ? [{ key: "trend", patch: { type: "chart" as const, kind: "line" as const, aggregation: "count" as const, groupSlug: schema.fields.find((f) => ["DATE", "DATE_TIME", "DATE_TIME_WITHOUT_TIME_ZONE"].includes(f.type))!.slug, groupBucket: "month" as const } }] : []), { key: "records", patch: { type: "records" as const, columns: schema.fields.slice(0, 5).map((f) => f.slug), width: 12, height: 2 } }].map((preset) => <Button key={preset.key} type="button" size="sm" variant="secondary" onClick={() => change({ ...preset.patch, measures: [], splitSlug: "", splitBucket: "", ...(preset.key === "count" ? { valueSlug: "" } : {}) })}>{t(`dashboard.template.${preset.key}` as "dashboard.template.count")}</Button>)}</div>
                {draft.type === "records" ? <ColumnsEditor widget={draft} fields={schema.fields} language={language} onChange={change} /> : draft.type && draft.type !== "chart" ? <AdvancedWidgetSetup widget={draft} fields={schema.fields} language={language} onChange={change} /> : <ChartSetup config={draft} columns={schema.fields} language={language} onChange={change} stacked />}
                {draft.type !== "records" && draft.aggregation !== "count" && <Field label={t("dashboard.currencyField")}><Dropdown value={draft.currencySlug ?? ""} items={[{ value: "", label: t("dashboard.currencyAuto") }, ...schema.fields.map((field) => ({ value: field.slug, label: localized(field.labels, language, field.label) }))]} onChange={(currencySlug) => change({ currencySlug })} /></Field>}
                {filters.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-fg">{t("dashboard.answers")}</span>
                    {filters.map((filter) => {
                      const key = filterKey(filter);
                      return (
                        <AnswerPicker
                          key={key}
                          menuId={menuId}
                          filter={filter}
                          fields={schema.fields}
                          relations={schema.relations}
                          language={language}
                          value={draft.answers[key]}
                          onChange={(answer) => {
                            const answers = { ...draft.answers };
                            if (answer) answers[key] = answer;
                            else delete answers[key];
                            change({ answers });
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-fg">{t("dashboard.ownFilter")}</span>
                  {/* Подшапка таблицы рассчитана на всю ширину view — здесь без её полей. */}
                  <div className="rounded-md border border-border [&>div]:mx-0 [&>div]:border-b-0 [&>div]:px-2">
                    <FilterBar
                      columns={schema.fields}
                      relations={schema.relations}
                      language={language}
                      filters={draft.filters}
                      sorts={[]}
                      onFilters={(own) => change({ filters: own })}
                      onSorts={noop}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-fg-subtle">{t("dashboard.pickTableFirst")}</p>
            )}
            </>}
            {(!draft.type || draft.type === "chart") && !["scatter", "bubble", "map", "stat"].includes(draft.kind) && draft.groupSlug && !draft.groupBucket && <Field label={t("dashboard.chartInteraction")}><Dropdown value={draft.interaction?.scope ?? "off"} items={[{ value: "off", label: t("dashboard.interactionOff") }, { value: "card", label: t("dashboard.interactionCard") }, { value: "dashboard", label: t("dashboard.interactionDashboard") }]} onChange={(scope) => { const next = { ...draft }; if (scope === "off") delete next.interaction; else next.interaction = { scope: scope as "card" | "dashboard" }; setDraft(next); }} /></Field>}
            <Field label={t("dashboard.widgetTitle")}>
              <Input
                value={title}
                placeholder={t("dashboard.widgetTitleHint")}
                onChange={(event) => {
                  setCustom(Boolean(event.target.value.trim()));
                  change({ title: event.target.value });
                }}
              />
            </Field>
          </div>

          {/* Предпросмотр — одной панелью: подпись, заголовок, график.
              Липнет к верху, пока прокручивается длинная форма. */}
          <div className="flex h-[460px] min-w-0 flex-col gap-1 self-start rounded-xl border border-border p-5 md:sticky md:top-0">
            <span className="text-sm text-fg-muted">{t("dashboard.preview")}</span>
            <ChartCard
              config={{ ...draft, title, width: 12 }}
              columns={schema.fields}
              relations={schema.relations}
              rows={[]}
              language={language}
              showRowCount={false}
              aside={<WidgetStatus widget={draft} data={data} />}
              content={<WidgetContents widget={draft} data={data} language={language} editing page={previewPage} sorts={draft.sorts ?? []} onPage={setPreviewPage} onSorts={(sorts) => change({ sorts })} onChange={change} />}
              editing={false}
              dragged={false}
              over={false}
              onDragStart={noop}
              onDragEnd={noop}
              onDragOver={noop}
              onDrop={noop}
              onMove={noop}
              onChange={noop}
              onRemove={noop}
              plain
            />
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 px-6 pt-4 pb-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="button" disabled={draft.type === "heading" ? !widgetReady({ ...draft, title }, schema.fields) : !slug || !data.ready || Boolean(data.error) || data.forbidden || (draft.type === "records" ? !(draft.columns ?? schema.fields).length : !widgetReady(draft, schema.fields))} onClick={() => onSave({ ...draft, title: title.trim() })}>
            {t(isNew ? "dashboard.addToDraft" : "dashboard.applyToDraft")}
          </Button>
        </footer>
      </div>
    </Modal>
  );
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

function ColumnsEditor({ widget, fields, language, onChange }: { widget: Widget; fields: TableField[]; language: string; onChange: (patch: Partial<Widget>) => void }) {
  const { t } = useTranslation();
  const selected = widget.columns ?? fields.slice(0, 5).map((field) => field.slug);
  const ordered = [...selected, ...fields.map((field) => field.slug).filter((slug) => !selected.includes(slug))];
  const move = (slug: string, step: number) => {
    const next = [...selected], at = next.indexOf(slug), target = at + step;
    if (at < 0 || target < 0 || target >= next.length) return;
    [next[at], next[target]] = [next[target]!, next[at]!]; onChange({ columns: next });
  };
  return <div className="flex flex-col gap-2"><span className="text-sm font-medium">{t("dashboard.columns")}</span><div className="max-h-56 overflow-auto rounded-md border border-border p-2">{ordered.map((slug) => { const field = fields.find((f) => f.slug === slug); if (!field) return null; return <div key={slug} className="flex items-center gap-2 py-1"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(slug)} onChange={(event) => onChange({ columns: event.target.checked ? [...selected, slug] : selected.filter((s) => s !== slug) })} /><span className="truncate">{localized(field.labels, language, field.label)}</span></label>{selected.includes(slug) && <><button type="button" aria-label={t("dashboard.columnUp")} disabled={selected.indexOf(slug) === 0} onClick={() => move(slug, -1)} className="px-1 disabled:opacity-30">↑</button><button type="button" aria-label={t("dashboard.columnDown")} disabled={selected.indexOf(slug) === selected.length - 1} onClick={() => move(slug, 1)} className="px-1 disabled:opacity-30">↓</button></>}</div>; })}</div><Field label={t("dashboard.pageSize")}><Dropdown value={String(widget.pageSize ?? 20)} items={[10, 20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => onChange({ pageSize: Number(value) })} /></Field></div>;
}
