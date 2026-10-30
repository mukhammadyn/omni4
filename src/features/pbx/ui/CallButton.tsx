import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { reportError } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import {
  fetchWebRtcCredentials,
  logWebRtcCall,
  phoneToCall,
  usePbxCall,
  usePbxEnabled,
} from "../api/pbx";
import { createVertoTransport } from "../lib/verto/VertoTransport";
import type { VoipCallSnapshot, VoipTransport } from "../lib/verto/types";

/**
 * «Позвонить» в карточке контакта, компании или сделки.
 *
 * Звонок идёт из браузера (Verto, onlinePBX): микрофон и динамики
 * компьютера, телефон оператора не звонит. Соединение открывается на
 * звонок и закрывается после него — между звонками оператор не «в сети»,
 * и входящих сюда не приходит: их принимает телефон, как раньше.
 *
 * Не вышло войти (нет добавочного, нет WebRTC у аккаунта) — звонок
 * старым путём: onlinePBX набирает сначала номер оператора из настроек.
 */
export function CallButton({ tableSlug, row }: { tableSlug: string; row: Record<string, unknown> }) {
  const { t } = useTranslation();
  const enabled = usePbxEnabled();
  const fallback = usePbxCall();
  const phone = phoneToCall(tableSlug, row);

  const [call, setCall] = useState<VoipCallSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const transport = useRef<VoipTransport | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  /* Карточку закрыли посреди разговора — кладём трубку, а не бросаем. */
  useEffect(
    () => () => {
      void transport.current?.disconnect();
    },
    [],
  );

  if (!enabled || !phone) return null;

  const start = async () => {
    setStarting(true);
    let credentials;
    try {
      credentials = await fetchWebRtcCredentials();
    } catch {
      setStarting(false);
      fallback.mutate(phone);
      return;
    }

    const voip = createVertoTransport({
      websocketUrl: credentials.host,
      login: credentials.login,
      password: credentials.password,
      extension: credentials.extension,
      callbacks: {
        onConnectionState: () => {},
        onCallState: (next) => {
          setCall(next);
          if (next.state !== "ended") return;
          const duration = next.establishedAt ? (Date.now() - next.establishedAt) / 1000 : 0;
          void logWebRtcCall({ phone, duration, status: next.outcome }).catch(() => {});
          void voip.disconnect();
          transport.current = null;
          window.setTimeout(() => setCall((current) => (current?.id === next.id ? null : current)), 2500);
        },
        onLocalStream: () => {},
        onRemoteStream: (_id, stream) => {
          if (audio.current) audio.current.srcObject = stream;
        },
      },
    });
    transport.current = voip;

    try {
      await voip.connect();
      setCall(await voip.call(phone));
    } catch (error) {
      void voip.disconnect();
      transport.current = null;
      reportError(error, "pbx.callFailed");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" disabled={starting || Boolean(call) || fallback.isPending} onClick={() => void start()} title={phone}>
        <Icon as={PhoneIcon} size={14} />
        {t("pbx.call")}
      </Button>

      {call && (
        <CallPanel
          call={call}
          onHangup={() => void transport.current?.hangup(call.id)}
          onMute={(muted) => transport.current?.setMuted(call.id, muted)}
        />
      )}
      {/* Голос собеседника. Вне панели: панель исчезает после звонка,
          а элемент должен жить, пока жив поток. */}
      <audio ref={audio} autoPlay hidden />
    </>
  );
}

function CallPanel({
  call,
  onHangup,
  onMute,
}: {
  call: VoipCallSnapshot;
  onHangup: () => void;
  onMute: (muted: boolean) => void;
}) {
  const { t } = useTranslation();
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (call.state !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call.state]);

  const seconds = call.establishedAt ? Math.max(0, Math.floor((now - call.establishedAt) / 1000)) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const label =
    call.state === "active"
      ? clock
      : call.state === "ended"
        ? t(`pbx.outcome.${call.outcome}`)
        : t("pbx.dialing");

  return createPortal(
    <div
      role="status"
      className="fixed right-4 bottom-4 z-60 flex w-72 items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-modal"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent">
        <Icon as={PhoneIcon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{call.number}</p>
        <p className="text-xs text-fg-muted tabular-nums">{label}</p>
      </div>
      {call.state !== "ended" && (
        <>
          <button
            type="button"
            aria-label={t(muted ? "pbx.unmute" : "pbx.mute")}
            title={t(muted ? "pbx.unmute" : "pbx.mute")}
            disabled={call.state !== "active"}
            onClick={() => {
              onMute(!muted);
              setMuted(!muted);
            }}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-fg-muted hover:bg-surface-hover disabled:opacity-40"
          >
            <Icon as={muted ? MicOffIcon : MicIcon} size={16} />
          </button>
          <button
            type="button"
            aria-label={t("pbx.hangup")}
            title={t("pbx.hangup")}
            onClick={onHangup}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-danger-subtle text-danger hover:bg-danger hover:text-accent-fg"
          >
            <Icon as={PhoneOffIcon} size={16} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
