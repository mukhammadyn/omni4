import { parseFilters, toCharts, toChartsAttribute, toAggregation, type ChartConfig, type ChartMeasure, type Filters, type Sort } from "@/features/item";
import { MAX_LAYOUT_ROW, layoutRows, placeWidgets } from "./widget-layout";
import { parseWidgetSection, type WidgetSection } from "./widget-sections";
import { parseCalculatedFields, type CalculatedField } from "./calculated-fields";
import { parseFieldPresentation, type FieldPresentation } from "./field-presentation";
import { toDatasets, type Dataset } from "./datasets";
import { parseSqlSelectionRules, type SqlSelectionRule } from "./sql-result-filters";
import { parseSqlRecordOptions, type SqlRecordOptions } from "./sql-record-options";
import type { Answer, DashFilter } from "./filters";

/**
 * График CHART плюс своя таблица: на дашборде у каждого виджета она своя.
 * `filters` — свой отбор, `answers` — какими полями он отвечает
 * на общие фильтры, по ключу фильтра (`filterKey`).
 */
export const WIDGET_TYPES = ["chart", "records", "pivot", "ratio", "goal", "heading", "breakdown", "transitions"] as const;
export type WidgetType = typeof WIDGET_TYPES[number];
export type Widget = ChartConfig & {
  refreshInterval?: number;
  section?: WidgetSection | undefined;
  layout?: { column: number; row: number; rows: number } | undefined;
  sqlRecords?: SqlRecordOptions | undefined;
  sqlTitleField?: string;
  sqlDetailField?: string;
  sqlDetailPlacement?: "above" | "inline" | "below";
  sqlDetailSuffix?: string;
  sqlDetailSuffixFractional?: string;
  sqlDetailDecimals?: number;
  sqlSuffixJoined?: boolean;
  sqlDetailSeparator?: string;
  sqlSuffix?: string;
  sqlSuffixBelow?: boolean;
  sqlShowViewerFilters?: boolean;
  sqlLinkField?: string;
  sqlLinkLabel?: string;
  sqlLinkTemplate?: string;
  sqlSelectionField?: string;
  sqlSelectionValueField?: string;
  sqlQuickFilterField?: string;
  sqlQuickFilterStyle?: "buttons" | "select";
  sqlSearchField?: string;
  sqlSelectionRules?: Record<string,SqlSelectionRule>;
  sqlReceiveSelections?: boolean;
  sqlPaginationTop?: boolean;
  sqlTableFitContent?: boolean;
  sqlTableComfortable?: boolean;
  sqlRowHeight?: number;
  calculatedFields?: CalculatedField[];
  fieldPresentation?: FieldPresentation;
  tableSlug: string; filters: Filters; answers: Record<string, Answer>;
  type?: WidgetType;
  datasetId?: string;
  body?: string;
  pivotRows?: string[];
  pivotSkipEmpty?: boolean;
  ratio?: { numerator: ChartMeasure; denominator: ChartMeasure; percent: boolean };
  goal?: number;
  columns?: string[];
  columnWidths?: Record<string, number>;
  sorts?: Sort[];
  pageSize?: number;
  currencySlug?: string;
};

export type Dashboard = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  filters: DashFilter[];
  widgets: Widget[];
};

/** Папка дашбордов. Модуль — id папки меню с `is_tab` (ADR-0010). */
export type Folder = { id: string; moduleId: string; title: string; dashboards: Dashboard[] };

export type Tree = { folders: Folder[]; datasets?: Dataset[] };

export const DEFAULT_EMOJI = "📊";

/** Строк на таблицу, по которым считается виджет (ADR-0013). */
export const SAMPLE = 1000;

/**
 * `attributes.dashboards` пункта-хранилища → дерево (ADR-0013).
 *
 * С недоверием, как `charts` у CHART: мусорный виджет, дашборд или папка
 * пропадают, а не роняют экран.
 */
