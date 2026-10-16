import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightIcon, CalendarCheckIcon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { Avatar, Cell, type Item } from "@/features/item";
import type { Field, Relation } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useCandidatesTable } from "../api/candidates-table";
import { firstText, related, text } from "../api/org";
import { ACTIVE, CANDIDATES, useCandidateMoves } from "../api/vacancy-page";
import { daysBetween } from "../model/vacancy-dates";
import { Score, num } from "./vacancy-parts";

/**
 * Таблица кандидатов — `draw()` прототипа (candidates.html): кандидат
 * с уровнем и метками, вакансия с отделом, этап плашкой его цвета,
 * оценка, источник, ожидания, дни на этапе, отклик.
 *
 * Своя таблица, а не DataGrid: строка в две строки текста (вакансия
 * и отдел), а у грида высота строки одна на всех — её держит
 * виртуализатор. Колонки — по слагам `hr_candidates`, поэтому тип
 * фиксированный (FIXED_VIEW_TYPES) и на другой таблице не показывается.
 *
 * Две колонки зависят от вкладки — статуса (раскладка view по `status`):
 *
 *   активные   — Этап · На этапе;
 *   нанятые    — Выход на работу · Нанят;
 *   отказ, резерв — Причина · Последний этап.
 *
 * Действие в строке: у активных — следующий этап воронки, у отказа
 * и резерва — вернуть в работу. Оба пишут историю этапов.
 */

const HIRED = "hired";
/** Дольше — «застрял»: число на этапе красным, как `.bad` прототипа. */
const STUCK_DAYS = 5;

type Column = { id: string; label: string; right?: boolean; render: (row: Item) => ReactNode };

