import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon, HouseIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { isClock, type Shift, type ShiftKind, type Template } from "../model/schedule";

/* Общее у экранов графика: календаря, окна смены, вкладки сотрудника. */

/** Тип смены: подложка, полоса слева и значок — `KIND` прототипа. */
export const KIND_STYLE: Record<ShiftKind, { chip: string; stripe: string; icon: LucideIcon }> = {
  day: { chip: CHIP_STYLES.blue, stripe: "bg-chart-1", icon: SunIcon },
  night: { chip: CHIP_STYLES.purple, stripe: "bg-chart-7", icon: MoonIcon },
  remote: { chip: CHIP_STYLES.green, stripe: "bg-chart-3", icon: HouseIcon },
};

/** «8 ч», «7 ч 30 м». */
export function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h && m ? t("timesheet.hm", { h, m }) : m ? t("timesheet.m", { m }) : t("timesheet.h", { h });
  };
}

/** Новая смена на клетке или правка существующей — окну смены. */
export type OpenShift = { shift?: Shift; employeeId?: string; date: string };

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
            cell.day ? KIND_STYLE[cell.day.kind].chip : "border border-border text-fg-subtle [background:repeating-linear-gradient(135deg,transparent_0_5px,var(--color-surface-hover)_5px_6px)]"
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
 * Время «ЧЧ:ММ» текстом, как `.tin` прототипа: системное поле времени
 * пишет его по часам ОС — «06:00 PM» рядом с «09:00–17:00» в сетке.
 */
export function ClockInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Input
        value={value}
        inputMode="numeric"
        maxLength={5}
        placeholder="09:00"
        aria-invalid={!isClock(value)}
        onChange={(event) => onChange(event.target.value)}
        className={`pr-8 tabular-nums ${isClock(value) ? "" : "border-danger"}`}
      />
      <Icon as={ClockIcon} size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
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
  onChange,
}: {
  value: T;
  items: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex self-start rounded-md border border-border p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 text-[13px] transition-colors ${
            value === item.value ? "bg-surface-active font-medium text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
