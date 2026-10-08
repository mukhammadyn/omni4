import { useMemo, type ReactNode, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon, MapPinIcon, NetworkIcon, PlusIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { Avatar, Cell, type Item } from "@/features/item";
import type { Field, Relation } from "@/features/table";
import { todayInput } from "@/shared/lib/date-value";
import { Icon } from "@/shared/ui/icon";
import { firstText, related, text } from "../api/org";
import { useVacancyFunnels } from "../api/vacancy";
import { daysOpen } from "../model/vacancy-dates";
import { EMPTY_FUNNEL, type Funnel } from "../model/vacancy-funnel";
import { DeadlineBadge, FunnelBar, num, salaryText, stageDot } from "./vacancy-parts";

/**
 * «Карточки» вакансий — `cardsView` прототипа (vacancies.html, `.rc-card`):
 * статус и приоритет, дедлайн, название, отдел · филиал · сколько
 * открыта, зарплата, воронка с тремя последними этапами, внизу —
 * кандидаты, нанято и команда найма.
 *
 * Сделана под `hr_vacancies` и вне её не показывается (FIXED_VIEW_TYPES):
 * поля берутся по слагам схемы ERP, а не из колонок view.
 */
export function VacancyCards({
  tableSlug,
  fields,
  rows,
  relations,
  language,
  onOpenRow,
  onAdd,
  onEndReached,
}: {
  tableSlug: string;
  fields: Field[];
  rows: Item[];
  relations: Relation[];
  language: string;
  onOpenRow: (guid: string) => void;
  /** Карточка «Новая вакансия» последней. Нет — права на запись нет. */
  onAdd?: (() => void) | undefined;
  onEndReached?: (() => void) | undefined;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const ids = useMemo(() => rows.map((row) => text(row.guid)).filter(Boolean), [rows]);
  const byVacancy = useVacancyFunnels(ids);
  const byId = useMemo(() => new Map(relations.map((relation) => [relation.id, relation])), [relations]);
  const status = fields.find((field) => field.slug === "status");
  const priority = fields.find((field) => field.slug === "priority");
  const today = todayInput();

  const chip = (field: Field | undefined, row: Item) =>
    field && (
      <Cell field={field} row={row} tableSlug={tableSlug} relations={byId} locale={locale} language={language} />
    );

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (onEndReached && box.scrollHeight - box.scrollTop - box.clientHeight < 300) onEndReached();
  };

  return (
    <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-6">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3.5 py-4">
        {rows.map((row, index) => {
          const guid = text(row.guid) || String(index);
          const funnel = byVacancy ? (byVacancy.get(guid) ?? EMPTY_FUNNEL) : null;
          const days = daysOpen(text(row.opened_at), text(row.closed_at), today);
          const salary = salaryText(row, locale, t);
          const dept = text(related(row, "departments_id").name);
          const branch = text(related(row, "locations_id").name);
          const team = ["employees_id", "employees_id_2"]
            .map((slug) => related(row, slug))
            .filter((person) => text(person.full_name));

          return (
            <li key={`${guid}:${index}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenRow(guid)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenRow(guid);
                  }
                }}
                className="flex h-full min-h-[210px] cursor-pointer flex-col gap-2 rounded-[12px] border border-border bg-surface px-[18px] py-4 transition-shadow hover:border-border-strong hover:shadow-raised"
              >
                {/* Чипы не сжимаются: обрезанный «Откры…» хуже переноса.
                    Бейдж срока — в одну строку; не влез — уходит ниже целиком. */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="shrink-0">{chip(status, row)}</span>
                  <span className="shrink-0">{chip(priority, row)}</span>
                  <span className="ml-auto">
                    <DeadlineBadge row={row} today={today} short />
                  </span>
                </div>

                <h3 className="mt-0.5 text-[16.5px] font-semibold">{text(row.title) || "—"}</h3>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-fg-muted">
                  {dept && <Meta icon={NetworkIcon}>{dept}</Meta>}
                  {branch && <Meta icon={MapPinIcon}>{branch}</Meta>}
                  {days !== null && <Meta icon={CalendarIcon}>{t("vacancy.openFor", { count: days })}</Meta>}
                </div>

                <div className="text-[14.5px] font-semibold">
                  {salary ?? <span className="font-normal text-fg-subtle">{t("vacancy.salaryNegotiable")}</span>}
                </div>

                <FunnelBar funnel={funnel ?? EMPTY_FUNNEL} big />
                {funnel && <Legend funnel={funnel} />}

                <div className="mt-auto flex items-center gap-3 border-t border-border pt-2.5 text-[12.5px] text-fg-muted">
                  {funnel && (
                    <>
                      <Meta icon={UsersIcon}>{t("vacancy.candidatesCount", { count: funnel.total })}</Meta>
                      <Hired hired={funnel.hired} headcount={num(row.headcount) ?? 0} />
                    </>
                  )}
                  {team.length > 0 && (
                    <span className="ml-auto flex" title={t("vacancy.team")}>
                      {team.map((person, at) => (
                        <span key={at} className={`rounded-full ring-2 ring-surface ${at ? "-ml-1.5" : ""}`}>
                          <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} />
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}

        {onAdd && (
          <li>
            <button
              type="button"
              onClick={onAdd}
              className="flex h-full min-h-[210px] w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-border-strong text-sm text-fg-muted transition-colors hover:border-accent hover:bg-accent-subtle hover:text-accent-text"
            >
              <Icon as={PlusIcon} size={22} />
              <b className="font-semibold">{t("vacancy.new")}</b>
            </button>
          </li>
        )}
      </ul>

      {!rows.length && !onAdd && (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("table.noRows")}</p>
      )}
    </div>
  );
}

function Meta({ icon, children }: { icon: typeof UsersIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon as={icon} size={13} className="text-fg-subtle" />
      {children}
    </span>
  );
}

/** Три последних этапа с кандидатами — ближние к найму сверху, как `.rc-leg`. */
function Legend({ funnel }: { funnel: Funnel }) {
  const { t } = useTranslation();
  const last = funnel.stages.slice(-3).reverse();

  return (
    <div className="flex flex-col gap-0.5 text-xs text-fg-muted">
      {last.length ? (
        last.map(({ stage, count }) => (
          <span key={stage.id} className="inline-flex items-center gap-1.5">
            <i className={`size-[7px] rounded-full ${stageDot(stage.color)}`} />
            {stage.name} · {count}
          </span>
        ))
      ) : (
        <span className="text-fg-subtle">{t(funnel.total ? "vacancy.noActive" : "vacancy.noCandidates")}</span>
      )}
    </div>
  );
}

function Hired({ hired, headcount }: { hired: number; headcount: number }) {
  const { t } = useTranslation();
  const full = headcount > 0 && hired >= headcount;

  return (
    <span className={`inline-flex items-center gap-1 text-success ${full ? "font-semibold" : "font-medium"}`}>
      <Icon as={UserCheckIcon} size={13} />
      {t("vacancy.hiredOf", { hired, total: headcount })}
    </span>
  );
}
