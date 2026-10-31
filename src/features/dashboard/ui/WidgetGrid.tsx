import { sectionCanvas } from "../model/widget-sections";
import type { CSSProperties } from "react";
import { widgetAutoHeight, widgetDisplayHeight, LAYOUT_CELL, LAYOUT_GAP, MAX_LAYOUT_ROW, layoutHeight, layoutRows, placeWidgets, swapWidgetPositions } from "../model/widget-layout";
import type { SqlSelection } from "../model/sql-result-filters";
import "./widget-layout.css";
import { useEffect, useRef, useState } from "react";
import { ChartColumnIcon, CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, FilterBar, newChart, type Filters, type Sort } from "@/features/item";
import { localized } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { moveBefore } from "@/shared/lib/order";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useWidgetData } from "../api/widget-data";
import { Popover } from "@/shared/ui/popover";
import { WidgetContents, WidgetStatus } from "./WidgetContents";
import type { Dataset } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import { type DashFilter, type FilterValues } from "../model/filters";
import { WidgetEditor } from "./WidgetEditor";
import { useDashboardSqlScope } from "./SqlMonthControls";
import { stageSqlWidget } from "../model/sql-widget";

/**
 * Сетка виджетов дашборда: карточки CHART, у каждой своя таблица.
 * Порядок и размер — как у CHART: 12 колонок, перестановка броском.
 * Сам виджет настраивается в диалоге (WidgetEditor), не в карточке.
 */
