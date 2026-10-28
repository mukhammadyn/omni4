import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { useEditDay, useFillDays, useSheetOverlap, useSheetPay } from "../api/timesheet-days";
import { DAY_KINDS, isEdited, type DayKind, type DayRow, type Edit, type PeriodKind } from "../model/timesheet-days";

const box = "flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal";
const input =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent disabled:bg-surface-soft";

/**
 * «Заполнить» одного табеля: дни его отдела за его период в строки дня
 * (ADR-0018). Правки бухгалтера сохраняются, пропущенные дни — названы.
 */
export function FillDoc({
  guid,
  period,
  kind,
  departmentId,
  onClose,
}: {
  guid: string;
  period: string;
  kind: PeriodKind;
  departmentId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const data = useFillDays(period, kind);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { people } = await data.fill({ guid, departmentId });
      await data.refresh();
      toast.success(t("timesheets.refilledPeople", { count: people }));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <div className={box}>
        <h2 className="text-lg font-semibold">{t("timesheets.fill")}</h2>
        <p className="text-sm text-fg-muted">{t("timesheets.fillDocHint")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={data.loading || busy || !departmentId} onClick={run}>
            {data.loading ? t("timesheets.counting") : t("timesheets.fillRun")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** «Вернуть на доработку»: строки «Зарплаты» табеля снимутся — окно говорит, на какую сумму. */
export function ReturnDialog({ guid, busy, onReturn, onClose }: { guid: string; busy: boolean; onReturn: () => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const pay = useSheetPay(guid);
  return (
    <ConfirmDialog
      title={t("timesheets.returnTitle")}
      description={
        pay.loading
          ? t("common.loading")
          : pay.count
            ? t("timesheets.returnHint", { count: pay.count, total: pay.total.toLocaleString(i18n.language) })
            : t("timesheets.returnHintEmpty")
      }
      confirmLabel={t("timesheets.return")}
      busy={busy || pay.loading}
      onConfirm={onReturn}
      onClose={onClose}
    />
  );
}

/** «Утвердить»: режим расчёта и предупреждение о неподтверждённых днях. */
export function ApproveDialog({
  guid,
  days,
  busy,
  onApprove,
  onClose,
}: {
  guid: string;
  days: DayRow[];
  busy: boolean;
  onApprove: (mode: "daily" | "hourly") => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"daily" | "hourly">("daily");
  const unconfirmed = days.filter((day) => !day.outside_period && day.unconfirmed).length;
  const empty = !days.length;
  // Пересечение с другими табелями — не запрет, а предупреждение (ADR-0018, дополнение от 2026-10-28).
  const overlap = useSheetOverlap(guid, days);
  return (
    <Modal onClose={onClose}>
      <div className={box}>
        <h2 className="text-lg font-semibold">{t("timesheets.approve")}</h2>
        <p className="text-sm text-fg-muted">{t("timesheets.approveHint")}</p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">{t("timesheets.mode")}</span>
          <Dropdown
            value={mode}
            items={(["daily", "hourly"] as const).map((value) => ({ value, label: t(`timesheets.modes.${value}`) }))}
            ariaLabel={t("timesheets.mode")}
            onChange={(value) => setMode(value as "daily" | "hourly")}
          />
        </label>
        {empty && <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger">{t("timesheets.notFilled")}</p>}
        {unconfirmed > 0 && (
          <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning">{t("timesheets.unconfirmed", { count: unconfirmed })}</p>
        )}
        {overlap.paid > 0 ? (
          <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger">{t("timesheets.overlapPaid", { count: overlap.paid })}</p>
        ) : (
          overlap.total > 0 && (
            <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning">{t("timesheets.overlap", { count: overlap.total })}</p>
          )
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={busy || empty || overlap.loading} onClick={() => onApprove(mode)}>
            {t("timesheets.approve")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Правка дня бухгалтером: вид дня, опоздание, ранний уход, отработанное,
 * «нет ухода» и причина. Посещаемость не меняется; исходное видно рядом.
 */
export function DayEditor({
  guid,
  days,
  row,
  name,
  locale,
  onClose,
}: {
  guid: string;
  days: DayRow[];
  row: DayRow;
  name: string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useEditDay(guid, days);
  const [draft, setDraft] = useState<Edit>({
    day_kind: row.day_kind,
    late_minutes: row.late_minutes,
    early_minutes: row.early_minutes,
    worked_minutes: row.worked_minutes,
    no_checkout: row.no_checkout,
  });
  const [reason, setReason] = useState(row.reason);
  const kind = (value: DayKind) => t(`timesheets.dayKind.${value}`);
  const summary = (value: Edit) =>
    [kind(value.day_kind), `${t("timesheets.late")} ${value.late_minutes}`, `${t("timesheets.early")} ${value.early_minutes}`, `${t("timesheets.worked")} ${value.worked_minutes}`, value.no_checkout ? t("timesheets.noCheckout") : ""]
      .filter(Boolean)
      .join(" · ");
  const before = summary(row);
  const after = summary(draft);
  const minutes = (key: "late_minutes" | "early_minutes" | "worked_minutes", label: string, orig: number) => (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      {/* Подпись в одну строку, «было» — под полем: иначе поля разъезжаются по высоте. */}
      <span className="truncate text-fg-muted" title={label}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: Math.max(0, Number(event.target.value) || 0) })}
        className={`${input} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <span className="h-4 text-xs text-fg-subtle">{orig !== draft[key] ? t("timesheets.was", { value: orig }) : ""}</span>
    </label>
  );
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`));

  return (
    <Modal onClose={onClose}>
      <div className={box}>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold">{name}</h2>
          <span className="text-sm text-fg-muted">{date}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">
            {t("timesheets.dayKindLabel")}
            {row.orig_day_kind !== draft.day_kind && <span className="ml-1 text-xs text-fg-subtle">({t("timesheets.was", { value: kind(row.orig_day_kind) })})</span>}
          </span>
          <Dropdown
            value={draft.day_kind}
            items={DAY_KINDS.map((value) => ({ value, label: kind(value) }))}
            ariaLabel={t("timesheets.dayKindLabel")}
            onChange={(value) => setDraft({ ...draft, day_kind: value as DayKind })}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          {minutes("late_minutes", t("timesheets.lateMin"), row.orig_late_minutes)}
          {minutes("early_minutes", t("timesheets.earlyMin"), row.orig_early_minutes)}
          {minutes("worked_minutes", t("timesheets.workedMin"), row.orig_worked_minutes)}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.no_checkout} onChange={(event) => setDraft({ ...draft, no_checkout: event.target.checked })} />
          {t("timesheets.noCheckout")}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("timesheets.reason")}</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} className={input} />
        </label>
        <div className="flex items-center justify-between gap-2">
          {isEdited(row) ? (
            <Button
              variant="ghost"
              onClick={() =>
                setDraft({
                  day_kind: row.orig_day_kind,
                  late_minutes: row.orig_late_minutes,
                  early_minutes: row.orig_early_minutes,
                  worked_minutes: row.orig_worked_minutes,
                  no_checkout: row.orig_no_checkout,
                })
              }
            >
              {t("timesheets.resetDay")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button
              disabled={save.isPending || (before === after && reason === row.reason)}
              onClick={() => save.mutate({ row, label: `${name}, ${date}`, values: draft, reason: reason.trim(), before, after }, { onSuccess: onClose })}
            >
              {t("action.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
