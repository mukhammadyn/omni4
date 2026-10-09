import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, EyeIcon, PlaneIcon, ShieldCheckIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { pageCount } from "@/shared/ui/pagination";
import { useAbsenceRequests, useDecideRequest, useDecisions, useRoutes, type AbsenceRequest } from "../api/absences";
import { progressOf, routeFor } from "../model/approval";
import { Pager, PeriodBar, usePeriod, useScopedPage, type OpenEmployee } from "./attendance-parts";
import { ABSENCES_TAB } from "./employee-tabs";

const PAGE = 20;
const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];
/** Варианты STATUS `hr_requests.status`, у которых есть подпись. */
const LABELED: string[] = [...STATUSES, "cancelled"];
type Labeled = Status | "cancelled";
const STATUS_CHIP: Record<string, ChipColor> = { pending: "yellow", approved: "green", rejected: "red", cancelled: "gray" };
const STATUS_DOT: Record<Status, string> = { pending: "bg-warning", approved: "bg-success", rejected: "bg-danger" };

/**
 * «Отсутствия» — заявки на отсутствие (`hr_requests` типа absence), как
 * AbsenceRequestsView HRMS (`udevs_hrms_admin`, Time/components):
 * сотрудник, тип, период, дней, статус с прогрессом маршрута,
 * «Одобрить / Отклонить» у ждущих. Из прототипа (`absView`) — неделя
 * и день, счётчики статусов с отбором, ждущие первыми.
 *
 * Одобрение идёт по маршруту отдела (model/approval): шаг за шагом,
 * итог — статус заявки. Клик по строке — страница сотрудника на вкладке
 * «Отсутствия» (`employee.html#abs`), «глаз» — обычная карточка записи.
 * Сделан под `hr_requests` (FIXED_VIEW_TYPES).
 */