export function toTree(value: unknown): Tree {
  const folders = list(isObject(value) ? value["folders"] : undefined).map(
    (folder, index): Folder => ({
      id: text(folder["id"]) || `folder-${index}`,
      moduleId: text(folder["module_id"]),
      title: text(folder["title"]),
      dashboards: list(folder["dashboards"]).map((dashboard, at) => ({
        id: text(dashboard["id"]) || `dashboard-${index}-${at}`,
        title: text(dashboard["title"]),
        emoji: text(dashboard["emoji"]) || DEFAULT_EMOJI,
        description: text(dashboard["description"]),
        filters: list(dashboard["filters"]).flatMap(toDashFilter),
        widgets: list(dashboard["widgets"]).flatMap((item) => {
          // По одному: toCharts выбрасывает мусор, и сопоставлять таблицу
          // с графиком по индексу после фильтра было бы мимо.
          const [chart] = toCharts([item]);
          return chart
            ? [
                {
                  ...chart,
                  ...(parseWidgetSection(item["section"]) ? {section:parseWidgetSection(item["section"])!} : {}),
                  ...(["buttons","select"].includes(item["sqlQuickFilterStyle"] as string) ? {sqlQuickFilterStyle:item["sqlQuickFilterStyle"] as "buttons"|"select"} : {}),
                  ...(item["sqlSelectionRules"] ? { sqlSelectionRules: parseSqlSelectionRules(item["sqlSelectionRules"]) } : {}),
                  ...(parseSqlRecordOptions(item["sqlRecords"]) ? { sqlRecords: parseSqlRecordOptions(item["sqlRecords"])! } : {}),
                  ...(isObject(item["layout"]) ? { layout: parseLayout(item["layout"]) } : {}),
                  ...Object.fromEntries(["sqlTitleField", "sqlDetailField", "sqlDetailSuffix", "sqlDetailSuffixFractional", "sqlDetailSeparator", "sqlSuffix", "sqlSelectionField", "sqlSelectionValueField", "sqlQuickFilterField", "sqlSearchField", "sqlLinkField", "sqlLinkLabel", "sqlLinkTemplate"].flatMap((key) => typeof item[key] === "string" ? [[key, item[key].slice(0, 200)]] : [])),
                  ...Object.fromEntries(["sqlSuffixJoined", "sqlSuffixBelow", "sqlShowViewerFilters"].flatMap((key) => typeof item[key] === "boolean" ? [[key, item[key]]] : [])),
                  ...(["above", "inline", "below"].includes(item["sqlDetailPlacement"] as string) ? { sqlDetailPlacement: item["sqlDetailPlacement"] as "above" | "inline" | "below" } : {}),
                  ...(typeof item["sqlDetailDecimals"] === "number" && Number.isFinite(item["sqlDetailDecimals"]) ? {sqlDetailDecimals:Math.max(0,Math.min(4,Math.round(item["sqlDetailDecimals"])))} : {}),
                  ...(typeof item["sqlTableFitContent"] === "boolean" ? { sqlTableFitContent: item["sqlTableFitContent"] } : {}),
                  ...(typeof item["sqlTableComfortable"] === "boolean" ? { sqlTableComfortable: item["sqlTableComfortable"] } : {}),
                  ...(typeof item["sqlRowHeight"] === "number" ? { sqlRowHeight: Math.max(28, Math.min(120, item["sqlRowHeight"])) } : {}),
                  ...(typeof item["sqlPaginationTop"] === "boolean" ? { sqlPaginationTop: item["sqlPaginationTop"] } : {}),
                  ...(typeof item["sqlReceiveSelections"] === "boolean" ? { sqlReceiveSelections: item["sqlReceiveSelections"] } : {}),
                  ...([0, 900000, 3600000, 86400000].includes(item["refresh_interval"] as number) ? { refreshInterval: item["refresh_interval"] as number } : {}),
                  ...(item["calculated_fields"] ? { calculatedFields: parseCalculatedFields(item["calculated_fields"]) } : {}),
                  ...(item["field_presentation"] ? { fieldPresentation: parseFieldPresentation(item["field_presentation"]) } : {}),
                  tableSlug: text(item["table_slug"]),
                  filters: parseFilters(item["filters"]) ?? {},
                  answers: toAnswers(item["answers"]),
                  ...(typeof item["body"] === "string" ? { body: item["body"] } : {}),
                  ...(Array.isArray(item["pivot_rows"]) ? { pivotRows: item["pivot_rows"].filter((slug): slug is string => typeof slug === "string") } : {}),
                  ...(typeof item["pivot_skip_empty"] === "boolean" ? { pivotSkipEmpty: item["pivot_skip_empty"] } : {}),
                  ...(typeof item["goal"] === "number" && Number.isFinite(item["goal"]) ? { goal: item["goal"] } : {}),
                  ...(toRatio(item["ratio"]) ? { ratio: toRatio(item["ratio"])! } : {}),
                  ...(typeof item["dataset_id"] === "string" ? { datasetId: item["dataset_id"] } : {}),
                  ...(WIDGET_TYPES.includes(item["widget_type"] as WidgetType) ? { type: item["widget_type"] as WidgetType } : {}),
                  ...(Array.isArray(item["columns"]) ? { columns: item["columns"].filter((v): v is string => typeof v === "string") } : {}),
                  ...(isObject(item["column_widths"]) ? { columnWidths: Object.fromEntries(Object.entries(item["column_widths"]).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])).map(([slug, width]) => [slug, Math.max(80, Math.min(600, width))])) } : {}),
                  ...(Array.isArray(item["sorts"]) ? { sorts: list(item["sorts"]).flatMap((s): Sort[] => typeof s["field"] === "string" ? [{ field: s["field"], direction: s["direction"] === "desc" ? "desc" : "asc" }] : []) } : {}),
                  ...(typeof item["page_size"] === "number" ? { pageSize: Math.max(10, Math.min(100, Math.round(item["page_size"]))) } : {}),
                  ...(typeof item["currency_slug"] === "string" ? { currencySlug: item["currency_slug"] } : {}),
                },
              ]
            : [];
        }),
      })),
    }),
  );

  return { folders, ...(isObject(value) && Array.isArray(value["datasets"]) ? { datasets: toDatasets(value["datasets"]) } : {}) };
}

