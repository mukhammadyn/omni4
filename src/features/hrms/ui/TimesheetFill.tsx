import { useState } from "react";
import { CalendarClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { ToolButton } from "@/shared/ui/tool-button";
import { TIMESHEETS, useTimesheetFill, useWriteTimesheets } from "../api/timesheet-docs";
import { rangeOf } from "../model/timesheet";
import type { PeriodKind } from "../model/timesheet-days";
import { monthName, weekName } from "../model/timesheet-docs";

/** Последние 12 месяцев, текущий первым: табель закрывают за прошедшее. */
const recentMonths = () => {
  const [year, month] = todayInput().split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return date.toISOString().slice(0, 7);
  });
};

/**
 * Кнопка «Заполнить из посещаемости» на списке «Табели» — шаблон
 * «Заполнить из системы учёта» прототипа: по табелю на отдел за месяц.
 */
export function TimesheetFill() {
  const { t } = useTranslation();
  const can = useTablePermissions()(TIMESHEETS);
  const [open, setOpen] = useState(false);
  if (!can.write) return null;
  return (
    <>
      <ToolButton icon={CalendarClockIcon} label={t("timesheets.fill")} onClick={() => setOpen(true)} />
      {open && <FillDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * «Сформировать табели» в «Посещаемость» → «Табель»: тот же диалог, но
 * с периодом, который сейчас на экране (месяц или неделя).
 */
export function TimesheetExport({ kind, anchor }: { kind: PeriodKind; anchor: string }) {
  const { t } = useTranslation();
  const can = useTablePermissions()(TIMESHEETS);
  const [open, setOpen] = useState(false);
  if (!can.write) return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon as={CalendarClockIcon} size={14} />
        {t("timesheets.export")}
      </Button>
      {open && <FillDialog initial={{ kind, anchor }} onClose={() => setOpen(false)} />}
    </>
  );
}

function FillDialog({ onClose, initial }: { onClose: () => void; initial?: { kind: PeriodKind; anchor: string } }) {
  const { t, i18n } = useTranslation();
  const start = initial?.anchor.slice(0, 7);
  const months = recentMonths();
  if (start && !months.includes(start)) months.unshift(start);
  const [kind, setKind] = useState<PeriodKind>(initial?.kind ?? "month");
  const [month, setMonth] = useState(start ?? months[0]!);
  // Неделя — пн–вс того дня, что выбран: ведомость HRMS тоже берёт неделю от даты.
  const [day, setDay] = useState(initial?.anchor ?? todayInput());
  const period = kind === "month" ? `${month}-01` : rangeOf("week", day).from;
  const { loading, plan, fill, from } = useTimesheetFill(period, kind);
  const write = useWriteTimesheets();
  const name = kind === "month" ? monthName(month, i18n.language) : weekName(from, i18n.language);
  const nothing = plan !== null && !plan.create.length && !plan.update.length;

  const run = () => {
    if (!plan) return;
    write.mutate(
      { plan, period: from, kind, fill, title: (dept) => `${t("timesheets.title")} · ${name} · ${dept}` },
      {
        onSuccess: ({ skipped }) => {
          const done = t("timesheets.filled", { count: plan.create.length + plan.update.length });
          // Дни, занятые другим табелем, пропущены — человек должен это знать (ADR-0018).
          toast.success(skipped ? `${done}. ${t("timesheets.skippedDays", { count: skipped })}` : done);
          onClose();
        },
      },
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">{t("timesheets.fill")}</h2>
          <p className="text-sm text-fg-muted">{t("timesheets.fillHint")}</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">{t("timesheets.periodKind")}</span>
          <Dropdown
            value={kind}
            items={(["month", "week"] as const).map((value) => ({ value, label: t(`timesheets.kind.${value}`) }))}
            ariaLabel={t("timesheets.periodKind")}
            onChange={(value) => setKind(value as PeriodKind)}
          />
        </label>
        {kind === "month" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg-muted">{t("timesheets.month")}</span>
            <Dropdown
              value={month}
              items={months.map((value) => ({ value, label: monthName(value, i18n.language) }))}
              ariaLabel={t("timesheets.month")}
              onChange={setMonth}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg-muted">{t("timesheets.week")}</span>
            <input
              type="date"
              value={day}
              onChange={(event) => event.target.value && setDay(event.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent"
            />
            <span className="text-xs text-fg-subtle">{name}</span>
          </label>
        )}
        <div className="rounded-lg bg-surface-soft px-3 py-2.5 text-sm">
          {loading || !plan ? (
            <span className="text-fg-subtle">{t("timesheets.counting")}</span>
          ) : (
            <ul className="flex flex-col gap-1">
              <li>{t("timesheets.planCreate", { count: plan.create.length })}</li>
              <li>{t("timesheets.planUpdate", { count: plan.update.length })}</li>
              {plan.locked.length > 0 && (
                <li className="text-fg-muted">{t("timesheets.planLocked", { count: plan.locked.length })}</li>
              )}
              {plan.unassigned > 0 && (
                <li className="text-fg-muted">{t("timesheets.planUnassigned", { count: plan.unassigned })}</li>
              )}
            </ul>
          )}
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={loading || !plan || nothing || write.isPending} onClick={run}>
            {t("timesheets.fillRun")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