export function WidgetGrid({
  widgets,
  datasets,
  menuId,
  filters,
  values,
  editing,
  editable,
  onWidgets: persistWidgets,
  onSourceSave: persistSource,
  onBeginEditing,
}: {
  widgets: Widget[];
  datasets: Dataset[];
  menuId: string;
  filters: DashFilter[];
  values: FilterValues;
  editing: boolean;
  /** Можно ли менять дашборд вообще — тогда пустой экран зовёт добавить. */
  editable: boolean;
  onWidgets: (next: Widget[]) => void;
  onSourceSave: (widgets: Widget[], datasets: Dataset[]) => void;
  onBeginEditing: () => void;
}) {
  const { t } = useTranslation();
  const onWidgets = (next: Widget[], preferred?: string) => persistWidgets(placeWidgets(next, preferred));
  const onSourceSave = (next: Widget[], sources: Dataset[], preferred?: string) => persistSource(placeWidgets(next, preferred), sources);
  const sqlParameterScope = useDashboardSqlScope();
  const [sqlCross, setSqlCross] = useState<Record<string, SqlSelection>>({});
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const [wide,setWide]=useState(false);
  const gridRoot=useRef<HTMLDivElement>(null);
  useEffect(()=>{const element=gridRoot.current;if(!element)return;const update=()=>setWide(element.clientWidth>=760 && window.innerWidth>=1024);const observer=new ResizeObserver(update);observer.observe(element);window.addEventListener('resize',update);update();return()=>{observer.disconnect();window.removeEventListener('resize',update);};},[]);
  const placed = placeWidgets(widgets, undefined, editing || widgets.some(w=>w.section) ? undefined : contentHeights);
  const heightFor = (widget: Widget) => widgetDisplayHeight(widget,contentHeights[widget.id],editing);
  const positioned = widgets.some((widget) => widget.layout);
  const arranged = positioned ? [...placed].sort((a, b) => (a.layout?.row ?? MAX_LAYOUT_ROW) - (b.layout?.row ?? MAX_LAYOUT_ROW) || (a.layout?.column ?? 1) - (b.layout?.column ?? 1)) : widgets;
  const canvas = sectionCanvas(placed,heightFor,!editing && wide);
  const canvasHeight = canvas.height;
  const widgetIds = widgets.map((widget) => widget.id).join(",");
  useEffect(() => { setSqlCross({}); }, [menuId, widgetIds, sqlParameterScope]);
  const [cross, setCross] = useState<Record<string, Filters>>({});
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** Открытый редактор: виджет и новый ли он. */
  const [editor, setEditor] = useState<{ widget: Widget; isNew: boolean } | null>(null);

  const reorder = (ids: string[]) =>
    onWidgets(ids.map((id) => placed.find((w) => w.id === id)).filter((w): w is Widget => Boolean(w)));

  const swapPlacement = (from: string, to: string) => {
    const next = swapWidgetPositions(placed, from, to);
    if (!next) return false;
    onWidgets(next, from);
    return true;
  };
  const move = (id: string, delta: number) => {
    const ids = arranged.map((w) => w.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    if (swapPlacement(id, ids[to]!)) return;
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    reorder(ids);
  };

  const drop = (target: string) => {
    if (dragged && dragged !== target && !swapPlacement(dragged, target)) reorder(moveBefore(widgets.map((w) => w.id), dragged, target));
    setDragged(null);
    setOver(null);
  };

  const add = () => { if (!editing) onBeginEditing(); setEditor({ widget: { ...newChart(), kind: "stat", tableSlug: "", filters: {}, answers: {} }, isNew: true }); };

  const save = (widget: Widget, dataset?: Dataset) => {
    const next = dataset ? stageSqlWidget(datasets, widget, dataset) : { widget, datasets };
    const widgetsNext = (widgets.some((w) => w.id === widget.id) ? widgets.map((w) => w.id === widget.id ? next.widget : w) : [...widgets, next.widget]).map(w=>next.widget.section && w.section?.id===next.widget.section.id ? {...w,section:next.widget.section} : w);
    if (dataset) onSourceSave(widgetsNext, next.datasets, widget.id); else onWidgets(widgetsNext, widget.id);
    setEditor(null);
  };

  const dialog = editor && <WidgetEditor key={editor.widget.id} datasets={datasets} initial={editor.widget} isNew={editor.isNew} filters={filters} values={values} menuId={menuId} onSave={save} onClose={() => setEditor(null)} />;

  if (!widgets.length) {
    /* Пустой дашборд — как «Моя аналитика» professio: зовёт собрать. */
    return (
      <>
        <div className="grid place-items-center rounded-lg border border-dashed border-border px-8 py-20 text-center">
          <div className="flex max-w-md flex-col items-center gap-2">
            <span className="mb-1 grid size-12 place-items-center rounded-xl bg-accent-subtle text-accent-text">
              <Icon as={ChartColumnIcon} size={22} />
            </span>
            <h3 className="text-base font-semibold text-fg">{t("dashboard.emptyTitle")}</h3>
            <p className="text-sm text-fg-muted">{t("dashboard.emptyDescription")}</p>
            {editable && (
              <Button type="button" size="sm" className="mt-2" onClick={add}>
                <Icon as={PlusIcon} size={14} />
                {t("dashboard.addFirstWidget")}
              </Button>
            )}
          </div>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <>{Object.keys(sqlCross).length > 0 && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted" aria-label="SQL selections">{Object.entries(sqlCross).map(([id, selection]) => <Button key={id} type="button" size="sm" variant="secondary" onClick={() => setSqlCross((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))}>{selection.field}: {selection.key ?? selection.value} ×</Button>)}<Button type="button" size="sm" variant="secondary" onClick={() => setSqlCross({})}>{t("dashboard.clearCrossFilters")}</Button></div>}{Object.keys(cross).length > 0 && <div className="mb-2 flex items-center gap-2 text-xs text-fg-muted"><span>{t("dashboard.crossFilterActive")}</span><Button type="button" size="sm" variant="secondary" onClick={() => setCross({})}>{t("dashboard.clearCrossFilters")}</Button></div>}<div className="mb-3 flex items-center justify-between gap-2">{editing ? <p role="status" className="text-xs text-fg-muted">{t("dashboard.draftHint")}</p> : <span />}{editable && <Button type="button" size="sm" variant="secondary" onClick={add}><Icon as={PlusIcon} size={14} />{t("dashboard.addWidget")}</Button>}</div><div ref={gridRoot} data-chart-grid-layout style={{ "--dashboard-row-unit": `${LAYOUT_CELL}px`, "--dashboard-row-gap": `${LAYOUT_GAP}px`, "--dashboard-height": `${canvasHeight + (editing ? 276 : 0)}px`, "--dashboard-add-top": `${canvasHeight + LAYOUT_GAP}px` } as CSSProperties} className={`grid grid-cols-1 gap-3 lg:grid-cols-12 ${positioned ? `dashboard-positioned-grid ${wide ? "dashboard-grid-wide" : ""}` : ""}`}>
      {canvas.frames.map(frame=><div key={frame.id} aria-hidden="true" data-dashboard-section={frame.id} className="dashboard-section-frame pointer-events-none rounded-2xl border border-border bg-surface" style={{top:frame.top,height:frame.height}}/>)}
      {arranged.map((widget) => { const box=canvas.cards[widget.id]!; const card = <WidgetCard
          key={widget.id}
          widget={widget}
          sqlSelectedSeries={sqlCross[widget.id]?.series}
          sqlSelectedKey={sqlCross[widget.id]?.key ?? sqlCross[widget.id]?.value}
          fittedHeight={box.height}
          onAutoHeight={(height) => setContentHeights(current => current[widget.id] === height ? current : { ...current, [widget.id]: height })}
          sqlSelections={Object.entries(sqlCross).filter(([id]) => id !== widget.id).map(([, selection]) => selection)}
          onSqlPick={(value, series, key) => { const rule = (series ? widget.sqlSelectionRules?.[series] : undefined) || widget.sqlSelectionRules?.["$category"]; const field = rule?.field || widget.sqlSelectionField; if (field) setSqlCross(current => current[widget.id]?.value === value && current[widget.id]?.series === series ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== widget.id)) : { ...current, [widget.id]: { ...rule, field, value, ...(series ? { series } : {}), ...(key ? { key } : {}) } }); }}
          datasets={datasets}
          selection={cross[widget.datasetId ? datasets.find((d) => d.id === widget.datasetId)?.source.kind === "table" ? (datasets.find((d) => d.id === widget.datasetId)!.source as { tableSlug: string }).tableSlug : widget.tableSlug : widget.tableSlug] ?? {}}
          onSelect={(table, filter) => setCross((current) => ({ ...current, [table]: filter }))}
          menuId={menuId}
          filters={filters}
          values={values}
          editing={editing}
          dragged={dragged === widget.id}
          over={over === widget.id && Boolean(dragged)}
          onDragStart={() => setDragged(widget.id)}
          onDragEnd={() => {
            setDragged(null);
            setOver(null);
          }}
          onDragOver={() => setOver(widget.id)}
          onDrop={() => drop(widget.id)}
          onMove={(delta) => move(widget.id, delta)}
          onMoveTo={(target) => { if (!swapPlacement(widget.id,target)) reorder(moveBefore(widgets.map(w=>w.id),widget.id,target)); setDragged(null); setOver(null); }}
          onChange={(patch) => onWidgets(placed.map((w) => (w.id === widget.id ? w.layout && patch.height !== undefined ? { ...w, ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "height")), layout: { ...w.layout, rows: layoutRows(patch.height) } } : { ...w, ...patch } : w)), widget.id)}
          onRemove={() => onWidgets(placed.filter((w) => w.id !== widget.id))}
          onEdit={() => setEditor({ widget, isNew: false })}
          onDuplicate={() => {
            const at = placed.findIndex((item) => item.id === widget.id) + 1;
            const copy = { ...widget, ...(widget.layout ? { layout: { ...widget.layout, row: Math.min(MAX_LAYOUT_ROW, Math.max(...widgets.map((item) => item.layout ? item.layout.row + item.layout.rows : 1))) } } : {}), id: crypto.randomUUID(), title: widget.title && `${widget.title} (${t("dashboard.copy")})` };
            onWidgets([...placed.slice(0, at), copy, ...placed.slice(at)]);
          }}
        />; return positioned ? <div key={widget.id} className="dashboard-positioned-widget min-w-0" style={{ "--widget-left": `${((widget.layout?.column ?? 1) - 1) / 12}`, "--widget-width": `${widget.width / 12}`, "--widget-inset": `${box.inset}px`, "--widget-top": `${box.top}px`, "--widget-height": `${box.height}px` } as CSSProperties}>{card}</div> : card; })}

      {/* Место под следующий виджет — в самой сетке, размером с новый:
          видно, куда он встанет. */}
      {editing && (
        <button
          type="button"
          onClick={add}
          data-dashboard-add
          className="flex h-[260px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-fg-muted transition-colors hover:border-accent hover:bg-accent-subtle hover:text-accent-text lg:col-span-6"
        >
          <Icon as={PlusIcon} size={20} />
          {t("dashboard.addWidget")}
        </button>
      )}
      {dialog}
    </div></>
  );
}

