import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PanelRightOpenIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { todayInput } from "@/shared/lib/date-value";
import { Icon } from "@/shared/ui/icon";
import { useLastPayMonth, usePayMonth } from "../api/payroll";
import { buildPayPivot, compactSum, type PayPivot } from "../model/payroll";

const th = "h-9 border-b border-border px-2 text-[13px] font-normal text-fg-muted whitespace-nowrap";
const td = "h-row border-b border-border px-2 tabular-nums";
const num = "text-right";
const cell = `${td} ${num} border-l border-border`;

const shift = (month: string, by: number) => {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * «Сводная по месяцам» начислений — `pivotView` прототипа (payroll.html):
 * сотрудник × вид за расчётный месяц, начисления и удержания группами,
 * справа «Всего начислено · Всего удержано · К выплате», внизу «Итого».
 *
 * Сделано под `hr_payroll_lines` (FIXED_VIEW_TYPES): строки грузит сам
 * (api/payroll), считает model/payroll.
 */
export function PayrollPivot({ search, onOpenEmployee }: { search: string; onOpenEmployee: (guid: string) => void }) {
  const { t, i18n } = useTranslation();
  const last = useLastPayMonth();
  const [picked, setPicked] = useState("");
  const month = picked || last.month || todayInput().slice(0, 7);
  const { lines, loading } = usePayMonth(month, search);
  const pivot = useMemo(() => buildPayPivot(lines, false), [lines]);
  const title = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
  );
  const columns = [...pivot.accruals, ...pivot.deductions];
  const signed = (id: string, value: number) => (pivot.deductions.some((c) => c.id === id) ? -value : value);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 text-sm">
        <NavButton label={t("payroll.back")} onClick={() => setPicked(shift(month, -1))} icon={ChevronLeftIcon} />
        <b className="min-w-[160px] text-center font-semibold first-letter:uppercase">{title}</b>
        <NavButton label={t("payroll.forward")} onClick={() => setPicked(shift(month, 1))} icon={ChevronRightIcon} />
        {/* ponytail: «Скрыть без начислений» убран — в сводной только сотрудники
            со строками за месяц, скрывать нечего. Вернуть вместе со всеми
            сотрудниками из hr_employees (нулевые строки, как в прототипе). */}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() =>
            exportCsv(pivot, title, {
              employee: t("payroll.employee"),
              dept: t("payroll.dept"),
              accruals: t("payroll.accruals"),
              deductions: t("payroll.deductions"),
              accrued: t("payroll.accrued"),
              deducted: t("payroll.deducted"),
              net: t("payroll.net"),
            })
          }
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] text-fg transition-colors hover:bg-surface-hover"
        >
          <Icon as={DownloadIcon} size={14} />
          {t("payroll.export")}
        </button>
      </div>

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

function NavButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: typeof ChevronLeftIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <Icon as={icon} size={16} />
    </button>
  );
}

/** ponytail: CSV с BOM вместо .xlsx — Excel открывает его так же, а библиотека не нужна. */
function exportCsv(pivot: PayPivot, title: string, label: Record<"employee" | "dept" | "accruals" | "deductions" | "accrued" | "deducted" | "net", string>) {
  const head = [
    label.employee,
    label.dept,
    ...pivot.accruals.map((c) => `${label.accruals}: ${c.name}`),
    ...pivot.deductions.map((c) => `${label.deductions}: ${c.name}`),
    label.accrued,
    label.deducted,
    label.net,
  ];
  const body = pivot.rows.map((row) => [
    row.name,
    row.dept,
    ...pivot.accruals.map((c) => row.cells[c.id] ?? 0),
    ...pivot.deductions.map((c) => -(row.cells[c.id] ?? 0)),
    row.accrued,
    -row.deducted,
    row.accrued - row.deducted,
  ]);
  const csv = [head, ...body].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = `${title}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
