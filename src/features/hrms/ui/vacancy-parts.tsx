import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AlarmClockIcon } from "lucide-react";
import type { Item } from "@/features/item";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { text } from "../api/org";
import { deadlineState } from "../model/vacancy-dates";
import type { Funnel } from "../model/vacancy-funnel";

/*
 * Части вакансии, общие у таблицы и карточек (vacancies.html прототипа:
 * `REC.sal`, `dl()`, `bar()`).
 */

export const num = (value: unknown) => (typeof value === "number" ? value : null);

/** «5 млн–10 млн UZS»; ни от, ни до — null («По договорённости»). */
export function salaryText(row: Item, locale: string, t: TFunction) {
  const from = num(row.salary_from);
  const to = num(row.salary_to);
  if (from === null && to === null) return null;

  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const range =
    from !== null && to !== null
      ? `${compact.format(from)}–${compact.format(to)}`
      : from !== null
        ? t("vacancy.salaryFrom", { value: compact.format(from) })
        : t("vacancy.salaryTo", { value: compact.format(to!) });
  return `${range} ${text(row.currency)}`.trim();
}

/**
 * Бейдж `.rc-dl`: «просрочено N дн.» или «N дн. до дедлайна».
 * `short` — для карточки: «−N дн.» / «N дн.», полный текст в подсказке,
 * иначе рядом со статусом и приоритетом ему не хватает места.
 */
export function DeadlineBadge({ row, today, short }: { row: Item; today: string; short?: boolean }) {
  const { t } = useTranslation();
  const state = deadlineState(text(row.deadline), text(row.status), today);
  if (!state) return null;

  const full =
    state.kind === "overdue"
      ? t("vacancy.overdue", { count: state.days })
      : t("vacancy.dueIn", { count: state.days });

  return (
    <span
      title={short ? full : undefined}
      className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap ${
        state.kind === "overdue" ? "text-danger" : "text-warning"
      }`}
    >
      <Icon as={AlarmClockIcon} size={12} />
      {short ? `${state.kind === "overdue" ? "−" : ""}${t("vacancy.days", { count: state.days })}` : full}
    </span>
  );
}

/** Полоса `.rc-bar`: сегмент на этап, ширина — по числу активных. */
export function FunnelBar({ funnel, big }: { funnel: Funnel; big?: boolean }) {
  const { t } = useTranslation();

  return (
    <span
      className={`flex w-full gap-[3px] overflow-hidden rounded-[3px] ${big ? "h-2" : "h-1.5"}`}
      title={funnel.stages.length ? undefined : t(funnel.total ? "vacancy.noActive" : "vacancy.noCandidates")}
    >
      {funnel.stages.length ? (
        funnel.stages.map(({ stage, count }) => (
          <i
            key={stage.id}
            title={`${stage.name} · ${count}`}
            style={{ flex: count }}
            className={`min-w-1.5 rounded-[3px] ${stageDot(stage.color)}`}
          />
        ))
      ) : (
        <i className="flex-1 bg-surface-hover" />
      )}
    </span>
  );
}

/*
 * Заливка этапа — серией палитры графиков, а не цветом чипа: у чипа
 * фон в светлой теме почти белый, а текст в тёмной белый, и полоса
 * выходила бы бледной или белой. Серии проверены как заливка в обеих
 * темах (styles.css, «Палитра графиков»). Оттенок чипа → ближайшая серия.
 */
const STAGE_FILL: Record<ChipColor, string> = {
  blue: "bg-chart-1",
  orange: "bg-chart-2",
  green: "bg-chart-3",
  yellow: "bg-chart-4",
  pink: "bg-chart-5",
  purple: "bg-chart-7",
  red: "bg-chart-8",
  gray: "bg-chart-other",
  brown: "bg-chart-other",
};

export const stageDot = (color: string) => STAGE_FILL[hexToChipColor(color)];

/** Название этапа его цветом — заголовок колонки воронки, как в прототипе. */
const STAGE_TEXT: Record<ChipColor, string> = {
  blue: "text-chart-1",
  orange: "text-chart-2",
  green: "text-chart-3",
  yellow: "text-chart-4",
  pink: "text-chart-5",
  purple: "text-chart-7",
  red: "text-chart-8",
  gray: "text-fg-muted",
  brown: "text-fg-muted",
};

export const stageText = (color: string) => STAGE_TEXT[hexToChipColor(color)];

/** Оценка «8/10» плашкой — `REC.score` прототипа: 8+ зелёная, 6+ жёлтая, ниже красная. */
export function Score({ value }: { value: number | undefined }) {
  const color =
    value === undefined ? "bg-surface-hover text-fg-subtle" : CHIP_STYLES[value >= 8 ? "green" : value >= 6 ? "yellow" : "red"];
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-[4px] px-1.5 text-xs font-semibold tabular-nums ${color}`}>
      {value ?? "—"}/10
    </span>
  );
}
