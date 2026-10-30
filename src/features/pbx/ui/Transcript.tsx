import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import type { PbxCall } from "../api/pbx";

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * «Текст» звонка: диалог оператора и клиента с таймкодами. Нет текста —
 * нет и кнопки: воркер распознаёт звонок не сразу, а в проекте вне его
 * списка (APP_IDS) — никогда.
 */
export function TranscriptButton({ call }: { call: PbxCall }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!call.transcript.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline"
      >
        <Icon as={FileTextIcon} size={12} />
        {t("pbx.transcript")}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={t("pbx.transcript")}
            className="flex max-h-[80dvh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-fg">
                {t("pbx.transcript")} · {call.phone}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer text-xs text-fg-muted hover:text-fg"
              >
                {t("action.close")}
              </button>
            </div>
            <ol className="flex flex-col gap-3 overflow-auto px-5 py-4">
              {call.transcript.map((line, index) => (
                <li
                  key={index}
                  className={`flex max-w-[85%] flex-col gap-0.5 ${line.speaker === "client" ? "self-end items-end" : ""}`}
                >
                  <span className="text-xs text-fg-muted">
                    {t(`pbx.speaker.${line.speaker}`)} · <span className="tabular-nums">{clock(line.from)}</span>
                  </span>
                  <span
                    className={`rounded-lg px-3 py-2 text-sm ${
                      line.speaker === "client" ? "bg-accent-subtle text-fg" : "bg-surface-hover text-fg"
                    }`}
                  >
                    {line.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Modal>
      )}
    </>
  );
}