/** Обратно в attributes. Ключи змейкой — как у `charts`. */
export function toTreeAttribute(tree: Tree): Record<string, unknown> {
  return {
    ...tree,
    ...(tree.datasets ? { datasets: tree.datasets } : {}),
    folders: tree.folders.map((folder) => ({
      id: folder.id,
      module_id: folder.moduleId,
      title: folder.title,
      dashboards: folder.dashboards.map((dashboard) => ({
        id: dashboard.id,
        title: dashboard.title,
        emoji: dashboard.emoji,
        description: dashboard.description,
        filters: dashboard.filters.map((filter) =>
          filter.kind === "period"
            ? filter
            : {
                kind: filter.kind,
                label: filter.label,
                table: filter.table,
                source_table: filter.sourceTable,
                source_field: filter.sourceField,
              },
        ),
        widgets: placeWidgets(dashboard.widgets).map((widget) => ({
          ...toChartsAttribute([widget])[0],
          ...(widget.section ? {section:widget.section} : {}),
          ...(widget.sqlRecords ? { sqlRecords: widget.sqlRecords } : {}),
          table_slug: widget.tableSlug,
          ...(widget.layout ? { layout: widget.layout } : {}),
          ...(widget.sqlTitleField !== undefined ? { sqlTitleField: widget.sqlTitleField } : {}),
          ...(widget.sqlDetailField !== undefined ? { sqlDetailField: widget.sqlDetailField } : {}),
          ...(widget.sqlDetailPlacement ? { sqlDetailPlacement: widget.sqlDetailPlacement } : {}),
          ...(widget.sqlDetailSuffix !== undefined ? { sqlDetailSuffix: widget.sqlDetailSuffix } : {}),
          ...(widget.sqlDetailSuffixFractional !== undefined ? { sqlDetailSuffixFractional: widget.sqlDetailSuffixFractional } : {}),
          ...(widget.sqlDetailDecimals !== undefined ? { sqlDetailDecimals: widget.sqlDetailDecimals } : {}),
          ...(widget.sqlSuffixJoined !== undefined ? { sqlSuffixJoined: widget.sqlSuffixJoined } : {}),
          ...(widget.sqlDetailSeparator !== undefined ? { sqlDetailSeparator: widget.sqlDetailSeparator } : {}),
          ...(widget.sqlLinkField !== undefined ? { sqlLinkField: widget.sqlLinkField } : {}),
          ...(widget.sqlLinkLabel !== undefined ? { sqlLinkLabel: widget.sqlLinkLabel } : {}),
          ...(widget.sqlLinkTemplate !== undefined ? { sqlLinkTemplate: widget.sqlLinkTemplate } : {}),
          ...(widget.sqlSuffix !== undefined ? { sqlSuffix: widget.sqlSuffix } : {}),
          ...(widget.sqlSelectionField !== undefined ? { sqlSelectionField: widget.sqlSelectionField } : {}),
          ...(widget.sqlSelectionValueField !== undefined ? { sqlSelectionValueField: widget.sqlSelectionValueField } : {}),
          ...(widget.sqlSearchField !== undefined ? {sqlSearchField:widget.sqlSearchField} : {}),
          ...(widget.sqlQuickFilterStyle ? {sqlQuickFilterStyle:widget.sqlQuickFilterStyle} : {}),
          ...(widget.sqlQuickFilterField !== undefined ? { sqlQuickFilterField: widget.sqlQuickFilterField } : {}),
          ...(widget.sqlSelectionRules ? { sqlSelectionRules: widget.sqlSelectionRules } : {}),
          ...(widget.sqlSuffixBelow !== undefined ? { sqlSuffixBelow: widget.sqlSuffixBelow } : {}),
          ...(widget.sqlShowViewerFilters !== undefined ? { sqlShowViewerFilters: widget.sqlShowViewerFilters } : {}),
          ...(widget.sqlTableFitContent !== undefined ? { sqlTableFitContent: widget.sqlTableFitContent } : {}),
          ...(widget.sqlTableComfortable !== undefined ? { sqlTableComfortable: widget.sqlTableComfortable } : {}),
          ...(widget.sqlRowHeight !== undefined ? { sqlRowHeight: widget.sqlRowHeight } : {}),
          ...(widget.sqlPaginationTop !== undefined ? { sqlPaginationTop: widget.sqlPaginationTop } : {}),
          ...(widget.sqlReceiveSelections !== undefined ? { sqlReceiveSelections: widget.sqlReceiveSelections } : {}),
          filters: widget.filters,
          ...(widget.refreshInterval !== undefined ? { refresh_interval: widget.refreshInterval } : {}),
          ...(widget.calculatedFields ? { calculated_fields: widget.calculatedFields } : {}),
          ...(widget.fieldPresentation ? { field_presentation: widget.fieldPresentation } : {}),
          answers: widget.answers,
          ...(widget.body !== undefined ? { body: widget.body } : {}),
          ...(widget.pivotRows ? { pivot_rows: widget.pivotRows } : {}),
          ...(widget.pivotSkipEmpty !== undefined ? { pivot_skip_empty: widget.pivotSkipEmpty } : {}),
          ...(widget.ratio ? { ratio: widget.ratio } : {}),
          ...(widget.goal !== undefined ? { goal: widget.goal } : {}),
          ...(widget.datasetId ? { dataset_id: widget.datasetId } : {}),
          ...(widget.type ? { widget_type: widget.type } : {}),
          ...(widget.columns ? { columns: widget.columns } : {}),
          ...(widget.columnWidths ? { column_widths: widget.columnWidths } : {}),
          ...(widget.sorts ? { sorts: widget.sorts } : {}),
          ...(widget.pageSize ? { page_size: widget.pageSize } : {}),
          ...(widget.currencySlug ? { currency_slug: widget.currencySlug } : {}),
        })),
      })),
    })),
  };
}

