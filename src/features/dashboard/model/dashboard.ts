import { toCharts, toChartsAttribute, type ChartConfig } from "@/features/item";

/** График CHART плюс своя таблица: на дашборде у каждого виджета она своя. */
export type Widget = ChartConfig & { tableSlug: string };

export type Dashboard = {
  id: string;
  title: string;
  emoji: string;
  description: string;
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
        widgets: list(dashboard["widgets"]).flatMap((item) => {
          // По одному: toCharts выбрасывает мусор, и сопоставлять таблицу
          // с графиком по индексу после фильтра было бы мимо.
          const [chart] = toCharts([item]);
          return chart ? [{ ...chart, tableSlug: text(item["table_slug"]) }] : [];
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
        widgets: dashboard.widgets.map((widget) => ({
          ...toChartsAttribute([widget])[0],
          table_slug: widget.tableSlug,
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
  return { id: crypto.randomUUID(), title, emoji: DEFAULT_EMOJI, description: "", widgets: [] };
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

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
