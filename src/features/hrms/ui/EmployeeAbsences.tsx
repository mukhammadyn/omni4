import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarOffIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon, InboxIcon, PlaneIcon, WalletCardsIcon } from "lucide-react";
import { todayInput } from "@/shared/lib/date-value";
import { CHIP_HEX, CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { useAbsenceTypes, useDecideRequest, useDecisions, useEmployeeRequests, useRoutes, type AbsenceRequest } from "../api/absences";
import { balanceOf } from "../model/absence-balance";
import { progressOf, routeFor } from "../model/approval";
import { ActionButton, Chain } from "./Absences";

type Sub = "balance" | "requests" | "history";
const STATUS_CHIP: Record<string, ChipColor> = { pending: "yellow", approved: "green", rejected: "red", cancelled: "gray" };
const LABELED = ["pending", "approved", "rejected", "cancelled"] as const;

/**
 * Вкладка «Отсутствия» страницы сотрудника — `absTab` прототипа
 * (employee.html): «Баланс» — лимит каждого типа на его период,
 * использовано и ждёт (model/absence-balance); «Запросы» — заявки
 * со статусом и цепочкой согласования, у ждущих — решение, как на экране
 * «Отсутствия»; «История» — одобренные за год, по типам.
 */
export function EmployeeAbsences({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Sub>("balance");
  const requests = useEmployeeRequests(employeeId);
  const pending = requests.rows.filter((request) => request.status === "pending").length;

  return (
    <section className="rounded-[10px] border border-border bg-surface">
      <div className="flex items-center gap-2 px-4 pt-3">
        <Icon as={CalendarOffIcon} size={16} className="text-fg-muted" />
        <div>
          <h3 className="text-[15px] font-semibold">{t("employeeAbsences.title")}</h3>
          <p className="text-xs text-fg-subtle">{t("employeeAbsences.subtitle")}</p>
        </div>
      </div>

      {/* `.abs-sub` — подвкладки. */}
      <div className="mt-2 flex gap-1 border-b border-border px-3">
        {(
          [
            ["balance", WalletCardsIcon, t("employeeAbsences.sub.balance"), null],
            ["requests", InboxIcon, t("employeeAbsences.sub.requests"), requests.rows.length],
            ["history", HistoryIcon, t("employeeAbsences.sub.history"), null],
          ] as const
        ).map(([key, icon, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-sm transition-colors ${
              sub === key ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            <Icon as={icon} size={14} />
            {label}
            {count != null && <span className="text-fg-subtle">{count}</span>}
            {key === "requests" && pending > 0 && (
              <span className={`rounded-full px-1.5 text-2xs font-semibold ${CHIP_STYLES.yellow}`}>{pending}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {requests.loading ? (
          <p className="py-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
        ) : sub === "balance" ? (
          <BalanceList requests={requests.rows} />
        ) : sub === "requests" ? (
          <RequestList requests={requests.rows} />
        ) : (
          <History requests={requests.rows} />
        )}
      </div>
    </section>
  );
}

function TypeIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${CHIP_STYLES[hexToChipColor(color)]}`}>
      <DynamicIcon name={icon} size={16} fallback={<Icon as={PlaneIcon} size={16} />} />
    </span>
  );
}

/** «Баланс» — карточка на тип: осталось из лимита, использовано, ждёт. */
function BalanceList({ requests }: { requests: AbsenceRequest[] }) {
  const { t } = useTranslation();
  const types = useAbsenceTypes();
  const balances = useMemo(
    () =>
      balanceOf(
        types,
        requests.map((request) => ({ typeId: request.typeId, status: request.status, from: request.from, days: request.days ?? 0 })),
        todayInput(),
      ),
    [types, requests],
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {balances.map(({ type, used, pending, left }) => (
        <div key={type.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <TypeIcon icon={type.icon} color={type.color} />
            <div className="min-w-0">
              <b className="block truncate text-sm font-medium">{type.title}</b>
              <small className="text-xs text-fg-subtle">
                {type.limit != null ? t(`employeeAbsences.per.${type.period as "year"}`, { count: type.limit }) : t("employeeAbsences.unlimited")}
              </small>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <b className="text-2xl font-semibold tabular-nums">{left ?? used}</b>
            <span className="text-xs text-fg-muted">{left != null ? t("employeeAbsences.left") : t("employeeAbsences.usedLabel")}</span>
          </div>
          {type.limit != null && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-soft">
              <i
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, (used / type.limit) * 100)}%`, background: CHIP_HEX[hexToChipColor(type.color)] }}
              />
            </span>
          )}
          <div className="mt-2 flex gap-3 text-xs text-fg-muted">
            <span>{t("employeeAbsences.used", { count: used })}</span>
            {pending > 0 && <span className="text-warning">{t("employeeAbsences.pending", { count: pending })}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** «Запросы» — `.rq` прототипа: тип, статус, период, причина, цепочка; у ждущих — решение. */
function RequestList({ requests }: { requests: AbsenceRequest[] }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const routes = useRoutes();
  const decide = useDecideRequest();
  const decisions = useDecisions(useMemo(() => requests.map((request) => request.id), [requests]));
  const shown = requests.filter((request) => !status || request.status === status);

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-fg-muted">{t("employeeAbsences.count", { count: shown.length })}</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="ml-auto h-7 rounded-md border border-border bg-surface px-2 text-[13px]"
        >
          <option value="">{t("employeeAbsences.allStatuses")}</option>
          {LABELED.map((key) => (
            <option key={key} value={key}>
              {t(`absences.status.${key}`)}
            </option>
          ))}
        </select>
      </div>
      {!shown.length ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("employeeAbsences.noRequests")}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {shown.map((request) => {
            const route = routeFor({ type: "absence", departmentId: request.departmentId, absenceTypeId: request.typeId }, routes);
            const progress = route ? progressOf(route, decisions.get(request.id) ?? []) : null;
            return (
              <div key={request.id} className="flex items-start gap-3 p-3">
                <TypeIcon icon={request.typeIcon} color={request.typeColor} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm font-medium">{request.typeTitle || "—"}</b>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_STYLES[STATUS_CHIP[request.status] ?? "gray"]}`}>
                      {(LABELED as readonly string[]).includes(request.status)
                        ? t(`absences.status.${request.status as (typeof LABELED)[number]}`)
                        : request.status}
                    </span>
                  </div>
                  <div className="text-xs text-fg-muted tabular-nums">
                    {dmy(request.from)}
                    {request.to !== request.from && ` – ${dmy(request.to)}`} · {t("absences.days", { count: request.days ?? 0 })}
                  </div>
                  {request.reason && <p className="mt-1 text-xs text-fg-muted">{request.reason}</p>}
                  {route && progress && request.status !== "rejected" && (
                    <div className="mt-1">
                      <Chain name={route.name} done={progress.done} total={progress.total} />
                    </div>
                  )}
                </div>
                {request.status === "pending" && (
                  <span className="flex shrink-0 gap-1.5">
                    <ActionButton tone="green" disabled={decide.pending} onClick={() => void decide.decide(request, route, progress, "approved")}>
                      <Icon as={CheckIcon} size={14} />
                      {route && progress && progress.total > 1
                        ? t("absences.approveStep", { step: progress.done + 1, total: progress.total })
                        : t("timesheet.day.approve")}
                    </ActionButton>
                    <ActionButton tone="red" disabled={decide.pending} onClick={() => void decide.decide(request, route, progress, "rejected")}>
                      {t("timesheet.day.reject")}
                    </ActionButton>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** «История» — одобренные за год: сколько дней всего, полоса по типам, список. */
function History({ requests }: { requests: AbsenceRequest[] }) {
  const { t } = useTranslation();
  const [year, setYear] = useState(() => Number(todayInput().slice(0, 4)));
  const list = requests.filter((request) => request.status === "approved" && request.from.startsWith(String(year)));
  const total = list.reduce((sum, request) => sum + (request.days ?? 0), 0);
  const byType = [...list.reduce((map, request) => {
    const entry = map.get(request.typeId) ?? { title: request.typeTitle, color: request.typeColor, days: 0 };
    entry.days += request.days ?? 0;
    return map.set(request.typeId, entry);
  }, new Map<string, { title: string; color: string; days: number }>()).values()];

  return (
    <>
      <div className="mb-3 flex items-center gap-1 text-sm">
        <button type="button" onClick={() => setYear(year - 1)} aria-label={t("timesheet.back")} className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover">
          <Icon as={ChevronLeftIcon} size={16} />
        </button>
        <b className="w-12 text-center tabular-nums">{year}</b>
        <button type="button" onClick={() => setYear(year + 1)} aria-label={t("timesheet.forward")} className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover">
          <Icon as={ChevronRightIcon} size={16} />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-6 rounded-lg border border-border p-3">
        <div>
          <b className="block text-xl font-semibold tabular-nums">{t("absences.days", { count: total })}</b>
          <small className="text-xs text-fg-muted">{t("employeeAbsences.totalUsed")}</small>
        </div>
        <div>
          <b className="block text-xl font-semibold tabular-nums">{list.length}</b>
          <small className="text-xs text-fg-muted">{t("employeeAbsences.approvedCount")}</small>
        </div>
        {total > 0 && (
          <div className="min-w-48 flex-1">
            <div className="flex h-2 overflow-hidden rounded-full">
              {byType.map((entry) => (
                <span key={entry.title} title={`${entry.title}: ${entry.days}`} style={{ flex: entry.days, background: CHIP_HEX[hexToChipColor(entry.color)] }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-fg-muted">
              {byType.map((entry) => (
                <span key={entry.title} className="inline-flex items-center gap-1">
                  <i className="size-2 rounded-full" style={{ background: CHIP_HEX[hexToChipColor(entry.color)] }} />
                  {entry.title} · {entry.days}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {!list.length ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("employeeAbsences.noHistory", { year })}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {list.map((request) => (
            <div key={request.id} className="flex items-center gap-3 p-3">
              <TypeIcon icon={request.typeIcon} color={request.typeColor} />
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-medium">{request.typeTitle}</b>
                <small className="text-xs text-fg-muted tabular-nums">
                  {dmy(request.from)}
                  {request.to !== request.from && ` – ${dmy(request.to)}`}
                  {request.reason && ` · ${request.reason}`}
                </small>
              </div>
              <b className="text-sm tabular-nums">{t("absences.days", { count: request.days ?? 0 })}</b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const dmy = (key: string) => key.split("-").reverse().join(".");
