import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BriefcaseIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Cell, type Item } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { CHIP_STYLES } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { related, text } from "../api/org";
import { VACANCIES, useVacancyPlan } from "../api/vacancy";
import { cellState, monthOf, sumRows, type CellState, type Month, type PlanRow } from "../model/vacancy-plan";
import { usePlanSettings, type PlanGroup, type PlanHeight } from "./plan-settings";
import { GROUP_ICON } from "./VacancyPlanTools";

/** Окно — шесть месяцев, два назад от опорного (`winMonths` прототипа). */
const WINDOW = 6;
const BACK = 2;

/** Ячейка «нанято / план» — `.pv-v` прототипа: цвет чипа или рамка. */
const CELL_STYLE: Record<CellState, string> = {
  empty: "",
  ok: CHIP_STYLES.green,
  overdue: CHIP_STYLES.red,
  current: CHIP_STYLES.yellow,
  planned: "text-fg-muted ring-1 ring-inset ring-border-strong",
};

/**
 * Высота строки вакансии — «Высота строки» прототипа, в шагах нашей
 * таблицы: компактная — одна строка `h-row`, как у грида; обычная
 * и просторная — подпись второй строкой.
 */
const HEIGHT: Record<PlanHeight, { row: string; icon: string; stacked: boolean }> = {
  compact: { row: "h-row", icon: "size-5", stacked: false },
  normal: { row: "h-11", icon: "size-6", stacked: true },
  spacious: { row: "h-14", icon: "size-7", stacked: true },
};

/** У статуса связей нет — ячейке хватает пустого набора. */
const NO_RELATIONS = new Map();

/**
 * «Планирование» найма — `planView` прототипа (vacancies.html): группы
 * (филиал по умолчанию) → вакансии, по месяцам «нанято / план», справа
 * «План · Работают · Нанято · Уходят · Нужно нанять», внизу «Итого».
 *
 * Группировку, вид строки и высоту правят кнопки в строке вкладок
 * (VacancyPlanTools), период — подшапка здесь же; всё помнится
 * по view (plan-settings).
 *
 * Сделано под `hr_vacancies` (FIXED_VIEW_TYPES). Считает model/vacancy-plan.
 */
