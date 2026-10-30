import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { todayInput } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, hexToChipColor } from "@/shared/ui/chip";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { useDismissalReasons } from "../api/employee";

/** Увольнение: дата, тип и причина — все три обязательны. */
export function DismissDialog({
  name,
  language,
  onConfirm,
  onClose,
}: {
  name: string;
  language: string;
  onConfirm: (date: string, reasonId: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { types, reasons } = useDismissalReasons(language);
  const [date, setDate] = useState(todayInput);
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");

  const dotted = (items: { value: string; label: string; color: string | null }[]) =>
    items.map(({ color, ...item }) => ({
      ...item,
      ...(color ? { icon: <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[hexToChipColor(color)]}`} /> } : {}),
    }));

  const field = (label: string, control: ReactNode) => (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      {control}
    </label>
  );

  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">{t("employee.action.dismiss")}</h2>
          <p className="text-sm text-fg-muted">{t("employee.dismissHint", { name })}</p>
        </div>

        {field(
          t("employee.dismissDate"),
          <DatePicker value={date} locale={i18n.language} ariaLabel={t("employee.dismissDate")} onChange={setDate} />,
        )}
        {field(
          t("employee.dismissType"),
          <Dropdown
            value={type}
            items={dotted(types)}
            placeholder={t("employee.dismissTypePick")}
            ariaLabel={t("employee.dismissType")}
            onChange={(next) => {
              setType(next);
              setReason("");
            }}
          />,
        )}
        {field(
          t("employee.dismissReason"),
          <Dropdown
            value={reason}
            items={dotted(reasons.filter((item) => item.type === type))}
            placeholder={t("employee.dismissReasonPick")}
            /* Тип живёт только на причине (у сотрудника — `hr_dismissal_reasons_id`),
               поэтому без причины уволить нельзя: её надо завести в настройках. */
            emptyText={t("employee.dismissNoReasons")}
            ariaLabel={t("employee.dismissReason")}
            disabled={!type}
            onChange={setReason}
          />,
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" disabled={!date || !reason} onClick={() => onConfirm(date, reason)}>
            {t("employee.action.dismiss")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