/** Card defaults are persisted; viewer constraints belong only to this card. */
function WidgetCard({ widget, fittedHeight, onAutoHeight, sqlSelectedKey, sqlSelectedSeries, sqlSelections, onSqlPick, datasets, menuId, selection, onSelect, filters, values, editing, onChange, onEdit, onDuplicate, ...card }: {
  widget: Widget; fittedHeight: number; onAutoHeight: (height: number) => void; sqlSelectedKey?: string | undefined; sqlSelectedSeries?: string | undefined; sqlSelections: SqlSelection[]; onSqlPick: (value: string, series?: string, label?: string) => void; datasets: Dataset[]; selection: Filters; onSelect: (table: string, filter: Filters) => void; menuId: string; filters: DashFilter[]; values: FilterValues; editing: boolean;
  dragged: boolean; over: boolean; onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void;
  onMove: (delta: number) => void; onMoveTo: (target:string) => void; onChange: (patch: Partial<Widget>) => void; onRemove: () => void; onEdit: () => void; onDuplicate: () => void;
}) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [sqlTitle,setSqlTitle] = useState<string>();
  useEffect(()=>{setSqlTitle(undefined);},[widget.datasetId,widget.sqlTitleField]);
  const [picked, setPicked] = useState<Filters>({});
  const [viewer, setViewer] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [sorts, setSorts] = useState<Sort[] | undefined>(undefined);
  const savedSorts = JSON.stringify(widget.sorts ?? []);
  useEffect(() => { setSorts(undefined); setViewer({}); setPicked({}); setPage(1); }, [widget.tableSlug, savedSorts]);
  const fingerprint = JSON.stringify([widget.filters, viewer, picked, selection, values, sorts, widget.tableSlug, widget.pageSize]);
  useEffect(() => { setPage(1); }, [fingerprint]);
  const data = useWidgetData(widget, filters, values, menuId, viewer, page, sorts, datasets, selection, picked);
  if (widget.type !== "heading" && (data.denied || data.forbidden) && !data.error && !editing) return null;
  const action = (label: string, icon: typeof PencilIcon, onClick: () => void) => <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-fg-subtle hover:bg-surface-hover hover:text-fg"><Icon as={icon} size={14} /></button>;
  return <ChartCard {...card} config={!editing && sqlTitle ? {...widget,title:sqlTitle} : widget} naturalContentHeight={(widget.sqlTableFitContent || widgetAutoHeight(widget)) && !editing ? naturalHeight : undefined} onAutoHeight={onAutoHeight} sizeRows={widget.layout || widgetAutoHeight(widget) ? { value: fittedHeight, min: 80, max: layoutHeight(12), unit: 1, gap: 0 } : undefined} columns={data.schema.fields} relations={data.schema.relations} rows={[]} language={language} editing={editing} onChange={onChange} inlineSetup={false} showRowCount={false} scrollContent={widget.type !== "records" || widget.sqlTableFitContent === true}
    headerActions={<>{action(t("dashboard.duplicate"), CopyIcon, onDuplicate)}{action(t("dashboard.editWidget"), PencilIcon, onEdit)}</>}
    viewerActions={widget.type === "heading" || data.dataset?.source.kind === "sql" ? undefined : <Popover trigger={({ open, toggle }) => <button type="button" aria-expanded={open} onClick={toggle} className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-hover">{t("dashboard.cardFilters")}{Object.keys(viewer).length ? ` (${Object.keys(viewer).length})` : ""}</button>}>{() => <div className="w-[360px] max-w-[85vw] p-2"><p className="mb-1 text-xs text-fg-muted">{t("dashboard.viewerScope")}</p><FilterBar columns={data.schema.fields} relations={data.schema.relations} language={language} filters={viewer} sorts={[]} onFilters={setViewer} onSorts={() => {}} /><Button type="button" size="sm" variant="secondary" onClick={() => { setViewer({}); setPicked({}); }}>{t("dashboard.resetViewer")}</Button></div>}</Popover>}
    aside={data.dataset?.source.kind === "sql" ? undefined : <><WidgetStatus widget={widget} data={data} /><div aria-label={t("dashboard.effectiveFilters")} className="flex flex-wrap gap-1">{Object.entries(data.query).filter(([slug]) => slug !== "guid").map(([slug, filter]) => { const field = data.schema.fields.find((f) => f.slug === slug); return field ? <span key={slug} className="max-w-64 truncate rounded-full bg-surface-soft px-2 py-0.5 text-2xs text-fg-muted">{localized(field.labels, language, field.label)}: {field.relationId ? t("dashboard.selectedCount", { count: filter.values.length }) : filter.values.join(" — ")}</span> : null; })}</div></>}
    content={<WidgetContents onSqlTitle={setSqlTitle} onSqlHeight={setNaturalHeight} sqlSelectedSeries={sqlSelectedSeries} sqlSelectedKey={sqlSelectedKey} sqlSelections={sqlSelections} onSqlPick={onSqlPick} widget={widget} data={data} language={language} editing={editing} page={page} sorts={data.effectiveSorts} onPage={setPage} onSorts={setSorts} onChange={onChange} onSelect={(filter) => {
      const table = data.dataset?.source.kind === "table" ? data.dataset.source.tableSlug : widget.tableSlug;
      if (widget.interaction?.scope === "dashboard") onSelect(table, filter);
      else setPicked((current) => JSON.stringify(current) === JSON.stringify(filter) ? {} : filter);
    }} />}
  />;
}
