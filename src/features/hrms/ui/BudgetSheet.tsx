import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useBudget, useBudgetEdit } from "../api/budget";
import { useScheduleSettings } from "./schedule-settings";
import {
  fullSum,
  groupByDept,
  parseNumber,
  parseSum,
  periods,
  sumOf,
  type BudgetLine,
  type BudgetMode,
  type BudgetStatus,
  type Period,
  type Sum,
} from "../model/budget";
import { Segments } from "./schedule-parts";

const STATUS_COLOR: Record<BudgetStatus, ChipColor> = {
  working: "green",
  vacancy: "gray",
  maternity: "purple",
  dismissed: "red",
};

/* Липкие колонки слева — `.s1…s4` прототипа. Ширины в px: от них считаются `left`. */
const W = { who: 300, status: 126, pct: 86 } as const;
const STICKY = {
  who: { left: 0, width: W.who, minWidth: W.who, maxWidth: W.who },
  status: { left: W.who, width: W.status, minWidth: W.status },
  tax: { left: W.who + W.status, width: W.pct, minWidth: W.pct },
  bonus: { left: W.who + W.status + W.pct, width: W.pct, minWidth: W.pct },
  span: { left: 0, width: W.who + W.status + 2 * W.pct, minWidth: W.who + W.status + 2 * W.pct },
};
const sticky = "sticky z-[2] bg-surface";
const cellBase = "h-9 border-b border-border px-2.5 whitespace-nowrap";
const PARTS = ["plan", "fact", "diff", "pct"] as const;

/**
 * «Бюджет» ФОТ — `budget.html` прототипа на `hr_budget_lines`
 * и `hr_budget_amounts`: отделы → строки (сотрудник или вакансия),
 * по месяцам или кварталам «План · Факт · Разница · %», год справа,
 * внизу «Итого» и «С налогами и бонусами». План, факт и проценты
 * правятся прямо в ячейке (в режиме «Месяцы»).
 *
 * Сделано под эти две таблицы (FIXED_VIEW_TYPES): грузит сам (api/budget),
 * считает model/budget.
 */