export function VacancyPlan({
  viewId,
  rows,
  fields,
  language,
  pending,
  onOpenRow,
}: {
  viewId: string;
  rows: Item[];
  fields: Field[];
  language: string;
  /** Вакансии ещё догружаются: итоги посчитаны не по всем. */
  pending: boolean;
  onOpenRow: (guid: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const today = todayInput();
  const now = monthOf(today)!;
  const settings = usePlanSettings(viewId);
  const { group } = settings;
  const anchor = settings.anchor ?? now;
  const setAnchor = (month: Month) => settings.setAnchor(month === now ? undefined : month);
  const height = HEIGHT[settings.height];
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const plans = useVacancyPlan(rows, today);

  const months = Array.from({ length: WINDOW }, (_, i) => anchor - BACK + i);
  const longMonth = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  const monthName = (month: Month) =>
    capitalize(longMonth.format(new Date(Date.UTC(Math.floor(month / 12), month % 12, 1))));
  const year = (month: Month) => Math.floor(month / 12);
  const statusField = fields.find((f) => f.slug === "status");

  const groups = useMemo(() => {
    if (!plans) return [];
    const byKey = new Map<string, { row: Item; plan: PlanRow }[]>();
    for (const row of rows) {
      const plan = plans.get(text(row.guid));
      if (!plan) continue;
      const key = groupKey(group, fields, language, row) || "—";
      byKey.set(key, [...(byKey.get(key) ?? []), { row, plan }]);
    }
    return [...byKey]
      .map(([key, items]) => ({ key, items, sum: sumRows(items.map((item) => item.plan)) }))
      .sort((a, b) => b.sum.total.need - a.sum.total.need || a.key.localeCompare(b.key));
  }, [plans, rows, group, fields, language]);

  const all = useMemo(() => sumRows(groups.map((g) => g.sum)), [groups]);

  /** Подпись под названием: что включено в «Строке». Группа в ней не повторяется. */
  const details = (row: Item) =>
    [
      settings.shows("dept") && group !== "dept" && text(related(row, "departments_id").name),
      settings.shows("branch") && group !== "branch" && text(related(row, "locations_id").name),
      settings.shows("deadline") &&
        text(row.deadline) &&
        t("vacancy.plan.until", { date: formatDate(text(row.deadline), "date", locale) }),
    ]
      .filter(Boolean)
      .join(" · ");

  /** Ячейки месяцев и итоги строки. `strong` — строка группы и «Итого». */
  const cells = (plan: PlanRow, strong = false) => (
    <>
      {months.map((month) => {
        const p = plan.plan.get(month) ?? 0;
        const h = plan.hired.get(month) ?? 0;
        const state = cellState(p, h, month, now);
        const need = p - h;
        return (
          <td
            key={month}
            className={`${td} border-l text-center ${month === now ? "bg-accent-subtle/30" : ""}`}
          >
            {state === "empty" ? (
              <span className="text-border-strong">·</span>
            ) : (
              <span
                title={t("vacancy.plan.cellHint", { plan: p, hired: h })}
                className="inline-flex items-center gap-1"
              >
                <Fraction state={state} hired={h} plan={p} strong={strong} />
                {need > 0 && month <= now && (
                  <em className="text-2xs font-semibold text-danger not-italic">−{need}</em>
                )}
              </span>
            )}
          </td>
        );
      })}
      <td className={`${td} ${tail} font-semibold`}>{plan.total.plan}</td>
      <td className={`${td} ${tail}`}>{plan.total.staff}</td>
      <td className={`${td} ${tail}`}>
        {plan.total.hired ? (
          <span className="font-medium text-success">{plan.total.hired}</span>
        ) : (
          <span className="text-fg-subtle">0</span>
        )}
      </td>
      <td className={`${td} ${tail}`}>
        {plan.total.leave ? <Pill color="red">{plan.total.leave}</Pill> : <span className="text-fg-subtle">0</span>}
      </td>
      <td className={`${td} ${tail}`}>
        {plan.total.need ? (
          <Pill color="orange">{plan.total.need}</Pill>
        ) : (
          <span className={`inline-grid size-5 place-items-center rounded-full ${CHIP_STYLES.green}`}>
            <Icon as={CheckIcon} size={12} />
          </span>
        )}
      </td>
    </>
  );

  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Подшапка `.vt-cal` прототипа: период, «Сегодня», итоги точками. */}
      <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 text-sm">
        <NavButton label={t("vacancy.plan.back")} onClick={() => setAnchor(anchor - 1)}>
          <Icon as={ChevronLeftIcon} size={16} />
        </NavButton>
        <b className="min-w-[180px] text-center font-semibold">
          {monthName(months[0]!)} – {monthName(months[WINDOW - 1]!)} {year(months[WINDOW - 1]!)}
        </b>
        <NavButton label={t("vacancy.plan.forward")} onClick={() => setAnchor(anchor + 1)}>
          <Icon as={ChevronRightIcon} size={16} />
        </NavButton>
        <button
          type="button"
          onClick={() => setAnchor(now)}
          className="ml-1 h-7 rounded-md border border-border px-2.5 text-[13px] text-fg transition-colors hover:bg-surface-hover"
        >
          {t("vacancy.plan.today")}
        </button>

        <span className="mx-2 h-4 w-px bg-border" />

        <div className="flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
          <Stat color="blue" label={t("vacancy.plan.plan")} value={all.total.plan} />
          <Stat color="gray" label={t("vacancy.plan.working")} value={all.total.staff} />
          <Stat color="green" label={t("vacancy.plan.hired")} value={all.total.hired} />
          <Stat color="red" label={t("vacancy.plan.leaving")} value={all.total.leave} />
          <Stat color="orange" label={t("vacancy.plan.need")} value={all.total.need} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className={`${th} min-w-[220px] text-left`}>
                {t(`vacancy.plan.by.${group}`)} / {t("vacancy.plan.vacancy")}
              </th>
              {months.map((month, i) => (
                <th
                  key={month}
                  /* Цвет — либо-либо: с общим серым шапки акцент проигрывал. */
                  className={`${thBox} min-w-[64px] text-center font-medium ${i === 0 ? "border-l" : ""} ${
                    month === now ? "bg-accent-subtle/30 text-accent-text" : "text-fg-muted"
                  }`}
                >
                  {monthName(month)}
                  <small
                    className={`mt-0.5 block text-xs font-normal ${month === now ? "text-accent-text/70" : "text-fg-subtle"}`}
                  >
                    {year(month)}
                  </small>
                </th>
              ))}
              <th className={`${th} ${tail} whitespace-nowrap`}>{t("vacancy.plan.plan")}</th>
              <th className={`${th} ${tail} whitespace-nowrap`}>{t("vacancy.plan.working")}</th>
              <th className={`${th} ${tail} whitespace-nowrap`}>{t("vacancy.plan.hired")}</th>
              <th className={`${th} ${tail} whitespace-nowrap`}>{t("vacancy.plan.leaving")}</th>
              <th className={`${th} ${tail} whitespace-nowrap`}>{t("vacancy.plan.need")}</th>
            </tr>
          </thead>

          <tbody>
            {!plans ? (
              <tr>
                <td colSpan={WINDOW + 6} className="py-8 text-center text-fg-subtle">
                  {t("common.loading")}
                </td>
              </tr>
            ) : !groups.length ? (
              <tr>
                <td colSpan={WINDOW + 6} className="py-8 text-center text-fg-subtle">
                  {t("table.noRows")}
                </td>
              </tr>
            ) : (
              groups.map(({ key, items, sum }) => {
                const shut = folded.has(key);
                return [
                  <tr
                    key={`g:${key}`}
                    onClick={() => toggle(key)}
                    className="h-row cursor-pointer [&>td]:bg-surface-hover [&>td]:font-medium"
                  >
                    <td className={td}>
                      <span className="flex items-center gap-1.5">
                        <Icon
                          as={ChevronDownIcon}
                          size={14}
                          className={`text-fg-subtle transition-transform ${shut ? "-rotate-90" : ""}`}
                        />
                        <span className="grid size-5 place-items-center rounded-[4px] bg-surface text-fg-muted ring-1 ring-border ring-inset">
                          <Icon as={GROUP_ICON[group]} size={12} />
                        </span>
                        {key}
                        <span className="text-xs font-normal text-fg-subtle">{items.length}</span>
                      </span>
                    </td>
                    {cells(sum, true)}
                  </tr>,
                  ...(shut
                    ? []
                    : items.map(({ row, plan }) => {
                        const sub = details(row);
                        const status = settings.shows("status") && statusField && text(row.status) && (
                          <Cell
                            field={statusField}
                            row={row}
                            tableSlug={VACANCIES}
                            relations={NO_RELATIONS}
                            locale={locale}
                            language={language}
                          />
                        );
                        return (
                          <tr
                            key={text(row.guid)}
                            onClick={() => onOpenRow(text(row.guid))}
                            className={`${height.row} cursor-pointer hover:[&>td]:bg-surface-hover`}
                          >
                            <td className={`${td} max-w-[340px] pl-7`}>
                              <span className="flex items-center gap-2">
                                <span
                                  className={`grid ${height.icon} shrink-0 place-items-center rounded-md ${CHIP_STYLES.blue}`}
                                >
                                  <Icon as={BriefcaseIcon} size={13} />
                                </span>
                                <span
                                  className={`flex min-w-0 ${height.stacked ? "flex-col" : "items-center gap-2"}`}
                                >
                                  <span className="truncate font-medium">{text(row.title) || "—"}</span>
                                  {(status || sub) && (
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
                                      {status}
                                      {sub && <span className="truncate">{sub}</span>}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </td>
                            {cells(plan)}
                          </tr>
                        );
                      })),
                ];
              })
            )}
          </tbody>

          {plans && groups.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-surface">
              <tr className="h-row font-semibold [&>td]:border-t [&>td]:border-t-border-strong">
                <td className={td}>{t("vacancy.plan.total")}</td>
                {cells(all, true)}
              </tr>
            </tfoot>
          )}
        </table>

        <div className="flex flex-wrap items-center gap-4 py-3 text-xs text-fg-muted">
          <Legend state="ok" label={t("vacancy.plan.legend.ok")} />
          <Legend state="current" label={t("vacancy.plan.legend.current")} />
          <Legend state="overdue" label={t("vacancy.plan.legend.overdue")} />
          <Legend state="planned" label={t("vacancy.plan.legend.planned")} />
          <span className="text-fg-subtle">{t("vacancy.plan.legend.hint")}</span>
          {pending && <span className="text-warning">{t("vacancy.plan.partial", { count: rows.length })}</span>}
        </div>
      </div>
    </div>
  );
}

/*
 * Сетка — как у DataGrid: строка `h-row`, поля по 8px, линии `border`.
 * Шапка выше строки, как `th.pv-h` прототипа: под месяцем его год.
 * Месяцы в шапке линиями не делятся — только тело и итоги.
 */
const thBox = "h-12 border-b border-border px-2 text-[13px] leading-tight";
const th = `${thBox} font-normal text-fg-muted`;
const td = "border-b border-border px-2";
const tail = "min-w-[64px] border-l border-border px-3 text-right tabular-nums";

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/** Подпись варианта PICK_LIST / STATUS, как в ячейке. */
function optionText(fields: Field[], language: string, slug: string, row: Item) {
  const field = fields.find((f) => f.slug === slug);
  const value = text(row[slug]);
  const found = field && optionOf(field, value);
  return found ? localized(found.labels, language, found.label || found.value) : value;
}

function groupKey(group: PlanGroup, fields: Field[], language: string, row: Item): string {
  switch (group) {
    case "branch":
      return text(related(row, "locations_id").name);
    case "dept":
      return text(related(row, "departments_id").name);
    case "status":
      return optionText(fields, language, "status", row);
    case "priority":
      return optionText(fields, language, "priority", row);
    case "recruiter":
      return text(related(row, "employees_id").full_name);
  }
}

/** «нанято / план» плашкой. */
function Fraction({ state, hired, plan, strong }: { state: CellState; hired: number; plan: number; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline rounded-[5px] px-1.5 py-px text-xs tabular-nums ${CELL_STYLE[state]} ${
        strong ? "font-medium" : ""
      }`}
    >
      <b className="font-semibold">{hired}</b>
      <i className="mx-0.5 not-italic opacity-60">/</i>
      {plan}
    </span>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

/** Бейдж `.pl-need` / `.pl-lv`: число в цветной капсуле. */
function Pill({ color, children }: { color: "red" | "orange"; children: ReactNode }) {
  return (
    <span
      className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold ${CHIP_STYLES[color]}`}
    >
      {children}
    </span>
  );
}

/*
 * Точка итога — смысловым цветом: `CHIP_DOT` в тёмной теме белый.
 * «Нанято» зелёное, как его числа и выполненные ячейки; «Работают» —
 * нейтральные, это не результат найма, а исходная численность.
 */
const STAT_DOT = {
  blue: "bg-accent",
  gray: "bg-fg-subtle",
  green: "bg-success",
  red: "bg-danger",
  orange: "bg-warning",
};

function Stat({ color, label, value }: { color: keyof typeof STAT_DOT; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`size-2 rounded-full ${STAT_DOT[color]}`} />
      {label}
      <b className="font-semibold text-fg tabular-nums">{value}</b>
    </span>
  );
}

function Legend({ state, label }: { state: CellState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Fraction state={state} hired={state === "ok" ? 2 : 0} plan={state === "ok" ? 2 : 1} />
      {label}
    </span>
  );
}
