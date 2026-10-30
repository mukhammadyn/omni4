import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeftIcon,
  GripIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  PhoneOffIcon,
  PlayIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";
import i18n from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import {
  fetchWebRtcCredentials,
  callsWithoutRecording,
  fetchRecording,
  logCall,
  useCallerName,
  usePbxCall,
  usePbxMode,
} from "../api/pbx";
import { createVertoTransport } from "../lib/verto/VertoTransport";
import type { VoipCallSnapshot, VoipTransport } from "../lib/verto/types";

/**
 * Состояние телефона для панели: `off` — телефонии у человека нет,
 * `fallback` — оператор без WebRTC (звонит onlinePBX через его трубку),
 * дальше — связь Verto.
 */
export type SoftphoneStatus = "off" | "fallback" | "connecting" | "online" | "offline";

type Softphone = {
  /** Позвонить. Без входа в Verto — старым путём, через телефон оператора. */
  call: (phone: string) => void;
  busy: boolean;
  status: SoftphoneStatus;
  /** Почему нет связи — текст транспорта; пусто, если всё хорошо. */
  problem: string;
  extension: string;
  /** «Не беспокоить»: входящие отклоняются сразу, без звонка. */
  dnd: boolean;
  setDnd: (on: boolean) => void;
};

const DND_KEY = "omni4.softphone.dnd";

/* «Не беспокоить» — удобство этого браузера, не настройка оператора:
   хранилище может быть недоступно, тогда флаг живёт до перезагрузки. */
const readDnd = () => {
  try {
    return localStorage.getItem(DND_KEY) === "1";
  } catch {
    return false;
  }
};

const SoftphoneContext = createContext<Softphone | null>(null);

export function useSoftphone(): Softphone {
  const value = useContext(SoftphoneContext);
  if (!value) throw new Error("useSoftphone outside SoftphoneProvider");
  return value;
}

/** Первый повтор входа через 5 с, дальше вдвое дольше, не реже раза в минуту. */
const retryDelay = (attempt: number) => Math.min(60_000, 5_000 * 2 ** attempt);

/**
 * Запись onlinePBX готовит не сразу — обычно за минуту-две после
 * разговора. Спрашиваем раз в 15 с, до 5 минут (как new-crm).
 */
const RECORDING_DELAY = 15_000;
const RECORDING_ATTEMPTS = 20;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Телефон оператора в браузере — один на вкладку, на всё время работы.
 *
 * Пока он в сети, onlinePBX шлёт сюда и входящие: звонок на добавочный
 * звонит в CRM, а не только на трубку. Вход — по добавочному из
 * `pbx_operators`; нет добавочного — нет и телефона, кнопка «Позвонить»
 * уходит старым путём (`pbx_make_call`). Обрыв связи — повторный вход
 * с паузой: пароль Verto функция каждый раз берёт у onlinePBX заново.
 *
 * ponytail: каждая открытая вкладка входит отдельно и звонит вся разом;
 * одна вкладка-телефон через BroadcastChannel — когда это начнёт мешать.
 */