export function BudgetSheet({ viewId, search }: { viewId: string; search: string }) {
  const { t, i18n } = useTranslation();
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: "short" });
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [mode, setMode] = useState<BudgetMode>("m");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const { where } = useScheduleSettings(viewId);
  const { lines, loading } = useBudget(year, search, where);
  const edit = useBudgetEdit(year);
  const depts = useMemo(() => groupByDept(lines), [lines]);
  const cols = periods(mode, year, today);
  const label = (period: Period) =>
    period.total
      ? t("budget.year")
      : mode === "m"
        ? `${monthName.format(new Date(year, period.months[0]!, 1)).replace(".", "")} ${String(year).slice(2)}`
        : t("budget.quarter", { n: ["I", "II", "III", "IV"][Number(period.key.slice(1))], y: String(year).slice(2) });

  const toggle = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 text-sm">
        <NavButton label={t("budget.prevYear")} onClick={() => setYear(year - 1)} icon={ChevronLeftIcon} />
        <b className="min-w-[90px] text-center font-semibold">{year}</b>
        <NavButton label={t("budget.nextYear")} onClick={() => setYear(year + 1)} icon={ChevronRightIcon} />
        <span className="mx-2 h-4 w-px bg-border" />
        <Segments
          value={mode}
          onChange={setMode}
          items={[
            { value: "m", label: t("budget.months") },
            { value: "q", label: t("budget.quarters") },
          ]}
        />
        {mode === "q" && <span className="ml-2 text-xs text-fg-subtle">{t("budget.editInMonths")}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead>
            <tr>
              <Th rowSpan={2} style={STICKY.who} className="z-[5] pl-6">{t("budget.who")}</Th>
              <Th rowSpan={2} style={STICKY.status} className="z-[5]">{t("budget.status")}</Th>
              <Th rowSpan={2} style={STICKY.tax} className="z-[5] text-right">{t("budget.tax")}</Th>
              <Th rowSpan={2} style={STICKY.bonus} className="z-[5] text-right shadow-[inset_-1px_0_0_var(--color-border)]">
                {t("budget.bonus")}
              </Th>
              {cols.map((period) => (
                <th
                  key={period.key}
                  colSpan={PARTS.length}
                  className={`sticky top-0 z-[3] h-[34px] border-b border-l border-border px-2.5 text-center text-[11.5px] font-semibold text-fg-muted uppercase ${tone(period)}`}
                >
                  {label(period)}
                  {period.current && <i className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />}
                </th>
              ))}
            </tr>
            <tr>
              {cols.flatMap((period) =>
                PARTS.map((part, i) => (
                  <th
                    key={`${period.key}-${part}`}
                    className={`sticky top-[34px] z-[3] h-7 border-b border-border bg-surface-soft px-2.5 text-right text-[10.5px] font-medium text-fg-subtle uppercase ${i === 0 ? "border-l" : ""} ${tone(period)}`}
                  >
                    {t(`budget.part.${part}`)}
                  </th>
                )),
              )}
            </tr>
          </thead>

          <tbody>
            {depts.length === 0 && (
              <tr>
                <td colSpan={4 + cols.length * PARTS.length} className="py-10 text-center text-fg-subtle">
                  {loading ? t("common.loading") : t("budget.empty", { year })}
                </td>
              </tr>
            )}
            {depts.map((dept) => {
              const shut = folded.has(dept.id);
              return [
                <tr key={dept.id} className="[&>td]:h-10 [&>td]:bg-surface-soft [&>td]:font-semibold">
                  <td colSpan={4} style={STICKY.span} className={`${sticky} ${cellBase} pl-3.5 shadow-[inset_-1px_0_0_var(--color-border)]`}>
                    <button type="button" onClick={() => toggle(dept.id)} className="flex items-center gap-2">
                      <Icon as={ChevronDownIcon} size={14} className={`text-fg-muted transition-transform ${shut ? "-rotate-90" : ""}`} />
                      <i className="h-4 w-[3px] rounded-sm bg-fg" />
                      <b className="text-sm">{dept.name}</b>
                      <span className="rounded-full bg-surface px-2 text-[11.5px] font-medium text-fg-subtle ring-1 ring-border ring-inset">
                        {t("budget.lines", { count: dept.lines.length })}
                      </span>
                    </button>
                  </td>
                  {cols.map((period) => (
                    <Sums key={period.key} sum={sumOf(dept.lines, period.months)} period={period} />
                  ))}
                </tr>,
                ...(shut
                  ? []
                  : dept.lines.map((line) => (
                      <tr key={line.id} className="group/row [&>td]:h-12 hover:[&>td]:tint-surface-hover">
                        <td style={STICKY.who} className={`${sticky} ${cellBase} pl-6`}>
                          <span className="flex min-w-0 items-center gap-2.5">
                            {line.vacancy ? (
                              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-fg-subtle">
                                <Icon as={PlusIcon} size={12} />
                              </span>
                            ) : (
                              <Avatar name={line.name} photo={line.photo || undefined} size="sm" />
                            )}
                            <span className="flex min-w-0 flex-col leading-tight">
                              <b className="truncate font-medium">{line.vacancy ? t("budget.vacancy") : line.name}</b>
                              <small className="truncate text-xs text-fg-subtle">{line.position}</small>
                            </span>
                          </span>
                        </td>
                        <td style={STICKY.status} className={`${sticky} ${cellBase}`}>
                          {line.status && (
                            <span className={`inline-flex h-6 items-center rounded-full px-2 text-[12.5px] font-medium ${CHIP_STYLES[STATUS_COLOR[line.status]]}`}>
                              {t(`budget.st.${line.status}`)}
                            </span>
                          )}
                        </td>
                        <EditCell
                          style={STICKY.tax}
                          className={sticky}
                          percent
                          value={line.tax}
                          show={String(line.tax)}
                          onSave={(value) => edit.setPercent(line, "tax", value ?? 0)}
                        />
                        <EditCell
                          style={STICKY.bonus}
                          className={`${sticky} shadow-[inset_-1px_0_0_var(--color-border)]`}
                          percent
                          value={line.bonus}
                          show={String(line.bonus)}
                          onSave={(value) => edit.setPercent(line, "bonus", value ?? 0)}
                        />
                        {cols.map((period) => (
                          <Sums
                            key={period.key}
                            sum={sumOf([line], period.months)}
                            period={period}
                            {...(period.editable ? { line, onSave: edit.setAmount } : {})}
                          />
                        ))}
                      </tr>
                    ))),
              ];
            })}
          </tbody>

          {depts.length > 0 && (
            <tfoot>
              {[false, true].map((extras) => (
                <tr key={String(extras)} className="font-semibold [&>td]:h-10 [&>td]:bg-surface-soft">
                  <td colSpan={4} style={STICKY.span} className={`${sticky} ${cellBase} pl-6 shadow-[inset_-1px_0_0_var(--color-border)]`}>
                    {extras ? (
                      t("budget.withExtras")
                    ) : (
                      <>
                        {t("budget.total")}
                        <span className="font-normal text-fg-subtle"> · {t("budget.payroll")}</span>
                      </>
                    )}
                  </td>
                  {cols.map((period) => (
                    <Sums key={period.key} sum={sumOf(lines, period.months, extras)} period={period} />
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Подсветка текущего периода и колонки года — `.cur` и `.tot` прототипа. */
const tone = (period: Period) => (period.total ? "bg-surface-soft text-fg" : period.current ? "bg-surface-hover" : "bg-surface");

function Th({ children, className = "", ...props }: { children: ReactNode; className?: string } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={`sticky top-0 border-b border-border bg-surface px-2.5 text-left text-[11.5px] font-medium tracking-[.02em] text-fg-subtle uppercase ${className}`}
    >
      {children}
    </th>
  );
}

const dash = <span className="font-normal text-fg-subtle">—</span>;

/**
 * Четыре ячейки периода. С `line` план и факт правятся: факт стёрт —
 * `null` («не было»), а не ноль. Перерасход красный, экономия зелёная.
 */
function Sums({
  sum,
  period,
  line,
  onSave,
}: {
  sum: Sum;
  period: Period;
  line?: BudgetLine;
  onSave?: (line: BudgetLine, month: number, kind: "plan" | "fact", value: number | null) => void;
}) {
  const diff = sum.fact - sum.plan;
  const pct = sum.plan ? (diff / sum.plan) * 100 : null;
  const color = diff > 0 ? "text-danger" : diff < 0 ? "text-success" : "";
  const bg = period.total ? "bg-surface-soft font-semibold" : period.current ? "bg-surface-hover" : "";
  const num = `${cellBase} min-w-24 text-right ${bg}`;
  const month = period.months[0]!;
  return (
    <>
      {line && onSave ? (
        <>
          <EditCell className={`border-l border-l-border ${bg}`} value={sum.plan} show={sum.plan ? fullSum(sum.plan) : null} onSave={(v) => onSave(line, month, "plan", v)} />
          <EditCell className={`font-semibold ${bg}`} value={line.fact[month] ?? null} show={sum.hasFact ? fullSum(sum.fact) : null} onSave={(v) => onSave(line, month, "fact", v)} />
        </>
      ) : (
        <>
          <td className={`${num} border-l border-l-border`}>{sum.plan ? fullSum(sum.plan) : dash}</td>
          <td className={`${num} font-semibold`}>{sum.hasFact ? fullSum(sum.fact) : dash}</td>
        </>
      )}
      <td className={`${num} ${color}`}>{diff ? `${diff > 0 ? "+" : ""}${fullSum(diff)}` : dash}</td>
      <td className={`${cellBase} min-w-16 text-right ${bg} ${color}`}>
        {pct == null ? dash : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
      </td>
    </>
  );
}

/**
 * Ячейка с правкой по щелчку — `startEdit` прототипа: Enter и уход
 * фокуса сохраняют, Esc отменяет. Значение не изменилось — не пишем.
 */
function EditCell({
  value,
  show,
  onSave,
  percent = false,
  className = "",
  style,
}: {
  value: number | null;
  show: string | null;
  onSave: (value: number | null) => void;
  /** Проценты — дробные, без разрядов: 12,5 не округляется до 13. */
  percent?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = (percent ? parseNumber : parseSum)(draft);
    setDraft(null);
    if (next !== value && !(draft.trim() && next === null)) onSave(next);
  };
  return (
    <td
      style={style}
      onClick={() => draft === null && setDraft(value == null ? "" : percent ? String(value) : fullSum(value))}
      className={`${cellBase} min-w-24 cursor-text text-right hover:shadow-[inset_0_0_0_1px_var(--color-border-strong)] ${
        draft !== null ? "px-0.5 shadow-[inset_0_0_0_2px_var(--color-accent)]" : ""
      } ${className}`}
    >
      {draft === null ? (
        (show ?? dash)
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setDraft(null);
          }}
          className="h-8 w-full bg-surface px-2 text-right font-semibold text-fg outline-none"
        />
      )}
    </td>
  );
}

export function NavButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: typeof ChevronLeftIcon }) {
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
