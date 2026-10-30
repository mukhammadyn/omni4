import { useState } from "react";
import { DeleteIcon, PhoneIcon, PhoneIncomingIcon, PhoneOutgoingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/shared/api/use-session";
import { formatDate } from "@/shared/lib/date-value";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { useCallLog, useCallerName } from "../api/pbx";
import { useSoftphone, type SoftphoneStatus } from "./Softphone";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/** Цвет точки статуса — токены темы. */
const DOT: Record<SoftphoneStatus, string> = {
  off: "bg-border-strong",
  fallback: "bg-accent",
  connecting: "bg-border-strong animate-pulse",
  online: "bg-success",
  offline: "bg-danger",
};

/** Номер для набора: цифры, «*», «#» и ведущий «+». */
const clean = (value: string) => value.replace(/[^\d*#+]/g, "").replace(/(?!^)\+/g, "");

/**
 * Софтфон в верхней полосе — как `SoftphonePanel` new-crm: значок трубки
 * с точкой статуса, по щелчку — панель: статус и добавочный,
 * «Не беспокоить», набор номера с клавиатурой и свои последние звонки
 * с повтором в один щелчок. Сам разговор — в карточке звонка
 * (SoftphoneProvider), панель для него не нужна.
 *
 * Не оператор — кнопки нет.
 */
export function SoftphoneButton() {
  const { t } = useTranslation();
  const phone = useSoftphone();
  if (phone.status === "off") return null;

  const label = t(`pbx.state.${phone.status}`);

  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${t("pbx.softphone")}: ${label}`}
          title={`${t("pbx.softphone")}: ${label}`}
          className={`relative grid size-7 place-items-center rounded-[5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ${
            open ? "bg-surface-hover text-fg" : ""
          }`}
        >
          <Icon as={PhoneIcon} />
          <span
            aria-hidden
            className={`absolute right-1 bottom-1 size-1.5 rounded-full ring-2 ring-surface ${
              phone.dnd && phone.status === "online" ? "bg-danger" : DOT[phone.status]
            }`}
          />
        </button>
      )}
    >
      {(close) => <Panel onCall={close} />}
    </Popover>
  );
}

function Panel({ onCall }: { onCall: () => void }) {
  const { t, i18n } = useTranslation();
  const phone = useSoftphone();
  const me = useSession().getUserId();
  const [number, setNumber] = useState("");
  const { calls } = useCallLog(1, "", { direction: "", status: "", userId: me });

  const dial = (target: string) => {
    const value = clean(target);
    if (value.replace(/\D/g, "").length < 2 || phone.busy) return;
    phone.call(value);
    setNumber("");
    onCall();
  };

  return (
    <div className="flex w-72 flex-col gap-3 p-2">
      <div className="flex items-start gap-2">
        <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[phone.status]}`} />
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-medium text-fg">
            {t(`pbx.state.${phone.status}`)}
          </p>
          <p className="text-xs text-fg-muted">
            {phone.problem ||
              (phone.extension ? t("pbx.extensionLabel", { extension: phone.extension }) : t(`pbx.stateHint.${phone.status}`))}
          </p>
        </div>
      </div>

      {phone.status !== "fallback" && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <Checkbox checked={phone.dnd} onChange={(event) => phone.setDnd(event.target.checked)} />
          {t("pbx.dnd")}
          {phone.dnd && <span className="text-xs text-fg-muted">{t("pbx.dndHint")}</span>}
        </label>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          dial(number);
        }}
      >
        <div className="flex items-center gap-1 rounded-lg border border-border px-2 focus-within:border-accent">
          <input
            autoFocus
            inputMode="tel"
            value={number}
            onChange={(event) => setNumber(clean(event.target.value))}
            placeholder={t("pbx.dialPlaceholder")}
            aria-label={t("pbx.dialPlaceholder")}
            className="h-9 min-w-0 flex-1 bg-transparent text-base text-fg tabular-nums outline-none placeholder:text-fg-subtle"
          />
          {number && (
            <button
              type="button"
              aria-label={t("pbx.erase")}
              onClick={() => setNumber(number.slice(0, -1))}
              className="grid size-7 cursor-pointer place-items-center rounded text-fg-muted hover:bg-surface-hover"
            >
              <Icon as={DeleteIcon} size={14} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setNumber(clean(number + key))}
              className="h-9 cursor-pointer rounded-lg border border-border text-sm font-medium text-fg tabular-nums hover:bg-surface-hover"
            >
              {key}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={phone.busy || number.replace(/\D/g, "").length < 2}
          className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-success text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          <Icon as={PhoneIcon} size={14} />
          {t("pbx.call")}
        </button>
      </form>

      {calls.length > 0 && (
        <div className="flex flex-col">
          <p className="px-1 pb-1 text-xs font-medium text-fg-muted">{t("pbx.recent")}</p>
          {calls.slice(0, 6).map((call) => (
            <button
              key={call.guid}
              type="button"
              disabled={phone.busy}
              onClick={() => dial(call.phone)}
              title={t("pbx.callAgain")}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-surface-hover disabled:cursor-default"
            >
              <Icon
                as={call.direction === "incoming" ? PhoneIncomingIcon : PhoneOutgoingIcon}
                size={14}
                className="text-fg-muted"
              />
              <Caller phone={call.phone} />
              <span className="shrink-0 text-xs text-fg-muted">{formatDate(call.at, "datetime", i18n.language)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Имя контакта или компании по номеру, иначе сам номер (useCallerName — с кэшем). */
function Caller({ phone }: { phone: string }) {
  const name = useCallerName(phone);
  return <span className="min-w-0 flex-1 truncate text-sm text-fg tabular-nums">{name || phone}</span>;
}