export function SoftphoneProvider({ children }: { children: ReactNode }) {
  /* Телефон в браузере — только у оператора с WebRTC; остальным
     «Позвонить» уходит старым путём или кнопки нет вовсе (usePbxMode). */
  const { mode, problem: modeProblem } = usePbxMode();
  const enabled = mode === "verto";
  const [link, setLink] = useState<{ state: "connecting" | "online" | "offline"; problem: string; extension: string }>({
    state: "connecting",
    problem: "",
    extension: "",
  });
  const [dnd, setDndState] = useState(readDnd);
  /* Колбэки транспорта живут дольше отрисовки — флаг читают через ref. */
  const dndRef = useRef(dnd);
  const setDnd = useCallback((on: boolean) => {
    dndRef.current = on;
    setDndState(on);
    try {
      localStorage.setItem(DND_KEY, on ? "1" : "0");
    } catch {
      // Нет хранилища — флаг до перезагрузки.
    }
  }, []);
  const fallback = usePbxCall();
  const [calls, setCalls] = useState<VoipCallSnapshot[]>([]);
  const transport = useRef<VoipTransport | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    /* Журнал на экране — перечитать: в строке появилась запись. */
    const refreshLog = () =>
      queryClient.invalidateQueries({ queryKey: [...keys.settings.integration(envId, "pbx"), "calls"] });

    const awaitRecording = async (callId: string) => {
      for (let i = 0; i < RECORDING_ATTEMPTS && !stopped; i++) {
        await sleep(RECORDING_DELAY);
        if (stopped) return;
        try {
          if (await fetchRecording(callId)) return void refreshLog();
        } catch {
          // onlinePBX недоступен — следующая попытка; не дождались — дотянет recover().
        }
      }
    };

    /* Записи, которых не дождались до перезагрузки, — по разу. */
    const recover = async () => {
      const pending = await callsWithoutRecording().catch(() => []);
      for (const callId of pending) {
        if (stopped) return;
        if (await fetchRecording(callId).catch(() => "")) void refreshLog();
      }
    };
    void recover();

    let attempt = 0;
    let timer: number | undefined;
    let voip: VoipTransport | null = null;

    const retry = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        /* Отвязываем сразу: пока берём новый пароль, call() не должен
           оживить старое соединение — иначе входов станет два. */
        transport.current = null;
        void voip?.disconnect();
        void start();
      }, retryDelay(attempt++));
    };

    const start = async () => {
      let credentials;
      try {
        credentials = await fetchWebRtcCredentials();
      } catch {
        return; // Не оператор или нет WebRTC у аккаунта — звонки старым путём.
      }
      if (stopped) return;

      const current: VoipTransport = (voip = createVertoTransport({
        websocketUrl: credentials.host,
        login: credentials.login,
        password: credentials.password,
        extension: credentials.extension,
        callbacks: {
          onConnectionState: (state, error, retryable = true) => {
            setLink((was) => ({
              ...was,
              state: state === "online" ? "online" : state === "connecting" ? "connecting" : "offline",
              problem: state === "online" || state === "connecting" ? "" : (error ?? ""),
            }));
            /* В сети — повтор не нужен: его таймер оборвал бы разговор,
               начатый после переподключения из call(). */
            if (state === "online") {
              attempt = 0;
              window.clearTimeout(timer);
            }
            if ((state === "offline" || state === "error") && retryable && !stopped) retry();
          },
          onCallState: (next) => {
            /* «Не беспокоить»: входящий кладём сразу, на экран он не попадает
               и в журнал не пишется — его возьмёт трубка или другой оператор. */
            if (next.state === "incoming" && dndRef.current) {
              void current.reject(next.id).catch(() => {});
              return;
            }
            if (next.state === "ended" && next.direction === "incoming" && !next.establishedAt && dndRef.current) return;
            setCalls((list) => [...list.filter((c) => c.id !== next.id), next].sort((a, b) => a.startedAt - b.startedAt));
            if (next.state !== "ended") return;

            /* Входящий пишем, только если его приняли здесь. Непринятый
               не обязательно пропущен: его могли взять на трубке или в
               другой вкладке, и каждая вкладка записала бы свой «пропущенный».
               Пропущенные — из истории onlinePBX (docs/PBX-PLAN.md, шаг 11). */
            if (next.direction === "outgoing" || next.establishedAt) {
              void logCall({
                callId: next.id,
                phone: next.number,
                direction: next.direction,
                status: next.outcome,
                duration: next.establishedAt ? (Date.now() - next.establishedAt) / 1000 : 0,
              })
                .then(() => {
                  void refreshLog();
                  /* Запись ищется по строке журнала — только после неё. */
                  if (next.establishedAt && Date.now() - next.establishedAt >= 5_000) return awaitRecording(next.id);
                })
                .catch(() => {});
            }
            window.setTimeout(() => setCalls((list) => list.filter((c) => c.id !== next.id)), 2500);
          },
          onLocalStream: () => {},
          onRemoteStream: (_id, stream) => {
            if (audio.current) audio.current.srcObject = stream;
          },
        },
      }));
      transport.current = current;
      setLink((was) => ({ ...was, extension: credentials.extension }));
      current.connect().catch(() => {}); // Ошибку входа ловит onConnectionState → retry.
    };

    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      void voip?.disconnect();
      transport.current = null;
      setCalls([]);
    };
  }, [enabled, queryClient, envId]);

  const { mutate: dialFallback } = fallback;
  const call = useCallback(
    (phone: string) => {
      const voip = transport.current;
      if (!voip) {
        dialFallback(phone);
        return;
      }
      voip
        .connect()
        .then(() => voip.call(phone))
        .catch((error: unknown) => reportError(error, "pbx.callFailed"));
    },
    [dialFallback],
  );

  const live = calls.some((c) => c.state !== "ended");
  const status: SoftphoneStatus =
    mode === "off" ? "off" : mode === "fallback" ? "fallback" : mode === "error" ? "offline" : link.state;
  const value = useMemo(
    () => ({
      call,
      busy: live || fallback.isPending,
      status,
      problem: mode === "error" ? modeProblem : status === "offline" ? link.problem : "",
      extension: link.extension,
      dnd,
      setDnd,
    }),
    [call, live, fallback.isPending, status, mode, modeProblem, link.problem, link.extension, dnd, setDnd],
  );

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {calls.length > 0 && <CallStack calls={calls} transport={transport} />}
      {/* Голос собеседника. Вне панели: панель исчезает после звонка,
          а элемент должен жить, пока жив поток. */}
      <audio ref={audio} autoPlay hidden />
    </SoftphoneContext.Provider>
  );
}

