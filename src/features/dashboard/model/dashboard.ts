import { parseFilters, toCharts, toChartsAttribute, type ChartConfig, type Filters } from "@/features/item";
import type { Answer, DashFilter } from "./filters";

/**
 * График CHART плюс своя таблица: на дашборде у каждого виджета она своя.
 * `filters` — свой отбор, `answers` — какими полями он отвечает
 * на общие фильтры, по ключу фильтра (`filterKey`).
 */
export type Widget = ChartConfig & { tableSlug: string; filters: Filters; answers: Record<string, Answer> };

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

export type Tree = { folders: Folder[] };

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
                  tableSlug: text(item["table_slug"]),
                  filters: parseFilters(item["filters"]) ?? {},
                  answers: toAnswers(item["answers"]),
                },
              ]
            : [];
        }),
      })),
    }),
  );

  return { folders };
}

/** Обратно в attributes. Ключи змейкой — как у `charts`. */
export function toTreeAttribute(tree: Tree): Record<string, unknown> {
  return {
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
        widgets: dashboard.widgets.map((widget) => ({
          ...toChartsAttribute([widget])[0],
          table_slug: widget.tableSlug,
          filters: widget.filters,
          answers: widget.answers,
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

export function newDashboard(title: string): Dashboard {
  return { id: crypto.randomUUID(), title, emoji: DEFAULT_EMOJI, description: "", filters: [], widgets: [] };
}

export function newFolder(moduleId: string, title: string): Folder {
  return { id: crypto.randomUUID(), moduleId, title, dashboards: [] };
}

/** Правка одной папки. */
export function patchFolder(tree: Tree, id: string, patch: (folder: Folder) => Folder | null): Tree {
  return {
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
