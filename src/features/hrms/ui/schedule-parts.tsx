import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleIcon } from "lucide-react";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { useShiftKinds } from "../api/schedule";
import { isFlexible, type Shift, type ShiftKind, type ShiftKindRow, type Template } from "../model/schedule";

/* Общее у экранов графика: календаря, окна смены, вкладки сотрудника. */

/** Вид смены с тем, чем его рисовать: подложка и полоса слева — цветом из справочника, токенами. */
export type KindLook = ShiftKindRow & { chip: string; stripe: string };

/** Вид удалён из справочника или не задан — серая плашка без подписи. */
const NO_KIND: KindLook = { id: "", name: "—", color: "", icon: "", start: "", end: "", remote: false, chip: CHIP_STYLES.gray, stripe: "bg-fg-subtle" };

/** Виды смен — `KIND` прототипа, но из справочника `hr_shift_kinds` (настройки HRMS). */
export function useKinds() {
  const { kinds, loading } = useShiftKinds();
  return useMemo(() => {
    const list = kinds.map((kind): KindLook => {
      const color = hexToChipColor(kind.color);
      return { ...kind, chip: CHIP_STYLES[color], stripe: TEMPLATE_DOT[color] };
    });
    const byId = new Map(list.map((kind) => [kind.id, kind]));
    return { list, loading, of: (id: ShiftKind) => byId.get(id) ?? NO_KIND };
  }, [kinds, loading]);
}

/** Значок вида: иконка из справочника, без неё — кружок. */
export function KindIcon({ kind, size }: { kind: Pick<ShiftKindRow, "icon">; size: number }) {
  return <DynamicIcon name={kind.icon} size={size} fallback={<Icon as={CircleIcon} size={size} />} />;
}

/** «8 ч», «7 ч 30 м». */
export function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h && m ? t("timesheet.hm", { h, m }) : m ? t("timesheet.m", { m }) : t("timesheet.h", { h });
  };
}

/** Новая смена на клетке или правка существующей — окну смены; `start` — щелчок по часу недели. */
export type OpenShift = {
  shift?: Shift;
  /** Серии остальных смен плашки «N из M» — правятся вместе с этой. */
  seriesIds?: string[];
  employeeId?: string;
  date: string;
  start?: string;
};

/**
 * Насыщенная точка цвета шаблона — `.tp-dot` прототипа. HEX из данных
 * читается как намерение (CONTEXT, FieldOption) и рисуется токеном.
 */
export const TEMPLATE_DOT: Record<ChipColor, string> = {
  blue: "bg-chart-1",
  orange: "bg-chart-2",
  green: "bg-chart-3",
  yellow: "bg-chart-4",
  pink: "bg-chart-5",
  purple: "bg-chart-7",
  red: "bg-chart-8",
  brown: "bg-chip-brown-fg",
  gray: "bg-fg-subtle",
};

export const templateDot = (template: Pick<Template, "color">) => TEMPLATE_DOT[hexToChipColor(template.color)];

/** «Пн–Пт · 09:00–18:00», «2 через 2 · 08:00–20:00» — `tplDesc` прототипа. */
export function useTemplateSummary() {
  const { t, i18n } = useTranslation();
  const weekday = (index: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)));
  return (template: Pick<Template, "type" | "days" | "cycle">) => {
    if (template.type === "cycle")
      return t("template.cycleSummary", { work: template.cycle.work, off: template.cycle.off, start: template.cycle.start, end: template.cycle.end });
    const working = template.days.flatMap((day, index) => (day.working ? [index] : []));
    const first = template.days[working[0] ?? -1];
    if (!first) return t("template.noDays");
    const days = working.length > 1 ? `${weekday(working[0]!)}–${weekday(working[working.length - 1]!)}` : weekday(working[0]!);
    return `${days} · ${first.start}–${first.end}`;
  };
}

/** Неделя или цикл клетками — `tplPreview` прототипа. */
export function TemplatePreview({ template }: { template: Pick<Template, "type" | "days" | "cycle"> }) {
  const { i18n } = useTranslation();
  const kinds = useKinds();
  const weekday = (index: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)));
  const cells =
    template.type === "weekly"
      ? template.days.map((day, index) => ({ label: weekday(index), day: day.working ? day : null }))
      : (() => {
          const { work, off, start, end, kind } = template.cycle;
          const length = Math.max(1, work + off);
          // Два цикла, если влезают в 8 клеток, — видно, что он повторяется.
          return Array.from({ length: length * 2 <= 8 ? length * 2 : length }, (_, index) => ({
            label: String(index + 1),
            day: index % length < work ? { start, end, kind } : null,
          }));
        })();
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((cell, index) => (
        <div
          key={index}
          className={`flex flex-col items-center gap-px rounded-md px-0.5 py-1.5 text-center tabular-nums ${
            cell.day ? kinds.of(cell.day.kind).chip : "border border-border text-fg-subtle [background:repeating-linear-gradient(135deg,transparent_0_5px,var(--color-surface-hover)_5px_6px)]"
          }`}
        >
          <small className="text-[10.5px] capitalize opacity-80">{cell.label}</small>
          {cell.day ? (
            <>
              <b className="text-[11px] font-semibold">{cell.day.start}</b>
              <b className="text-[11px] font-semibold">{cell.day.end}</b>
            </>
          ) : (
            <span className="py-1 text-[11px]">—</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- поля окон ---------- */

/**
 * Окно, пока грузится то, без чего форму не заполнить: щелчок не должен
 * выглядеть как «ничего не произошло». Отказ — причиной, а не вечной загрузкой.
 */
export function DialogLoading({ onClose, error }: { onClose: () => void; error?: string | null }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose}>
      <div className={`max-w-sm rounded-xl border border-border bg-surface px-8 py-6 text-sm shadow-xl ${error ? "text-danger" : "text-fg-subtle"}`}>
        {error ?? t("common.loading")}
      </div>
    </Modal>
  );
}

/**
 * Время «ЧЧ:ММ» текстом, как `.tin` прототипа: системное поле времени
 * пишет его по часам ОС — «06:00 PM» рядом с «09:00–17:00» в сетке.
 */
/** «09:00–18:00», у гибкой смены — «8 ч». */
export function useShiftTime() {
  const { t } = useTranslation();
  return (shift: Pick<Shift, "start" | "end" | "plannedMinutes">) =>
    isFlexible(shift) ? t("shift.flexible", { hours: shift.plannedMinutes / 60 }) : `${shift.start}–${shift.end}`;
}


export function Row({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
}

export function Segments<T extends string>({
  value,
  items,
  full = false,
  onChange,
}: {
  value: T;
  items: { value: T; label: ReactNode }[];
  /** На всю ширину колонки, кнопки поровну — вровень с полями формы. */
  full?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={`${full ? "flex w-full" : "inline-flex self-start"} rounded-md border border-border p-0.5`}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 text-[13px] transition-colors ${full ? "flex-1 justify-center" : ""} ${
            value === item.value ? "bg-surface-active font-medium text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