function CallStack({
  calls,
  transport,
}: {
  calls: VoipCallSnapshot[];
  transport: { current: VoipTransport | null };
}) {
  const [answering, setAnswering] = useState<string | null>(null);
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  useRingtone(calls.some((c) => c.state === "incoming" && c.id !== answering));

  const toggleHold = (id: string, hold: boolean) =>
    transport.current
      ?.setHeld(id, hold)
      .then(() =>
        setHeld((set) => {
          const next = new Set(set);
          if (hold) next.add(id);
          else next.delete(id);
          return next;
        }),
      )
      .catch((error: unknown) => reportError(error, "pbx.callFailed"));

  /* Вторая линия: принимая её, первую ставим на удержание, а не бросаем. */
  const answer = async (id: string) => {
    const voip = transport.current;
    if (!voip) return;
    setAnswering(id);
    try {
      for (const other of calls) {
        if (other.id !== id && other.state === "active" && !held.has(other.id)) await toggleHold(other.id, true);
      }
      await voip.answer(id);
    } catch (error) {
      reportError(error, "pbx.answerFailed");
    } finally {
      setAnswering(null);
    }
  };

  return createPortal(
    <div className="fixed right-4 bottom-4 z-60 flex w-80 flex-col gap-2">
      {calls.map((call) => (
        <CallCard
          key={call.id}
          call={call}
          held={held.has(call.id)}
          answering={answering === call.id}
          onAnswer={() => void answer(call.id)}
          onReject={() => void transport.current?.reject(call.id)}
          onHangup={() => void transport.current?.hangup(call.id)}
          onMute={(muted) => transport.current?.setMuted(call.id, muted)}
          onHold={(hold) => void toggleHold(call.id, hold)}
          onDtmf={(tone) =>
            transport.current?.sendDtmf(call.id, tone).catch((error: unknown) => reportError(error, "pbx.dtmfFailed"))
          }
          onTransfer={(to) =>
            (transport.current?.transfer(call.id, to) ?? Promise.reject(new Error("PBX offline"))).then(
              () => toast.success(i18n.t("pbx.transferred")),
              (error: unknown) => reportError(error, "pbx.transferFailed"),
            )
          }
        />
      ))}
    </div>,
    document.body,
  );
}

