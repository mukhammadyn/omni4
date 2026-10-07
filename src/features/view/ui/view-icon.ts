import {
  CalendarDaysIcon,
  ChartNoAxesGanttIcon,
  ChartPieIcon,
  LayoutGridIcon,
  LayoutListIcon,
  ListIcon,
  NetworkIcon,
  SquareKanbanIcon,
  Table2Icon,
  TablePropertiesIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Значок типа view. Один на вкладки и на выбор типа в настройках.
 *
 * Значок здесь работает в 14px рядом с подписью, и в этом размере
 * выигрывает силуэт, а не подробность: значок из трёх линий читается,
 * значок из десяти превращается в пятно.
 *
 * Таблица, список, доска, календарь, таймлайн, галерея и оргструктура — как
 * в `VIEW_META` прототипа (`table-2`, `list`, `kanban-square`, `calendar-days`,
 * `gantt-chart`, `layout-grid`, `network`). Имена у прототипа из Lucide
 * 0.468; в нашей версии это `SquareKanban` и `ChartNoAxesGantt`, а не
 * `Kanban` и `ChartGantt` — у тех другой рисунок.
 *
 * Остальным в прототипе пары нет; что каждый значит, записано, чтобы
 * следующая правка не свелась к «поменяю, вроде похоже»:
 *   PIVOT     — таблица с шапкой строк, тот же значок, что у пункта меню
 *               типа PIVOT в сайдбаре (`sidebar/ui/MenuIcon`). Один
 *               смысл — один значок в обоих местах.
 *   CHART     — сектор круга. Экран показывает восемь форм сразу,
 *               и значок отвечает «здесь диаграммы», а не называет
 *               одну из них.
 */
const ICONS: Record<string, LucideIcon> = {
  TABLE: Table2Icon,
  LIST: ListIcon,
  GALLERY: LayoutGridIcon,
  PEOPLE: LayoutGridIcon,
  ORG: NetworkIcon,
  BOARD: SquareKanbanIcon,
  CALENDAR: CalendarDaysIcon,
  CHART: ChartPieIcon,
  GRID: LayoutGridIcon,
  PIVOT: TablePropertiesIcon,
  SECTION: LayoutListIcon,
  TIMELINE: ChartNoAxesGanttIcon,
  TREE: NetworkIcon,
};

/**
 * Значки типов view — вкладкой в выборе иконки. Имя Lucide, потому что
 * сохраняется оно (`lucide:<имя>`), как и любая иконка из пикера.
 */
export const VIEW_ICON_CHOICES: { name: string; icon: LucideIcon }[] = [
  { name: "table-2", icon: Table2Icon },
  { name: "list", icon: ListIcon },
  { name: "layout-grid", icon: LayoutGridIcon },
  { name: "square-kanban", icon: SquareKanbanIcon },
  { name: "calendar-days", icon: CalendarDaysIcon },
  { name: "chart-pie", icon: ChartPieIcon },
  { name: "table-properties", icon: TablePropertiesIcon },
  { name: "layout-list", icon: LayoutListIcon },
  { name: "chart-no-axes-gantt", icon: ChartNoAxesGanttIcon },
  { name: "network", icon: NetworkIcon },
];

export function viewIcon(type: string): LucideIcon {
  return ICONS[type] ?? Table2Icon;
}
