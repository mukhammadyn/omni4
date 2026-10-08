import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExtraColumn, Item } from "@/features/item";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { text } from "../api/org";
import { useVacancyFunnels } from "../api/vacancy";
import { daysOpen } from "../model/vacancy-dates";
import { EMPTY_FUNNEL } from "../model/vacancy-funnel";
import { DeadlineBadge, FunnelBar, num, salaryText } from "./vacancy-parts";

const NO_ROWS: Item[] = [];

/**
 * Хвост таблицы вакансий из прототипа (vacancies.html, tableView):
 * Зарплата · Воронка · Кандидаты · Нанято · Открыта · Дедлайн.
 *
 * Воронка и счётчики считаются по кандидатам, остальное — сборка
 * нескольких полей в одну ячейку. Сами поля (зарплата от/до, валюта,
 * даты) правятся в карточке и сортируются из панели — здесь их вид.
 *
 * `rows` не задан — таблица не вакансий: колонок и запросов нет.
 */
export function useVacancyColumns(rows: Item[] | undefined): ExtraColumn[] {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const list = rows ?? NO_ROWS;
  const ids = useMemo(() => list.map((row) => text(row.guid)).filter(Boolean), [list]);
  const byVacancy = useVacancyFunnels(ids);

  return useMemo(() => {
    if (!rows) return [];
    const of = (row: Item) => (byVacancy ? (byVacancy.get(text(row.guid)) ?? EMPTY_FUNNEL) : null);
    const today = todayInput();

    return [
      {
        id: "vacancy:salary",
        label: t("vacancy.salary"),
        width: 150,
        numeric: true,
        render: (row) =>
          salaryText(row, locale, t) ?? <span className="text-fg-subtle">{t("vacancy.salaryNegotiable")}</span>,
      },
      { id: "vacancy:funnel", label: t("vacancy.funnel"), width: 160, render: (row) => <FunnelBar funnel={of(row) ?? EMPTY_FUNNEL} /> },
      { id: "vacancy:candidates", label: t("vacancy.candidates"), width: 110, numeric: true, render: (row) => of(row)?.total },
      {
        id: "vacancy:hired",
        label: t("vacancy.hired"),
        width: 90,
        numeric: true,
        render: (row) => {
          const funnel = of(row);
          if (!funnel) return null;
          const headcount = num(row.headcount) ?? 0;
          return (
            <b className={headcount && funnel.hired >= headcount ? "text-success" : ""}>
              {funnel.hired}/{headcount}
            </b>
          );
        },
      },
      {
        id: "vacancy:open",
        label: t("vacancy.open"),
        width: 90,
        numeric: true,
        render: (row) => {
          const days = daysOpen(text(row.opened_at), text(row.closed_at), today);
          return days === null ? null : t("vacancy.days", { count: days });
        },
      },
      {
        id: "vacancy:deadline",
        label: t("vacancy.deadline"),
        width: 230,
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{formatDate(text(row.deadline), "date", locale)}</span>
            <DeadlineBadge row={row} today={today} />
          </span>
        ),
      },
    ];
  }, [rows, byVacancy, t, locale]);
}
