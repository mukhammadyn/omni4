import { useSqlCatalog } from "../api/sql-catalog";
import { buildJoinSql } from "../model/sql-join-builder";
import { syncVisualSql } from "../model/sql-visual-source";
import { SqlWidgetOptions } from "./SqlWidgetOptions";
import { ChartAppearance } from "./ChartAppearance";
import { useCallback, useState } from "react";
import { ListIcon, BracesIcon, Table2Icon, CodeIcon, EyeIcon, RefreshCwIcon, XIcon, FilterIcon, SlidersHorizontalIcon, DatabaseIcon, ChartNoAxesCombinedIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/shared/api/use-session";
import { useTablePermissions } from "@/features/auth";
import { ChartCard, ChartRoles, FilterBar, chartTitle, filterKind, splittable, needsSplit } from "@/features/item";
import { localized, useTables, useTableCatalog, type Field as TableField, type Relation } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Tabs } from "@/shared/ui/tabs";
import { CalculatedFieldEditor } from "./CalculatedFieldEditor";
import { builderPreviewLimit } from "../model/builder-preview";
import { namedSqlParameters } from "../model/sql-assist";
import { Dropdown } from "@/shared/ui/dropdown";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import { Modal } from "@/shared/ui/modal";
import { Popover } from "@/shared/ui/popover";
import { SelectMenu } from "@/shared/ui/select-menu";
import { useWidgetData } from "../api/widget-data";
import { useDashboardSchema } from "../api/schema";
import { resetWidgetSource, sourceChangeNeedsConfirmation } from "../model/widget-source";
import { widgetReady } from "../model/widget-advanced";
import { selectVisualization, visualizationOf } from "../model/widget-editor";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { filterKey, type Answer, type DashFilter, type FilterValues } from "../model/filters";
import { WidgetContents, WidgetStatus } from "./WidgetContents";
import { WidgetFields } from "./WidgetFields";
import { VisualizationPicker } from "./VisualizationPicker";
import { SqlQueryEditor } from "./SqlQueryEditor";
import { SqlDatasetRunner, SqlResultView } from "./SqlDatasetRunner";
import { sqlWidgetFrom, SQL_VISUALIZATIONS, reconcileSqlFields, sqlMeasuresReady } from "../model/sql-widget";
import { sqlEditorCopy } from "../model/sql-editor-copy";
import { sqlSupportIssue } from "../model/sql-query-guidance";
import { queryChartRows, queryFields, type QueryResult } from "../model/query-result";

import "./chart-builder.css";
import { presentFields } from "../model/field-presentation";
import { BuilderSources, BuilderParameters, BuilderRowsPreview } from "./BuilderData";
import { builderFieldOption } from "./BuilderFieldOption";
import { BuilderFields, BuilderSchema, BuilderSlots, builderCopy } from "./BuilderFields";

const noop = () => {};