/** Дашборд с его папкой — по id. */
export function findDashboard(tree: Tree, id: string): { folder: Folder; dashboard: Dashboard } | null {
  for (const folder of tree.folders) {
    const dashboard = folder.dashboards.find((item) => item.id === id);
    if (dashboard) return { folder, dashboard };
  }
  return null;
}

/**
 * Какой дашборд открыть. Названный — он. Иначе первый дашборд модуля
 * `home`; чужой модуль подставляется, только если модуль не назван
 * (`named`): вход «Дашборды» из CRM без дашбордов CRM должен показать
 * пустой CRM, а не HRMS — иначе и «+» положит новый дашборд в HRMS.
 */
export function openedDashboard(
  tree: Tree,
  id: string,
  home: string,
  named: boolean,
): { folder: Folder; dashboard: Dashboard } | null {
  const found = findDashboard(tree, id);
  if (found) return found;
  const folder =
    tree.folders.find((item) => item.moduleId === home && item.dashboards.length) ??
    (named ? undefined : tree.folders.find((item) => item.dashboards.length));
  return folder ? { folder, dashboard: folder.dashboards[0]! } : null;
}

/**
 * Папка нового дашборда: заданная → папка открытого → первая папка
 * модуля. `undefined` — папки нет, её заводят в модуле `module`.
 * Названный модуль (`+` у строки модуля) перебивает папку открытого
 * дашборда: тот может быть из другого модуля.
 */
