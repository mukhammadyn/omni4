import {
  CalendarRangeIcon,
  ChartGanttIcon,
  ChartPieIcon,
  KanbanIcon,
  LayoutGridIcon,
  LayoutListIcon,
  NetworkIcon,
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
 * Набор выбран заказчиком; здесь записано, что каждый значит, чтобы
 * следующая правка не свелась к «поменяю, вроде похоже»:
 *   CALENDAR  — неделя строкой. Не пустая рамка с засечкой: у голого
 *               `CalendarIcon` внутри мелкая «1», которая в 14px
 *               становится кляксой.
 *   PIVOT     — таблица с шапкой строк, тот же значок, что у пункта меню
 *               типа PIVOT в сайдбаре (`sidebar/ui/MenuIcon`). Один
 *               смысл — один значок в обоих местах.
 *   TIMELINE  — диаграмма Ганта: силуэт ленты, где у каждой строки
 *               свой отрезок во времени. У Lucide он есть (`ChartGantt`);
 *               у Tabler, на котором значок выбирали раньше, его не было.
 *   TREE      — карта узлов со связями.
 *   CHART     — сектор круга. Экран показывает восемь форм сразу,
 *               и значок отвечает «здесь диаграммы», а не называет
 *               одну из них.
 */
const ICONS: Record<string, LucideIcon> = {
  TABLE: Table2Icon,
  BOARD: KanbanIcon,
  CALENDAR: CalendarRangeIcon,
  CHART: ChartPieIcon,
  GRID: LayoutGridIcon,
  PIVOT: TablePropertiesIcon,
  SECTION: LayoutListIcon,
  TIMELINE: ChartGanttIcon,
  TREE: NetworkIcon,
};

export function viewIcon(type: string): LucideIcon {
  return ICONS[type] ?? Table2Icon;
}