function CallCard({
  call,
  held,
  answering,
  onAnswer,
  onReject,
  onHangup,
  onMute,
  onHold,
  onDtmf,
  onTransfer,
}: {
  call: VoipCallSnapshot;
  held: boolean;
  answering: boolean;
  onAnswer: () => void;
  onReject: () => void;
  onHangup: () => void;
  onMute: (muted: boolean) => void;
  onHold: (hold: boolean) => void;
  onDtmf: (tone: string) => void;
  onTransfer: (destination: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const name = useCallerName(call.number);
  const [muted, setMuted] = useState(false);
  const [tool, setTool] = useState<"none" | "keypad" | "transfer">("none");
  const [target, setTarget] = useState("");
  /* Пока onlinePBX отвечает — второй перевод не уходит. */
  const [transferring, setTransferring] = useState(false);
  const toggleTool = (next: "keypad" | "transfer") => setTool((current) => (current === next ? "none" : next));
  /* Добавочный или внешний номер: 2–15 цифр, можно с «+»; пробелы, скобки и дефисы отбрасываются. */
  const destination = target.replace(/[\s()-]/g, "");
  const dialable = /^\+?\d{2,15}$/.test(destination);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (call.state !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call.state]);

  const seconds = call.establishedAt ? Math.max(0, Math.floor((now - call.establishedAt) / 1000)) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const label =
    call.state === "incoming"
      ? t("pbx.incoming")
      : call.state === "active"
        ? held
          ? `${t("pbx.onHold")} · ${clock}`
          : clock
        : call.state === "ended"
          ? t(call.direction === "incoming" && call.outcome !== "answered" ? "pbx.missed" : `pbx.outcome.${call.outcome}`)
          : t("pbx.dialing");

  const incoming = call.state === "incoming";

  const live = call.state === "dialing" || call.state === "ringing" || call.state === "active";

  return (
    <div
      role={incoming ? "alert" : undefined}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-modal"
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            incoming ? "animate-pulse bg-success-subtle text-success" : "bg-accent-subtle text-accent"
          }`}
        >
          <Icon as={incoming ? PhoneIncomingIcon : PhoneIcon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{name || call.number}</p>
          {/* Видимая строка тикает раз в секунду — скрыта от озвучки; читалке
              уходит только смена состояния, без таймера. */}
          <p aria-hidden className="truncate text-xs text-fg-muted tabular-nums">
            {name ? `${call.number} · ${label}` : label}
          </p>
          {/* У входящего живая область — вся карточка (alert), своя роль не нужна. */}
          <span role={incoming ? undefined : "status"} className="sr-only">
            {call.state === "active" ? t(held ? "pbx.onHold" : "pbx.inCall") : label}
          </span>
        </div>

        {incoming && (
          <>
            <RoundButton label={t("pbx.answer")} tone="success" disabled={answering} onClick={onAnswer}>
              <Icon as={PhoneIcon} size={16} />
            </RoundButton>
            <RoundButton label={t("pbx.reject")} tone="danger" disabled={answering} onClick={onReject}>
              <Icon as={PhoneOffIcon} size={16} />
            </RoundButton>
          </>
        )}
        {live && (
          <RoundButton label={t("pbx.hangup")} tone="danger" onClick={onHangup}>
            <Icon as={PhoneOffIcon} size={16} />
          </RoundButton>
        )}
      </div>

      {call.state === "active" && (
        <div className="flex items-center gap-1 pl-12">
          <RoundButton
            label={t(muted ? "pbx.unmute" : "pbx.mute")}
            onClick={() => {
              onMute(!muted);
              setMuted(!muted);
            }}
          >
            <Icon as={muted ? MicOffIcon : MicIcon} size={16} />
          </RoundButton>
          <RoundButton label={t(held ? "pbx.resume" : "pbx.hold")} onClick={() => onHold(!held)}>
            <Icon as={held ? PlayIcon : PauseIcon} size={16} />
          </RoundButton>
          <RoundButton label={t("pbx.keypad")} active={tool === "keypad"} onClick={() => toggleTool("keypad")}>
            <Icon as={GripIcon} size={16} />
          </RoundButton>
          <RoundButton label={t("pbx.transfer")} active={tool === "transfer"} onClick={() => toggleTool("transfer")}>
            <Icon as={ArrowRightLeftIcon} size={16} />
          </RoundButton>
        </div>
      )}

      {call.state === "active" && tool === "keypad" && (
        <div className="grid grid-cols-3 gap-1">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((tone) => (
            <button
              key={tone}
              type="button"
              onClick={() => onDtmf(tone)}
              className="h-9 cursor-pointer rounded-lg border border-border text-sm font-medium text-fg tabular-nums hover:bg-surface-hover"
            >
              {tone}
            </button>
          ))}
        </div>
      )}

      {call.state === "active" && tool === "transfer" && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!dialable || transferring) return;
            setTransferring(true);
            void onTransfer(destination).finally(() => setTransferring(false));
          }}
        >
          <Input
            autoFocus
            inputMode="tel"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={t("pbx.transferTo")}
            aria-label={t("pbx.transferTo")}
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" disabled={!dialable || transferring}>
            {t("pbx.transferGo")}
          </Button>
        </form>
      )}
    </div>
  );
}

const TONES = {
  plain: "text-fg-muted hover:bg-surface-hover",
  success: "bg-success-subtle text-success hover:bg-success hover:text-accent-fg",
  danger: "bg-danger-subtle text-danger hover:bg-danger hover:text-accent-fg",
} as const;

function RoundButton({
  label,
  tone = "plain",
  active = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: keyof typeof TONES;
  /** Нажатая кнопка-переключатель (клавиатура, перевод). */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-full disabled:opacity-40 ${
        active ? "bg-accent-subtle text-accent" : TONES[tone]
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Звонок входящего: секунда тона, две тишины. Синтез, а не файл —
 * лишнего ассета не нужно.
 *
 * ponytail: браузер не даст звука, пока на странице не было ни одного
 * клика (autoplay policy); после первого клика звонит. Уведомление
 * Notification API для свёрнутой вкладки — когда попросят.
 */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const context = new AudioContext();
    const ring = () => {
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = 440;
      gain.gain.value = 0.08;
      tone.connect(gain).connect(context.destination);
      tone.start();
      tone.stop(context.currentTime + 1);
    };
    ring();
    const timer = window.setInterval(ring, 3000);
    return () => {
      window.clearInterval(timer);
      void context.close();
    };
  }, [on]);
}