export function folderForNew(
  tree: Tree,
  { folderId, moduleOf, opened, home }: { folderId?: string | undefined; moduleOf?: string | undefined; opened?: Folder | undefined; home: string },
): { folder: Folder | undefined; module: string } {
  const module = moduleOf ?? opened?.moduleId ?? home;
  const folder =
    tree.folders.find((item) => item.id === folderId) ??
    (moduleOf ? undefined : opened) ??
    tree.folders.find((item) => item.moduleId === module);
  return { folder, module };
}

export function newDashboard(title: string): Dashboard {
  return { id: crypto.randomUUID(), title, emoji: DEFAULT_EMOJI, description: "", filters: [], widgets: [] };
}

export function newFolder(moduleId: string, title: string): Folder {
  return { id: crypto.randomUUID(), moduleId, title, dashboards: [] };
}

/** Правка одной папки. */
export function patchFolder(tree: Tree, id: string, patch: (folder: Folder) => Folder | null): Tree {
  return {
    ...tree,
    folders: tree.folders.flatMap((folder) => {
      if (folder.id !== id) return [folder];
      const next = patch(folder);
      return next ? [next] : [];
    }),
  };
}

/** Правка одного дашборда; `null` — удалить. */
export function patchDashboard(
  tree: Tree,
  id: string,
  patch: (dashboard: Dashboard) => Dashboard | null,
): Tree {
  return {
    ...tree,
    ...(tree.datasets ? { datasets: tree.datasets } : {}),
    folders: tree.folders.map((folder) => ({
      ...folder,
      dashboards: folder.dashboards.flatMap((dashboard) => {
        if (dashboard.id !== id) return [dashboard];
        const next = patch(dashboard);
        return next ? [next] : [];
      }),
    })),
  };
}

function toDashFilter(item: Record<string, unknown>): DashFilter[] {
  const label = text(item["label"]);
  if (item["kind"] === "period") return [{ kind: "period", label }];
  const table = text(item["table"]);
  const sourceTable = text(item["source_table"]);
  const sourceField = text(item["source_field"]);
  return item["kind"] === "record" && table && sourceTable && sourceField
    ? [{ kind: "record", label, table, sourceTable, sourceField }]
    : [];
}

function toAnswers(value: unknown): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  if (!isObject(value)) return answers;
  for (const [key, item] of Object.entries(value)) {
    if (!isObject(item) || !text(item["field"])) continue;
    const via = text(item["via"]);
    answers[key] = via ? { field: text(item["field"]), via } : { field: text(item["field"]) };
  }
  return answers;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRatio(value: unknown): Widget["ratio"] | null {
  if (!isObject(value) || !isObject(value["numerator"]) || !isObject(value["denominator"])) return null;
  const measure = (item: Record<string, unknown>, id: string): ChartMeasure => ({ id, field: text(item["field"]), aggregation: toAggregation(text(item["aggregation"])) });
  return { numerator: measure(value["numerator"], "numerator"), denominator: measure(value["denominator"], "denominator"), percent: value["percent"] === true };
}

function parseLayout(value: Record<string, unknown>): { column: number; row: number; rows: number } {
  const bounded = (key: string, max: number) => typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(1, Math.min(max, value[key])) : 1;
  return { column: Math.round(bounded("column", 12)), row: bounded("row", MAX_LAYOUT_ROW), rows: Math.max(layoutRows(80), typeof value.rows === "number" && Number.isFinite(value.rows) ? Math.min(12, value.rows) : 1) };
}
