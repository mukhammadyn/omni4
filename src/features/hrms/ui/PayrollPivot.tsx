import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightOpenIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { Icon } from "@/shared/ui/icon";
import { usePayPeriod } from "../api/payroll";
import { PayrollExcel } from "./PayrollExcel";
import { PeriodBar, usePeriod, usePeriodLabel } from "./attendance-parts";
import { useScheduleSettings } from "./schedule-settings";
import { buildPayPivot, compactSum } from "../model/payroll";
import type { Scale } from "../model/timesheet";

const th = "h-9 border-b border-border px-2 text-[13px] font-normal text-fg-muted whitespace-nowrap";
const td = "h-row border-b border-border px-2 tabular-nums";
const num = "text-right";
const cell = `${td} ${num} border-l border-border`;

/** Платят и помесячно, и по неделям — ведомость HRMS (Finance/Salary) умеет оба. */
const SCALES: readonly Scale[] = ["month", "week"];

/**
 * «Сводная по месяцам» начислений — `pivotView` прототипа (payroll.html):
 * сотрудник × вид за месяц или неделю, начисления и удержания группами,
 * справа «Всего начислено · Всего удержано · К выплате», внизу «Итого».
 * Период — строка периода «Посещаемости»; шаблон и загрузка Excel берут его же.
 *
 * Сделано под `hr_payroll_lines` (FIXED_VIEW_TYPES): строки грузит сам
 * (api/payroll), считает model/payroll.
 */
export function PayrollPivot({ viewId, search, onOpenEmployee }: { viewId: string; search: string; onOpenEmployee: (guid: string) => void }) {
  const { t } = useTranslation();
  const period = usePeriod(viewId, SCALES);
  const title = usePeriodLabel(period);
  const { where } = useScheduleSettings(viewId);
  const { lines, loading } = usePayPeriod(period.range, period.scale === "week", search, where);
  const pivot = useMemo(() => buildPayPivot(lines, false), [lines]);
  const columns = [...pivot.accruals, ...pivot.deductions];
  const signed = (id: string, value: number) => (pivot.deductions.some((c) => c.id === id) ? -value : value);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={period}>
        {/* ponytail: «Скрыть без начислений» убран — в сводной только сотрудники
            со строками за период, скрывать нечего. Вернуть вместе со всеми
            сотрудниками из hr_employees (нулевые строки, как в прототипе). */}
        <div className="flex justify-end">
          <PayrollExcel range={period.range} kind={period.scale === "week" ? "week" : "month"} title={title} where={where} />
        </div>
      </PeriodBar>

      <div className="min-h-0 flex-1 overflow-auto px-6">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th rowSpan={2} className={`${th} min-w-[220px] text-left`}>{t("payroll.employee")}</th>
              <th rowSpan={2} className={`${th} text-left`}>{t("payroll.dept")}</th>
              {pivot.accruals.length > 0 && (
                <th colSpan={pivot.accruals.length} className={`${th} border-l text-center`}>{t("payroll.accruals")}</th>
              )}
              {pivot.deductions.length > 0 && (
                <th colSpan={pivot.deductions.length} className={`${th} border-l text-center`}>{t("payroll.deductions")}</th>
              )}
              <th rowSpan={2} className={`${th} ${num} border-l`}>{t("payroll.accrued")}</th>
              <th rowSpan={2} className={`${th} ${num}`}>{t("payroll.deducted")}</th>
              <th rowSpan={2} className={`${th} ${num}`}>{t("payroll.net")}</th>
            </tr>
            <tr>
              {columns.map((column) => (
                <th key={column.id} className={`${th} ${num} min-w-[80px] border-l`}>{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pivot.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 5} className="py-8 text-center text-fg-subtle">
                  {loading ? t("common.loading") : t("payroll.empty", { month: title })}
                </td>
              </tr>
            ) : (
              pivot.rows.map((row) => (
                <tr key={row.id} className="group/row hover:[&>td]:bg-surface-hover">
                  <td className={`${td} relative`}>
                    <span className="flex items-center gap-2 pr-20">
                      <Avatar name={row.name} photo={row.photo || undefined} size="sm" />
                      <span className="truncate font-medium">{row.name}</span>
                    </span>
                    {/* «Открыть» — как в первой колонке DataGrid (`.open-btn` прототипа). */}
                    <button
                      type="button"
                      onClick={() => onOpenEmployee(row.id)}
                      className="absolute top-1/2 right-1 hidden h-5.5 -translate-y-1/2 items-center gap-1 rounded-[4px] bg-surface px-1.5 text-[11.5px] font-semibold tracking-[.3px] text-fg-muted uppercase shadow-raised transition-colors group-hover/row:inline-flex hover:text-fg"
                    >
                      <Icon as={PanelRightOpenIcon} size={12} />
                      {t("cell.open")}
                    </button>
                  </td>
                  <td className={`${td} text-fg-muted`}>{row.dept}</td>
                  {columns.map((column) => {
                    const value = row.cells[column.id] ?? 0;
                    return (
                      <td key={column.id} className={`${cell} ${value ? "" : "text-fg-subtle"} ${value && signed(column.id, 1) < 0 ? "text-danger" : ""}`}>
                        {value ? compactSum(signed(column.id, value)) : "–"}
                      </td>
                    );
                  })}
                  <td className={`${cell} font-semibold text-success`}>{compactSum(row.accrued)}</td>
                  <td className={`${td} ${num} font-semibold text-danger`}>{row.deducted ? compactSum(-row.deducted) : 0}</td>
                  <td className={`${td} ${num} font-semibold`}>{compactSum(row.accrued - row.deducted)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-surface">
            <tr className="h-row font-semibold [&>td]:border-t [&>td]:border-t-border-strong">
              <td colSpan={2} className="px-2">{t("payroll.total", { count: pivot.rows.length })}</td>
              {columns.map((column) => (
                <td key={column.id} className={`px-2 ${num} tabular-nums`}>
                  {compactSum(signed(column.id, pivot.total.cells[column.id] ?? 0))}
                </td>
              ))}
              <td className={`px-2 ${num} tabular-nums text-success`}>{compactSum(pivot.total.accrued)}</td>
              <td className={`px-2 ${num} tabular-nums text-danger`}>{compactSum(-pivot.total.deducted)}</td>
              <td className={`px-2 ${num} tabular-nums`}>{compactSum(pivot.total.accrued - pivot.total.deducted)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="py-3 text-xs text-fg-subtle">{t("payroll.hint")}</p>
      </div>
    </div>
  );
}
