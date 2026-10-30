import { PhoneIncomingIcon, PhoneOutgoingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermission } from "@/features/auth";
import { formatDate } from "@/shared/lib/date-value";
import { Icon } from "@/shared/ui/icon";
import { phoneToCall, useRecordCalls } from "../api/pbx";
import { Recording, duration } from "./CallLog";

/** Id вкладки «Звонки» в карточке. Не view: у неё нет своей связи. */
export const CALLS_TAB = "pbx-calls";

/**
 * Показывать ли вкладку: журнал можно читать и у записи есть номер.
 * По праву на журнал, а не «оператор ли»: историю звонков клиента
 * смотрит и руководитель, который сам не звонит. В проекте без
 * телефонии таблицы `pbx_calls` нет — нет и права.
 */
export function useHasRecordCalls(tableSlug: string, row: Record<string, unknown> | undefined): boolean {
  const can = useTablePermission("pbx_calls");
  return can.read && Boolean(row && phoneToCall(tableSlug, row));
}

/**
 * Вкладка «Звонки» карточки контакта, компании и сделки: звонки
 * с номером записи, новыми вперёд, с записью разговора в строке.
 * У сделки номер — её контакта (phoneToCall).
 */
export function RecordCalls({ tableSlug, row }: { tableSlug: string; row: Record<string, unknown> }) {
  const { t, i18n } = useTranslation();
  const { calls, isLoading } = useRecordCalls(phoneToCall(tableSlug, row));

  if (isLoading) return <p className="p-4 text-sm text-fg-muted">{t("common.loading")}</p>;
  if (!calls.length) return <p className="p-7 text-center text-sm text-fg-subtle">{t("pbx.logEmpty")}</p>;

  return (
    <ul className="flex flex-col">
      {calls.map((call) => (
        <li key={call.guid} className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Icon
            as={call.direction === "incoming" ? PhoneIncomingIcon : PhoneOutgoingIcon}
            size={16}
            className="text-fg-muted"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-fg">
              <span className="sr-only">
                {t(call.direction === "incoming" ? "pbx.direction.incoming" : "pbx.direction.outgoing")}:{" "}
              </span>
              {call.status ? t(`pbx.status.${call.status}`, { defaultValue: call.status }) : "—"}
              <span className="text-fg-muted tabular-nums"> · {duration(call.duration)}</span>
            </p>
            <p className="truncate text-xs text-fg-muted">
              {[formatDate(call.at, "datetime", i18n.language) ?? "", call.userName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Recording call={call} />
        </li>
      ))}
    </ul>
  );
}