export function Absences({
  viewId,
  onOpenRow,
  onOpenEmployee,
}: {
  viewId: string;
  onOpenRow: (guid: string) => void;
  onOpenEmployee: OpenEmployee;
}) {
  const { t, i18n } = useTranslation();
  const view = usePeriod(viewId, ABSENCE_SCALES);
  const { range, query } = view;
  const requests = useAbsenceRequests(range.from, range.to, query);
  const routes = useRoutes();
  const decide = useDecideRequest();
  const [only, setOnly] = useState<Set<Status>>(() => new Set());

  const counts = useMemo(() => {
    const result: Record<Status, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const request of requests.rows) if (request.status in result) result[request.status as Status] += 1;
    return result;
  }, [requests.rows]);

  // Ждущие решения — первыми, дальше по дате начала, свежие выше.
  const shown = useMemo(
    () =>
      requests.rows
        .filter((request) => !only.size || only.has(request.status as Status))
        .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.from.localeCompare(a.from)),
    [requests.rows, only],
  );
  const [page, setPage] = useScopedPage(`${range.from}|${query}|${[...only].join()}`);
  const pages = pageCount(shown.length, PAGE);
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * PAGE, current * PAGE);
  const decisions = useDecisions(useMemo(() => slice.map((request) => request.id), [slice]));

  const date = new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const period = (request: AbsenceRequest) => {
    const from = date.format(new Date(`${request.from}T00:00:00Z`));
    return request.from === request.to ? from : `${from} — ${date.format(new Date(`${request.to}T00:00:00Z`))}`;
  };
  const toggle = (status: Status) =>
    setOnly((prev) => {
      const next = new Set(prev);
      if (!next.delete(status)) next.add(status);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodBar view={view}>
        <div className="flex flex-wrap items-center gap-1">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggle(status)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors ${
                only.has(status) ? "bg-surface-active text-fg ring-1 ring-border-strong ring-inset" : "text-fg-muted hover:bg-surface-hover"
              }`}
            >
              <i className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
              {t(`absences.status.${status}`)}
              <b className="font-semibold text-fg tabular-nums">{counts[status]}</b>
            </button>
          ))}
        </div>
      </PeriodBar>

      <div className="relative mx-6 min-h-0 flex-1 overflow-auto">
        {requests.fetching && !requests.loading && <div className="sticky top-0 z-30 h-0.5 animate-pulse bg-accent" />}
        <table className="min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {COLUMNS.map((key, i) => (
                <th
                  key={key}
                  className={`sticky top-0 z-20 h-9 border-b border-border bg-surface px-3 text-left text-xs font-normal whitespace-nowrap text-fg-muted ${
                    i === COLUMNS.length - 1 ? "text-right" : ""
                  }`}
                >
                  {t(`absences.col.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={requests.fetching && !requests.loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {requests.loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-fg-subtle">
                  {t("common.loading")}
                </td>
              </tr>
            ) : !slice.length ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-fg-subtle">
                  {t("absences.empty")}
                </td>
              </tr>
            ) : (
              slice.map((request) => {
                const route = routeFor({ type: "absence", departmentId: request.departmentId, absenceTypeId: request.typeId }, routes);
                const progress = route ? progressOf(route, decisions.get(request.id) ?? []) : null;
                const color = hexToChipColor(request.typeColor);
                const pending = request.status === "pending";
                return (
                  <tr key={request.id} onClick={() => onOpenEmployee(request.employeeId, ABSENCES_TAB)} className="group cursor-pointer">
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <Avatar name={request.employeeName} photo={request.employeePhoto || undefined} size="lg" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-fg">{request.employeeName}</span>
                          {request.departmentName && (
                            <span className="block truncate text-2xs text-fg-subtle">{request.departmentName}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className={`grid size-7 shrink-0 place-items-center rounded-md ${CHIP_STYLES[color]}`}>
                          <DynamicIcon name={request.typeIcon} size={15} fallback={<Icon as={PlaneIcon} size={15} />} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-fg">{request.typeTitle || "—"}</span>
                          {request.reason && (
                            <span className="block max-w-[260px] truncate text-2xs text-fg-subtle" title={request.reason}>
                              {request.reason}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className={`${td} tabular-nums`}>{period(request)}</td>
                    <td className={`${td} tabular-nums`}>
                      {request.days != null ? t("absences.days", { count: request.days }) : "—"}
                    </td>
                    <td className={td}>
                      <span className="flex flex-col items-start gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_STYLES[STATUS_CHIP[request.status] ?? "gray"]}`}>
                          {LABELED.includes(request.status) ? t(`absences.status.${request.status as Labeled}`) : request.status}
                        </span>
                        {route && progress && request.status !== "rejected" && (
                          <Chain name={route.name} done={progress.done} total={progress.total} />
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-right`} onClick={(event) => event.stopPropagation()}>
                      {pending ? (
                        <span className="inline-flex gap-1.5">
                          <ActionButton
                            tone="green"
                            disabled={decide.pending}
                            onClick={() => void decide.decide(request, route, progress, "approved")}
                          >
                            <Icon as={CheckIcon} size={14} />
                            {route && progress && progress.total > 1
                              ? t("absences.approveStep", { step: progress.done + 1, total: progress.total })
                              : t("timesheet.day.approve")}
                          </ActionButton>
                          <ActionButton
                            tone="red"
                            disabled={decide.pending}
                            onClick={() => void decide.decide(request, route, progress, "rejected")}
                          >
                            {t("timesheet.day.reject")}
                          </ActionButton>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenRow(request.id)}
                          aria-label={t("absences.openRecord")}
                          title={t("absences.openRecord")}
                          className="inline-grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-active hover:text-fg"
                        >
                          <Icon as={EyeIcon} size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pager page={current} pages={pages} total={shown.length} size={PAGE} onPage={setPage} />
    </div>
  );
}

/** Как в HRMS — по умолчанию месяц. */
const ABSENCE_SCALES = ["month", "week", "day"] as const;
const COLUMNS = ["employee", "type", "period", "days", "status", "actions"] as const;
const td = "h-12 border-b border-border px-3 whitespace-nowrap group-hover:bg-surface-hover";

/** Цепочка согласования — `ab-ch` прототипа: маршрут и пройденные шаги. */
export function Chain({ name, done, total }: { name: string; done: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-fg-muted">
      <Icon as={ShieldCheckIcon} size={12} />
      <span className="max-w-[200px] truncate">{name}</span>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-surface-soft">
        <i className="block h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

export function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: ChipColor;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40 ${CHIP_STYLES[tone]}`}
    >
      {children}
    </button>
  );
}