/** One local draft, compact controls and a large real preview. No writes until dashboard Save. */
export function WidgetEditor({ initial, datasets, isNew, filters, values, menuId, onSave, onClose }: {
  initial: Widget; datasets: Dataset[]; filters: DashFilter[]; values: FilterValues; menuId: string;
  isNew: boolean; onSave: (widget: Widget, dataset?: Dataset) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<"data" | "viz">(isNew ? "data" : "viz");
  const [dataTab, setDataTab] = useState<"source" | "fields" | "parameters">("source");
  const [pendingTable, setPendingTable] = useState<string>();
  const [fieldSearch, setFieldSearch] = useState("");
  const [rowsPreview, setRowsPreview] = useState(true);
  const [rowsLimit, setRowsLimit] = useState(10);
  const [rowsLimitInput, setRowsLimitInput] = useState("10");
  const [fullscreen, setFullscreen] = useState(false);
  const dialog = useDialogFocus(onClose);
  const { t, i18n } = useTranslation();
  const copy = sqlEditorCopy(i18n.language);
  const labels = builderCopy(i18n.language);
  const existingSql = datasets.find((dataset) => dataset.id === initial.datasetId && dataset.source.kind === "sql");
  const [sourceKind, setSourceKind] = useState<"table" | "sql">(existingSql ? "sql" : "table");
  const [sqlDataset, setSqlDataset] = useState<Dataset>(() => existingSql ? { ...existingSql, id: crypto.randomUUID(), source: { ...existingSql.source } } : { id: crypto.randomUUID(), name: "SQL", source: { kind: "sql", sql: "", sqlMode: "visual", parameters: [], columns: [] } });
  const [sqlWidget, setSqlWidget] = useState<Widget>(() => existingSql ? { ...initial } : { ...sqlWidgetFrom(sqlDataset), id: initial.id, showGrid: true });
  const session = useSession();
  const sqlSignature = JSON.stringify([sqlDataset.source.kind === "sql" ? [sqlDataset.source.sql, sqlDataset.source.parameters] : sqlDataset.source, session.getVersion()]);
  const sqlCatalog = useSqlCatalog(menuId, sourceKind === "sql");
  const sqlPlanIssue = sqlDataset.source.kind === "sql" && sqlDataset.source.sqlMode === "visual" && sqlDataset.source.visual ? buildJoinSql(sqlDataset.source.visual, sqlCatalog.tables).issue : null;
  const [sqlPreview, setSqlPreview] = useState<{ signature: string; result: QueryResult | null }>();
  const sqlResult = sqlPreview?.signature === sqlSignature ? sqlPreview.result : null;
  const sqlFields = sqlResult ? presentFields(queryFields(sqlResult), sqlWidget.fieldPresentation) : [];
  const receiveResult = useCallback((result: QueryResult | null) => { setSqlPreview({ signature: sqlSignature, result }); if (result) { const fields = queryFields(result); setSqlWidget((current) => reconcileSqlFields(current, fields)); } }, [sqlSignature]);
  let sqlAccurate = true;
  if (sqlResult && sqlWidget.type !== "records") { try { queryChartRows(sqlResult); } catch { sqlAccurate = false; } }
  const sqlReady = Boolean(!sqlPlanIssue && sqlAccurate && sqlDataset.source.kind === "sql" && sqlDataset.source.sql.trim() && !sqlSupportIssue(sqlDataset.source.sql) && sqlResult && (sqlWidget.type === "records" || ((sqlWidget.aggregation === "count" || sqlMeasuresReady(sqlWidget, sqlFields)) && (sqlWidget.kind === "stat" || sqlFields.some((field) => field.slug === sqlWidget.groupSlug)))));
  const { current: language } = useDataLanguages();
  const [draft, setDraft] = useState(() => existingSql ? resetWidgetSource(initial, "") : isNew ? { ...initial, showGrid: true } : initial);
  const [previewPage, setPreviewPage] = useState(1);
  const [custom, setCustom] = useState(() => Boolean(initial.title));
  const data = useWidgetData(draft, filters, values, menuId, {}, previewPage, draft.sorts ?? [], datasets);
  const { schema } = data;
  const tables = useTableCatalog(sourceKind === "table");
  const effectiveTable = data.dataset?.source.kind === "table" ? data.dataset.source.tableSlug : draft.tableSlug;
  const source = tables.items.find((table) => table.slug === effectiveTable);
  const sourceSchema = useDashboardSchema(sourceKind === "table" ? effectiveTable || undefined : undefined, menuId);
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

  const fieldsToolbar = <div className="builder-field-toolbar ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={sourceKind === "table" && (!effectiveTable || data.loading)} onClick={() => sourceKind === "table" ? data.refetch() : setDataTab("parameters")}><Icon as={RefreshCwIcon} size={14} />{sourceKind === "sql" ? i18n.language.startsWith("ru") ? "Запустить SQL" : "Run SQL" : i18n.language.startsWith("ru") ? "Обновить поля" : "Refresh fields"}</Button>
            <Button size="sm" variant={rowsPreview ? "primary" : "secondary"} aria-pressed={rowsPreview} onClick={() => setRowsPreview(!rowsPreview)}><Icon as={EyeIcon} size={14} />{t("dashboard.preview")}</Button>
            {sourceKind === "table" && <CalculatedFieldEditor widget={draft} fields={schema.fields} onChange={change} />}
            <div className="w-56 max-w-full"><Input aria-label={labels.search} placeholder={i18n.language.startsWith("ru") ? "Имя или описание поля" : "Field name or description"} value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} /></div>
          </div>;
  const fieldsPane = <div data-builder-fields-pane className="builder-fields-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {sourceKind === "table" && (!effectiveTable || !sourceSchema.ready) ? <div className="flex-1 p-4 text-sm text-fg-muted">{!effectiveTable ? t("dashboard.pickTableFirst") : sourceSchema.denied ? t("dashboard.noWidgetAccess") : sourceSchema.error ? <p role="alert">{sourceSchema.error}<Button variant="secondary" onClick={sourceSchema.retry}>{t("dashboard.refresh")}</Button></p> : <p role="status">{t("common.loading")}</p>}</div> : <BuilderSchema sql={sourceKind === "sql"} onChange={(patch) => sourceKind === "table" ? change(patch) : setSqlWidget((current) => ({ ...current, ...patch }))} search={fieldSearch} fields={sourceKind === "sql" ? sqlFields : schema.fields} language={language} labels={labels} widget={sourceKind === "sql" ? sqlWidget : draft} />}
          {rowsPreview && (sourceKind === "sql" || Boolean(effectiveTable)) && <section data-builder-rows className="flex h-[42%] min-h-40 shrink-0 flex-col border-t border-border bg-surface" aria-label={t("dashboard.preview")}>
            <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-2"><h3 className="text-sm font-semibold">{t("dashboard.preview")}</h3><label className="flex items-center gap-2 text-sm text-fg-muted">{i18n.language.startsWith("ru") ? "Количество строк:" : "Rows:"}<Input type="number" min={1} max={1000} aria-label="Preview row limit" className="w-20" value={rowsLimitInput} onChange={(event) => setRowsLimitInput(event.target.value)} onBlur={() => { const next = builderPreviewLimit(rowsLimitInput); setRowsLimit(next); setRowsLimitInput(String(next)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label><span className="text-xs text-fg-subtle">{i18n.language.startsWith("ru") ? "не больше 1 000" : "maximum 1,000"}</span><button type="button" className="ml-auto rounded-md p-1.5 text-fg-muted hover:bg-surface-hover" aria-label="Close rows preview" onClick={() => setRowsPreview(false)}><Icon as={XIcon} size={16} /></button></div>
            {sourceKind === "table" ? <BuilderRowsPreview key={`${effectiveTable}-${rowsLimit}`} limit={rowsLimit} widget={draft} fields={schema.fields} filters={filters} values={values} menuId={menuId} datasets={datasets} language={language} /> : <div className="min-h-0 flex-1 overflow-auto px-4 pb-3">{sqlResult ? <SqlResultView fieldPresentation={sqlWidget.fieldPresentation} result={{ ...sqlResult, rows: sqlResult.rows.slice(0, rowsLimit) }} language={i18n.language} hidePicker presentation={{ type: "table", kind: "bar", group: "", value: "", split: "" }} /> : <p className="p-4 text-sm text-fg-muted">{copy.beforePreview}</p>}</div>}
          </section>}
        </div>;

  return <Modal onClose={onClose} className={fullscreen ? "flex" : "flex items-center justify-center p-3.5"}>
    <div ref={dialog} data-modal data-chart-builder role="dialog" aria-modal="true" aria-label={t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")} className={`flex max-w-full flex-col overflow-hidden border border-border bg-surface shadow-modal ${fullscreen ? "h-dvh w-full" : "h-full w-full rounded-xl"}`}>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2 md:min-h-[52px]">
        <span className="hidden max-w-40 truncate text-sm text-fg-muted sm:block" title={sourceKind === "sql" ? "SQL" : context}>{sourceKind === "sql" ? "SQL" : sourceName || t("dashboard.addWidget")} /</span>
        <Input className="min-w-28 flex-1 md:w-[220px] md:flex-none border-transparent bg-transparent font-semibold" aria-label={t("dashboard.widgetTitle")} value={sourceKind === "sql" ? sqlWidget.title : title} placeholder={t("dashboard.widgetTitleHint")} onChange={(event) => { if (sourceKind === "sql") setSqlWidget({ ...sqlWidget, title: event.target.value }); else { setCustom(Boolean(event.target.value.trim())); change({ title: event.target.value }); } }} />
        <nav aria-label={labels.editor} className="order-last flex w-full justify-center rounded-md bg-surface-hover p-1 md:order-none md:mx-auto md:w-auto">{(["data", "viz"] as const).map((tab) => <button key={tab} type="button" aria-pressed={mode === tab} onClick={() => setMode(tab)} className={`flex items-center gap-2 rounded px-4 py-1.5 text-sm ${mode === tab ? "bg-surface font-medium shadow-sm" : "text-fg-muted"}`}><Icon as={tab === "data" ? DatabaseIcon : ChartNoAxesCombinedIcon} size={16} />{tab === "data" ? labels.data : labels.viz}</button>)}</nav>
        <button type="button" aria-label={fullscreen ? labels.restore : labels.fullscreen} title={fullscreen ? labels.restore : labels.fullscreen} onClick={() => setFullscreen(!fullscreen)} className="flex items-center gap-2 rounded p-2 text-fg-muted hover:bg-surface-hover"><Icon as={fullscreen ? Minimize2Icon : Maximize2Icon} size={17} /><span className="hidden lg:inline">{fullscreen ? labels.restore : labels.fullscreen}</span></button>
        <Button type="button" disabled={sourceKind === "sql" ? !sqlReady : !ready} title={sourceKind === "sql" && !sqlReady ? copy.previewRequired : undefined} onClick={() => sourceKind === "sql" ? onSave({ ...sqlWidget, title: sqlWidget.title.trim() }, { ...sqlDataset, name: existingSql ? sqlDataset.name : sqlWidget.title.trim() || "SQL" }) : onSave({ ...draft, title: title.trim() })}>{t(isNew ? "dashboard.addToDraft" : "dashboard.applyToDraft")}</Button>
        <button type="button" aria-label={t("action.close")} onClick={onClose} className="rounded p-2 text-fg-muted hover:bg-surface-hover"><Icon as={XIcon} size={18} /></button>
      </header>
      {pendingTable && <div role="alertdialog" aria-label={i18n.language.startsWith("ru") ? "Сменить таблицу?" : "Change table?"} className="border-b border-border bg-surface-soft p-4 text-sm"><p>{i18n.language.startsWith("ru") ? "Поля и настройки визуализации этого черновика будут сброшены. Сменить таблицу?" : "This draft’s fields and visualization settings will be reset. Change table?"}</p><div className="mt-3 flex gap-2"><Button onClick={() => { setDraft(current => resetWidgetSource(current, pendingTable)); setPreviewPage(1); setPendingTable(undefined); }}>{i18n.language.startsWith("ru") ? "Сменить таблицу" : "Change table"}</Button><Button variant="secondary" onClick={() => setPendingTable(undefined)}>{t("action.cancel")}</Button></div></div>}
      <section hidden={mode !== "data"} className="builder-data min-h-0 flex-1 overflow-auto">
        <nav aria-label={labels.data} className="builder-data-toolbar flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <Tabs variant="segment" ariaLabel={labels.data} tabs={[{ id: "source", label: labels.source, icon: DatabaseIcon }, { id: "fields", label: labels.fields, icon: ListIcon }, { id: "parameters", label: i18n.language.startsWith("ru") ? "Параметры" : "Parameters", icon: BracesIcon, count: sourceKind === "sql" && sqlDataset.source.kind === "sql" ? namedSqlParameters(sqlDataset.source.sql).length : 0 }]} activeId={dataTab} onSelect={(tab) => setDataTab(tab as typeof dataTab)} />
          {dataTab === "fields" && fieldsToolbar}
        </nav>
        <div hidden={dataTab !== "source"} className={sourceKind === "table" ? "builder-table-source flex min-h-0 flex-1 flex-col" : "builder-source mx-auto w-full max-w-[860px] space-y-5 p-6"}>
          <div className={sourceKind === "table" ? "flex shrink-0 flex-wrap items-center gap-5 border-b border-border px-4 py-3" : "space-y-5"}>
            <h2 className="text-lg font-semibold">{labels.source}</h2>
            <div className="builder-source-kind flex flex-wrap items-center gap-3"><span className="text-sm text-fg-muted">{copy.sourceTab}</span><Tabs variant="segment" ariaLabel={copy.sourceTab} tabs={[{ id: "table", label: labels.table, icon: Table2Icon }, { id: "sql", label: "SQL", icon: CodeIcon }]} activeId={sourceKind} onSelect={(kind) => { if (kind === "sql") setSqlDataset((current) => syncVisualSql(current, effectiveTable || (current.source.kind === "sql" ? current.source.visual?.base.table : "") || "", sqlCatalog.tables)); setSourceKind(kind as typeof sourceKind); }} /></div>
          </div>
          {sourceKind === "table" ? <div className="builder-table-split grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="builder-table-list flex min-h-0 flex-col border-b border-border p-3 md:border-r md:border-b-0"><BuilderSources active={mode === "data" && dataTab === "source"} value={effectiveTable} language={language} onPick={tableSlug => { if (tableSlug === effectiveTable) return; if (effectiveTable && sourceChangeNeedsConfirmation(draft)) setPendingTable(tableSlug); else { setDraft(current => resetWidgetSource(current, tableSlug)); setPreviewPage(1); } }} /></aside>
            <section className="builder-table-fields flex min-h-0 min-w-0 flex-col" aria-label={i18n.language.startsWith("ru") ? "Поля и предпросмотр таблицы" : "Table fields and preview"}>
              <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2"><h3 className="truncate text-sm font-medium">{sourceName || labels.fields}</h3>{fieldsToolbar}</header>
              {mode === "data" && dataTab === "source" && fieldsPane}
            </section>
          </div> : <div className="space-y-4"><SqlQueryEditor tableSlug={effectiveTable} active dataset={sqlDataset} menuId={menuId} onChange={setSqlDataset} /></div>}
        </div>
        {mode === "data" && dataTab === "fields" && fieldsPane}

        <div hidden={dataTab !== "parameters" || sourceKind !== "table"} className="mx-auto w-full max-w-[860px] p-6"><p className="text-sm text-fg-muted">{i18n.language.startsWith("ru") ? "Параметры нужны только для SQL." : "Parameters apply to SQL only."}</p></div>
        <div hidden={sourceKind !== "sql" || dataTab === "fields"} className="mx-auto w-full max-w-[860px] min-w-0 px-6 pb-6">
          <SqlDatasetRunner autoRun={Boolean(existingSql)} active={sourceKind === "sql"} disabled={Boolean(sqlPlanIssue)} menuId={menuId} sql={sqlDataset.source.kind === "sql" ? sqlDataset.source.sql : ""} parameters={sqlDataset.source.kind === "sql" ? sqlDataset.source.parameters : []} previewFields onResult={receiveResult} parameterEditor={(runValues, onValueChange, sharedNames) => <BuilderParameters dataset={sqlDataset} onChange={setSqlDataset} language={i18n.language} values={runValues} onValueChange={onValueChange} sharedNames={sharedNames} />} />
          <Button className="mt-4" type="button" variant="secondary" disabled={!sqlResult} onClick={() => setMode("viz")}>{labels.viz} →</Button>
        </div>
      </section>
      <section hidden={mode !== "viz"} className="min-h-0 flex-1 overflow-auto md:overflow-hidden">
        <div className="grid min-h-full md:h-full md:min-h-0 md:grid-cols-[250px_260px_minmax(0,1fr)]">
          <BuilderFields widget={sourceKind === "sql" ? sqlWidget : draft} fields={sourceKind === "sql" ? sqlFields : schema.fields} language={language} labels={labels} sql={sourceKind === "sql"} onChange={(patch) => sourceKind === "sql" ? setSqlWidget((current) => ({ ...current, ...patch })) : change(patch)} />
          <div className="builder-settings flex min-h-0 flex-col gap-3 border-r border-border md:overflow-y-auto">
            <button type="button" onClick={() => { setMode("data"); setDataTab("source"); }} className="builder-source-link self-start text-sm text-fg-muted hover:text-fg">{sourceKind === "sql" ? "SQL" : sourceName || labels.source} ↗</button>
            {sourceKind === "table" ? <>
          {slug || draft.type === "heading" ? <>
            <VisualizationPicker compact value={visualizationOf(draft)} onChange={(kind) => { setDraft((current) => selectVisualization(current, kind, schema.fields)); setPreviewPage(1); }} />
            <BuilderSlots widget={draft} fields={schema.fields} language={language} labels={labels} sql={false} onChange={change} />


            {draft.type !== "heading" && <Popover trigger={({ open, toggle }) => <Button type="button" size="sm" variant="ghost" data-builder-filter aria-expanded={open} className="self-start" onClick={toggle}><Icon as={FilterIcon} size={14} />{t("dashboard.cardFilters")}{filterCount > 0 ? ` (${filterCount})` : ""}</Button>}>
              {() => <div className="w-[360px] max-w-[85vw] p-2"><p className="mb-2 text-sm font-medium">{t("dashboard.cardFilters")}</p><div className="[&>div]:mx-0 [&>div]:border-b-0 [&>div]:px-0"><FilterBar columns={schema.fields.filter((f) => !draft.calculatedFields?.some((d) => d.slug === f.slug))} relations={schema.relations} language={language} filters={draft.filters} sorts={[]} onFilters={(own) => change({ filters: own })} onSorts={noop} /></div></div>}
            </Popover>}
          </> : <p className="py-3 text-sm text-fg-muted">{t("dashboard.pickTableFirst")}</p>}
          <Popover className="builder-chart-options" trigger={({ open, toggle }) => <button type="button" aria-label={t("dashboard.advancedSettings")} aria-expanded={open} onClick={toggle} className="rounded p-1.5 text-fg-muted hover:bg-surface-hover"><Icon as={SlidersHorizontalIcon} size={16} /></button>}>
            {() => <div className="flex w-[260px] max-w-[85vw] flex-col gap-3 p-3"><ChartAppearance compact widget={draft} onChange={change} /><details><summary className="cursor-pointer text-xs text-fg-muted">{i18n.language.startsWith("ru") ? "Дополнительно" : "Advanced"}</summary><div className="mt-3 flex flex-col gap-3"><WidgetFields widget={draft} fields={schema.fields} language={language} onChange={change} />            {grouped && <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span>{t("dashboard.showEmpty")}<span className="mt-0.5 block text-xs text-fg-muted">{t("dashboard.showEmptyHint")}</span></span><input type="checkbox" role="switch" aria-label={t("dashboard.showEmpty")} checked={draft.showEmpty ?? false} onChange={(event) => change({ showEmpty: event.target.checked })} className="size-4 shrink-0 accent-accent" /></label>}
              {chart && !["scatter", "bubble", "map"].includes(draft.kind) && <ChartRoles config={draft} columns={schema.fields} language={language} onChange={change} />}
              {chart && splittable(draft.kind) && !needsSplit(draft.kind) && !draft.measures?.length && <Field label={t("chart.split")}><Dropdown ariaLabel={t("chart.split")} value={draft.splitSlug} items={[{ value: "", label: t("chart.splitNone") }, ...schema.fields.filter((field) => field.slug !== draft.groupSlug).map((field) => builderFieldOption(field, language))]} onChange={(splitSlug) => change({ splitSlug, splitBucket: "" })} /></Field>}
              {draft.type === "records" && <Field label={t("dashboard.pageSize")}><Dropdown ariaLabel={t("dashboard.pageSize")} value={String(draft.pageSize ?? 20)} items={[10, 20, 25, 50, 100].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => change({ pageSize: Number(value) })} /></Field>}
              {draft.type !== "records" && draft.aggregation !== "count" && <Field label={t("dashboard.currencyField")}><Dropdown value={draft.currencySlug ?? ""} items={[{ value: "", label: t("dashboard.currencyAuto") }, ...schema.fields.map((field) => builderFieldOption(field, language))]} onChange={(currencySlug) => change({ currencySlug })} /></Field>}
              {filters.length > 0 && draft.type !== "heading" && <div className="flex flex-col gap-2"><span className="text-sm font-medium">{t("dashboard.answers")}</span>{filters.map((filter) => { const key = filterKey(filter); return <AnswerPicker key={key} menuId={menuId} filter={filter} fields={schema.fields} relations={schema.relations} language={language} value={draft.answers[key]} onChange={(answer) => { const answers = { ...draft.answers }; if (answer) answers[key] = answer; else delete answers[key]; change({ answers }); }} />; })}</div>}
              {grouped && draft.groupSlug && !draft.groupBucket && <Field label={t("dashboard.chartInteraction")}><Dropdown value={draft.interaction?.scope ?? "off"} items={[{ value: "off", label: t("dashboard.interactionOff") }, { value: "card", label: t("dashboard.interactionCard") }, { value: "dashboard", label: t("dashboard.interactionDashboard") }]} onChange={(scope) => { const next = { ...draft }; if (scope === "off") delete next.interaction; else next.interaction = { scope: scope as "card" | "dashboard" }; setDraft(next); }} /></Field>}
              {datasets.some((dataset) => dataset.source.kind === "table" && !dataset.source.joins.length) && <Field label={t("dashboard.savedDataset")}><Dropdown ariaLabel={t("dashboard.savedDataset")} value={draft.datasetId ?? ""} items={[{ value: "", label: t("dashboard.directTable") }, ...datasets.filter((dataset) => dataset.source.kind === "table" && !dataset.source.joins.length).map((dataset) => ({ value: dataset.id, label: dataset.name }))]} onChange={(id) => { const dataset = datasets.find((item) => item.id === id); if (dataset?.source.kind === "table") { const next = resetWidgetSource(draft, dataset.source.tableSlug); setDraft({ ...next, datasetId: id, ...(draft.type === "records" ? { columns: dataset.source.fields } : {}) }); } else { const next = { ...draft }; delete next.datasetId; setDraft(next); } setPreviewPage(1); }} /></Field>}
              {!slug && <Button type="button" size="sm" variant="secondary" onClick={() => setDraft((current) => selectVisualization(current, "heading", schema.fields))}>{t("dashboard.widget.heading")}</Button>}
            </div></details></div>}
          </Popover>

            </> : <>
            <VisualizationPicker compact value={visualizationOf(sqlWidget)} allowed={SQL_VISUALIZATIONS} onChange={(kind) => setSqlWidget((current) => ({ ...selectVisualization(current, kind, sqlFields), aggregation: "sum" }))} />

            <BuilderSlots widget={sqlWidget} fields={sqlFields} language={language} labels={labels} sql onChange={(patch) => setSqlWidget((current) => ({ ...current, ...patch }))} /><ChartRoles config={sqlWidget} columns={sqlFields} language={language} onChange={(patch) => setSqlWidget((current) => ({ ...current, ...patch }))} />


            <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm text-fg-muted">{copy.advanced}</summary><div className="mt-2 flex flex-col gap-2"><ChartAppearance compact widget={sqlWidget} onChange={(patch) => setSqlWidget((current) => ({ ...current, ...patch }))} /><SqlWidgetOptions compact widget={sqlWidget} fields={sqlFields} onChange={(patch) => setSqlWidget((current) => ({ ...current, ...patch }))} />{sqlWidget.type !== "records" && sqlWidget.kind !== "stat" && <Field label={copy.split}><Dropdown ariaLabel={copy.split} value={sqlWidget.splitSlug} items={[{ value: "", label: copy.splitNone }, ...sqlFields.filter((field) => field.slug !== sqlWidget.groupSlug).map((field) => builderFieldOption(field, language))]} onChange={(splitSlug) => setSqlWidget({ ...sqlWidget, splitSlug })} /></Field>}</div></details>

            </>}
          </div>
          <div className="dashboard-widget-preview flex min-h-[380px] min-w-0 flex-col gap-3 bg-surface p-5 md:min-h-0">
          {sourceKind === "sql" ? <div data-builder-visual-preview className="flex min-h-0 flex-1 flex-col overflow-auto"><h3 className="mb-3 text-base font-medium">{sqlWidget.title}</h3>{sqlResult ? <SqlResultView fitContainer fieldPresentation={sqlWidget.fieldPresentation} result={sqlResult} language={i18n.language} presentation={{ hideSinglePagePagination:sqlWidget.sqlHideSinglePagePagination, formatNumbers:sqlWidget.sqlFormatNumbers, pivot:sqlWidget.sqlPivot, suffixJoined: sqlWidget.sqlSuffixJoined, detailSuffixFractional: sqlWidget.sqlDetailSuffixFractional, detailDecimals: sqlWidget.sqlDetailDecimals, quickFilterField: sqlWidget.sqlQuickFilterField, selectionValueField: sqlWidget.sqlSelectionValueField, records: sqlWidget.sqlRecords, aggregation: sqlWidget.aggregation, detailPlacement: sqlWidget.sqlDetailPlacement, detailSuffix: sqlWidget.sqlDetailSuffix, detailSeparator: sqlWidget.sqlDetailSeparator, measures: sqlWidget.measures, type: sqlWidget.type === "records" ? "table" : "chart", kind: sqlWidget.kind, group: sqlWidget.groupSlug, value: sqlWidget.valueSlug, split: sqlWidget.splitSlug, showLegend: sqlWidget.showLegend, showGrid: sqlWidget.showGrid, stacked: sqlWidget.stacked, comfortable: sqlWidget.sqlTableComfortable, rowHeight: sqlWidget.sqlRowHeight, columnWidths: sqlWidget.columnWidths, linkField: sqlWidget.sqlLinkField, linkLabel: sqlWidget.sqlLinkLabel, linkTemplate: sqlWidget.sqlLinkTemplate, appearance: sqlWidget.appearance, sorts: sqlWidget.sorts, columns: sqlWidget.columns, pageSize: sqlWidget.pageSize, paginationTop: sqlWidget.sqlPaginationTop, detailField: sqlWidget.sqlDetailField, suffix: sqlWidget.sqlSuffix, suffixBelow: sqlWidget.sqlSuffixBelow }} onPresentation={(next) => setSqlWidget((current) => ({ ...current, ...(next.columns ? { columns: next.columns } : {}) }))} allowColumnSelection hidePicker /> : <p className="text-sm text-fg-muted">{copy.beforePreview}</p>}</div> : <ChartCard hideHeader config={{ ...draft, title, width: 12 }} columns={schema.fields} relations={schema.relations} rows={[]} language={language} showRowCount={false} scrollContent={draft.type !== "records"} aside={draft.type === "records" ? undefined : <WidgetStatus widget={draft} data={data} compact />} content={<WidgetContents widget={draft} data={data} language={language} editing page={previewPage} sorts={draft.sorts ?? []} onPage={setPreviewPage} onSorts={(sorts) => change({ sorts })} onChange={change} />} editing={false} dragged={false} over={false} onDragStart={noop} onDragEnd={noop} onDragOver={noop} onDrop={noop} onMove={noop} onChange={noop} onRemove={noop} plain />}
          </div>
        </div>
      </section>
      <footer className="builder-footer flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3"><span className="mr-auto hidden text-xs text-fg-muted sm:block">{t("dashboard.saveAfterAdding")}</span><Button type="button" variant="secondary" onClick={onClose}>{t("action.cancel")}</Button></footer>
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
