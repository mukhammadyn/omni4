import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import type { Dataset, DatasetParameter } from "../model/datasets";
import type { Widget } from "../model/dashboard";
import type { FilterValues } from "../model/filters";
import { dashboardMonthParameters, monthKey, selectedMonth, shiftMonth, validMonth } from "../model/sql-month";

const MonthValues = createContext<Record<string, string>>({});
export const useDashboardSqlScope = () => JSON.stringify(useContext(MonthValues));
export function useDashboardSqlParameters(parameters: DatasetParameter[]) {
  const values = useContext(MonthValues);
  return Object.fromEntries(parameters.filter(p => p.type === "date" && p.dashboardControl === "month").map(p => [p.name, values[p.name] ?? `${selectedMonth()}-01`]));
}

/** One normal viewer control per explicitly shared parameter; SQL stays editable. */
export function SqlMonthControls({ datasets, widgets, values, onValues, children }: { datasets: Dataset[]; widgets: Widget[]; values: FilterValues; onValues: (values: FilterValues) => void; children: ReactNode }) {
  const { i18n } = useTranslation(), ru = i18n.language.startsWith("ru");
  const parameters = dashboardMonthParameters(datasets, new Set(widgets.flatMap(w => w.datasetId ? [w.datasetId] : [])));
  const dates = Object.fromEntries(parameters.map(p => [p.name, `${selectedMonth(values[monthKey(p.name)]?.[0])}-01`]));
  return <MonthValues.Provider value={dates}>
    {parameters.length > 0 && <div className="flex flex-wrap items-center gap-3" aria-label={ru ? "Месяц отчёта" : "Report month"}>{parameters.map(parameter => {
      const month = dates[parameter.name]!.slice(0, 7);
      const put = (next: string) => { if (validMonth(next)) onValues({ ...values, [monthKey(parameter.name)]: [next] }); };
      return <div key={parameter.name} className="inline-flex max-w-full items-center gap-1 rounded-xl border border-border bg-surface-soft p-1">
        <Button type="button" size="sm" variant="ghost" aria-label={`${ru ? "Предыдущий месяц" : "Previous month"}: ${parameter.name}`} disabled={shiftMonth(month, -1) === month} onClick={() => put(shiftMonth(month, -1))}><Icon as={ChevronLeftIcon} size={16}/></Button>
        <label className="relative flex h-8 min-w-0 items-center justify-center rounded-md px-2 text-sm font-semibold text-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <span className="pointer-events-none capitalize">{new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</span>
          <input aria-label={`${ru ? "Месяц отчёта" : "Report month"}: ${parameter.name}`} type="month" min="0001-01" max="9999-12" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={month} onChange={event => put(event.target.value)}/>
        </label>
        <Button type="button" size="sm" variant="ghost" aria-label={`${ru ? "Следующий месяц" : "Next month"}: ${parameter.name}`} disabled={shiftMonth(month, 1) === month} onClick={() => put(shiftMonth(month, 1))}><Icon as={ChevronRightIcon} size={16}/></Button>
        {values[monthKey(parameter.name)] && <Button type="button" size="sm" variant="ghost" onClick={() => { const next = {...values}; delete next[monthKey(parameter.name)]; onValues(next); }}>{ru ? "Текущий месяц" : "Current month"}</Button>}
      </div>;
    })}</div>}
    {children}
  </MonthValues.Provider>;
}
