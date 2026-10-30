import { useEffect, useState } from "react";
import { CalendarClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
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
 * «Заполнить из системы учёта» прототипа: один табель на компанию за период,
 * как ведомость HRMS.
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
  // Неделя — пн–вс выбранного дня, как ведомость HRMS; в поле — её понедельник.
  const [monday, setMonday] = useState(rangeOf("week", initial?.anchor ?? todayInput()).from);
  const period = kind === "month" ? `${month}-01` : monday;
  const { loading, plan, overlap, fill, from } = useTimesheetFill(period, kind);
  const write = useWriteTimesheets();
  const name = kind === "month" ? monthName(month, i18n.language) : weekName(from, i18n.language);
  // null — не трогали: название идёт за периодом (у готового табеля — его же).
  const [title, setTitle] = useState<string | null>(null);
  const auto = plan?.title || `${t("timesheets.title")} · ${name}`;
  // Нажали, пока посещаемость ещё едет: запись уйдёт, как только доедет.
  const [queued, setQueued] = useState(false);
  const nothing = plan !== null && !plan.create.length && !plan.update.length;
  // В сводке — только то, что есть: «Создать 0» и «Пересчитать 0» не показываются.
  const lines = plan
    ? [
        plan.create.length > 0 && <li key="create">{t("timesheets.planCreate", { count: plan.create.length })}</li>,
        plan.update.length > 0 && <li key="update">{t("timesheets.planUpdate", { count: plan.update.length })}</li>,
        overlap !== null && overlap > 0 && (
          <li key="overlap" className="text-warning">{t("timesheets.planOverlap", { count: overlap })}</li>
        ),
        plan.locked.length > 0 && (
          <li key="locked" className="text-fg-muted">{t("timesheets.planLocked", { count: plan.locked.length })}</li>
        ),
        loading && !nothing && <li key="counting" className="text-fg-subtle">{t("timesheets.counting")}</li>,
      ].filter(Boolean)
    : [];

  const run = () => {
    if (!plan) return;
    write.mutate(
      { plan, period: from, kind, fill, title: title?.trim() || auto },
      {
        onSuccess: () => {
          toast.success(t("timesheets.filled", { count: plan.create.length + plan.update.length }));
          onClose();
        },
      },
    );
  };

  useEffect(() => {
    if (!queued || loading || !plan) return;
    setQueued(false);
    run();
  }, [queued, loading, plan]);

  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <h2 className="text-lg font-semibold">{t("timesheets.fill")}</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">{t("timesheets.name")}</span>
          <Input value={title ?? auto} onChange={(event) => setTitle(event.target.value)} />
        </label>
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
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="flex justify-between text-fg-muted">
              {t("timesheets.week")}
              <span className="text-fg-subtle tabular-nums">{name}</span>
            </span>
            <DatePicker
              value={monday}
              locale={i18n.language}
              ariaLabel={t("timesheets.week")}
              onChange={(value) => value && setMonday(rangeOf("week", value).from)}
            />
          </div>
        )}
        {(!plan || lines.length > 0) && (
          <div className="rounded-lg bg-surface-soft px-3 py-2.5 text-sm">
            {!plan ? (
              <span className="text-fg-subtle">{t("timesheets.counting")}</span>
            ) : (
              <ul className="flex flex-col gap-1">{lines}</ul>
            )}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!plan || nothing || queued || write.isPending} onClick={() => (loading ? setQueued(true) : run())}>
            {t("timesheets.fillRun")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