export function CandidatesTable({
  rows,
  status,
  fields,
  relations,
  language,
  canUpdate,
  onOpenRow,
}: {
  rows: Item[];
  /** Открытая вкладка — значение `status`. Пусто — раскладки нет, колонки активных. */
  status: string;
  fields: Field[];
  relations: Relation[];
  language: string;
  canUpdate: boolean;
  onOpenRow: (guid: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const today = todayInput();
  const { scores, departments, nextStage } = useCandidatesTable(rows);
  const moves = useCandidateMoves();
  const byId = useMemo(() => new Map(relations.map((relation) => [relation.id, relation])), [relations]);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });

  /** Ячейка поля схемы — уровень, метки: те же чипы, что в любой таблице. */
  const cell = (slug: string, row: Item) => {
    const field = fields.find((f) => f.slug === slug);
    return field && row[slug] ? (
      <Cell field={field} row={row} tableSlug={CANDIDATES} relations={byId} locale={locale} language={language} />
    ) : null;
  };
  const date = (value: unknown) => formatDate(text(value), "date", locale);

  const stage: Column = { id: "stage", label: t("vacancy.page.col.stage"), render: (row) => <Stage row={row} /> };
  const byStatus: Record<string, [Column, Column]> = {
    [ACTIVE]: [
      stage,
      {
        id: "days",
        label: t("candidates.col.onStage"),
        right: true,
        render: (row) => {
          const days = daysBetween(text(row.stage_changed_at), today);
          return days === null ? null : (
            <span className={days > STUCK_DAYS ? "text-danger" : ""}>
              {t("candidates.days", { count: Math.max(0, days) })}
            </span>
          );
        },
      },
    ],
    [HIRED]: [
      {
        id: "start",
        label: t("candidates.col.start"),
        render: (row) =>
          text(row.start_date) && (
            <span className={`inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs ${CHIP_STYLES.green}`}>
              <Icon as={CalendarCheckIcon} size={12} />
              {date(row.start_date)}
            </span>
          ),
      },
      { id: "hired", label: t("candidates.col.hired"), render: (row) => date(row.hired_at) },
    ],
  };
  const [first, second] = byStatus[status || ACTIVE] ?? [
    {
      id: "reason",
      label: t("candidates.col.reason"),
      render: (row: Item) => (
        <span className="text-fg-muted">{text(related(row, "hr_rejection_reasons_id").name)}</span>
      ),
    },
    { ...stage, id: "last", label: t("candidates.col.lastStage") },
  ];

  const columns: Column[] = [
    {
      id: "vacancy",
      label: t("candidates.col.vacancy"),
      render: (row) => (
        <span className="flex max-w-[260px] min-w-0 flex-col gap-0.5 leading-tight">
          <span className="truncate">{text(related(row, "hr_vacancies_id").title)}</span>
          <small className="truncate text-xs text-fg-subtle">
            {departments.get(text(row.hr_vacancies_id))}
          </small>
        </span>
      ),
    },
    first,
    { id: "score", label: t("vacancy.page.col.score"), render: (row) => <Score value={scores.get(text(row.guid))} /> },
    {
      id: "source",
      label: t("vacancy.page.col.source"),
      render: (row) => text(related(row, "hr_candidate_sources_id").name),
    },
    {
      id: "salary",
      label: t("vacancy.page.col.salary"),
      right: true,
      render: (row) => {
        const salary = num(row.salary_expectation);
        return salary === null ? null : `${compact.format(salary)} ${text(row.currency)}`.trim();
      },
    },
    second,
    { id: "applied", label: t("vacancy.page.col.applied"), render: (row) => date(row.applied_at) },
  ];

  const action = (row: Item) => {
    if (!canUpdate) return null;
    if (row.status === ACTIVE) {
      const next = nextStage.get(text(row.hr_recruiting_stages_id));
      return (
        next && (
          <RowButton title={t("candidates.next")} icon={ArrowRightIcon} onClick={() => moves.move(row, next)} />
        )
      );
    }
    return row.status === HIRED ? null : (
      <RowButton title={t("vacancy.page.restore")} icon={RotateCcwIcon} onClick={() => moves.restore(row)} />
    );
  };

  /*
   * Размеры — `table.ta` прототипа: ячейка 6×10, шапка 8×10 и 12.5px,
   * колонка кандидата 300–360. Таблица не уже экрана, но и не сжимается
   * в него: колонки берут свою ширину, лишнее уходит в прокрутку вбок.
   */
  const th = "sticky top-0 z-10 border-b border-border bg-surface px-2.5 py-2 text-left text-[12.5px] font-medium text-fg-muted whitespace-nowrap";
  const td = "h-12 border-b border-border px-2.5 py-1.5 align-middle whitespace-nowrap";

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6">
      <table className="min-w-full border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            <th className={`${th} left-0 z-20 min-w-[300px] border-r`}>{t("vacancy.page.col.candidate")}</th>
            {columns.map((column) => (
              <th key={column.id} className={`${th} ${column.right ? "text-right" : ""}`}>
                {column.label}
              </th>
            ))}
            <th className={`${th} w-10`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const guid = text(row.guid);
            return (
              <tr
                key={guid || index}
                onClick={() => onOpenRow(guid)}
                className="group cursor-pointer hover:[&>td]:tint-surface-hover"
              >
                <td className={`${td} sticky left-0 z-[1] max-w-[360px] min-w-[300px] border-r bg-surface`}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={text(row.full_name)} photo={firstText(row.photo) || undefined} size="lg" />
                    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                      <b className="truncate font-medium">{text(row.full_name) || "—"}</b>
                      <span className="shrink-0">{cell("level", row)}</span>
                      <span className="shrink-0">{cell("tags", row)}</span>
                    </span>
                  </span>
                </td>
                {columns.map((column) => (
                  <td key={column.id} className={`${td} ${column.right ? "text-right tabular-nums" : ""}`}>
                    {column.render(row)}
                  </td>
                ))}
                <td className={`${td} text-right`}>{action(row)}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 2} className="py-10 text-center text-fg-subtle">
                <span className="inline-flex flex-col items-center gap-2">
                  <Icon as={UsersIcon} size={20} />
                  {t("vacancy.page.noCandidates")}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Этап плашкой его цвета с точкой — `REC.stageTag` прототипа. */
function Stage({ row }: { row: Item }) {
  const stage = related(row, "hr_recruiting_stages_id");
  const name = text(stage.name);
  if (!name) return null;
  const color = text(stage.color) ? hexToChipColor(text(stage.color)) : "gray";
  return (
    <span className={`inline-flex h-5 max-w-full items-center gap-1.5 rounded-full px-2 text-xs ${CHIP_STYLES[color]}`}>
      <i className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Кнопка в строке: проявляется под мышью, щелчок не открывает строку. */
function RowButton({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: typeof ArrowRightIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex size-6 items-center justify-center rounded-md text-fg-muted opacity-0 transition hover:bg-surface-active hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Icon as={icon} size={14} />
    </button>
  );
}
