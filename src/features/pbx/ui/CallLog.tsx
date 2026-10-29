import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icon";
import { useCallLog, useCallRecording, type PbxCall } from "../api/pbx";

/**
 * Журнал звонков onlinePBX — строки `pbx_calls`, новыми вперёд. Пишет
 * их функция: звонок по клику и звонок из браузера (CallButton).
 *
 * Свой экран, а не таблица: сотрудник в строке — guid без связи
 * (функция ищет оператора по полю `users_id`), и обычная таблица
 * показала бы uuid. Здесь он подписан именем из `core_users`.
 */
export function CallLog({ search }: { search: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const { calls, count, pageSize, isLoading } = useCallLog(page, search);
  const pages = Math.max(1, Math.ceil(count / pageSize));

  if (isLoading) return <p className="p-4 text-sm text-fg-muted">{t("common.loading")}</p>;
  if (!calls.length) return <p className="p-7 text-center text-sm text-fg-subtle">{t("pbx.logEmpty")}</p>;

  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs text-fg-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">{t("pbx.col.at")}</th>
              <th className="px-3 py-2 font-medium">{t("pbx.col.user")}</th>
              <th className="px-3 py-2 font-medium">{t("pbx.col.phone")}</th>
              <th className="px-3 py-2 font-medium">{t("pbx.col.status")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("pbx.col.duration")}</th>
              <th className="px-3 py-2 font-medium">{t("pbx.col.recording")}</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.guid} className="border-b border-border hover:bg-surface-hover">
                <td className="px-3 py-2 whitespace-nowrap text-fg-muted">
                  {call.at ? time.format(new Date(call.at)) : "—"}
                </td>
                <td className="px-3 py-2">{call.userName || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{call.phone || "—"}</td>
                <td className="px-3 py-2 text-fg-muted">
                  {call.status ? t(`pbx.status.${call.status}`, { defaultValue: call.status }) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{duration(call.duration)}</td>
                <td className="px-3 py-2">
                  <Recording call={call} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-t border-border px-3 text-xs text-fg-muted">
          <button
            type="button"
            aria-label={t("pbx.prev")}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="grid size-7 cursor-pointer place-items-center rounded hover:bg-surface-hover disabled:opacity-40"
          >
            <Icon as={ChevronLeftIcon} size={14} />
          </button>
          {page} / {pages}
          <button
            type="button"
            aria-label={t("pbx.next")}
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="grid size-7 cursor-pointer place-items-center rounded hover:bg-surface-hover disabled:opacity-40"
          >
            <Icon as={ChevronRightIcon} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function duration(seconds: number) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/**
 * Запись: есть адрес — плеер; нет, но звонок известен onlinePBX —
 * кнопка, которая просит функцию её достать. Пока onlinePBX запись
 * не отдал, функция отвечает `pending`.
 */
function Recording({ call }: { call: PbxCall }) {
  const { t } = useTranslation();
  const fetch = useCallRecording();
  const [url, setUrl] = useState(call.recording);

  if (url) return <audio controls preload="none" src={url} className="h-8 w-56" />;
  if (!call.callUuid) return <span className="text-fg-subtle">—</span>;

  return (
    <button
      type="button"
      disabled={fetch.isPending}
      onClick={() =>
        fetch.mutate(call.callUuid, {
          onSuccess: (dto) => {
            if (dto.recording_url) setUrl(dto.recording_url);
            else toast.warning(t("pbx.recordingPending"));
          },
        })
      }
      className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
    >
      <Icon as={PlayIcon} size={12} />
      {t("pbx.getRecording")}
    </button>
  );
}
