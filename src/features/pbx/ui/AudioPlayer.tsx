import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { DownloadIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/shared/ui/icon";

/*
 * Волна — рисунок, а не спектр записи: декодировать mp3 ради картинки
 * дорого, а читается плеер и так (new-crm, BrandedAudioPlayer, — тоже
 * узор). Высоты в процентах.
 */
const BARS = [
  14, 22, 30, 20, 42, 58, 72, 50, 34, 44, 38, 52, 72, 62, 44, 68, 34, 50, 38, 64, 74, 54, 42, 58, 70, 76, 54, 44, 62,
  72, 58, 46, 36, 50, 44, 58, 38, 52, 46,
];
const SPEEDS = [1, 1.5, 2];

const clock = (seconds: number) => {
  const value = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

/**
 * Запись разговора — компактный плеер, как в карточке звонка new-crm:
 * пуск, волна-прогресс (щелчок и стрелки — перемотка), время, скорость,
 * скачать. Под ним обычный `<audio>`: буферизацию и форматы знает браузер.
 */
export function AudioPlayer({ src, fileName }: { src: string; fileName: string }) {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const progress = length ? time / length : 0;
  const seek = (to: number) => {
    if (!audio.current || !length) return;
    audio.current.currentTime = Math.max(0, Math.min(length, to));
  };
  const onWave = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - box.left) / box.width) * length);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") seek(time + 5);
    else if (event.key === "ArrowLeft") seek(time - 5);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex w-72 max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2 pl-1">
      <button
        type="button"
        aria-label={t(playing ? "pbx.pause" : "pbx.play")}
        onClick={() => void (playing ? audio.current?.pause() : audio.current?.play())}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-accent-solid text-accent-fg hover:bg-accent-solid-hover"
      >
        <Icon as={playing ? PauseIcon : PlayIcon} size={14} />
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t("pbx.seek")}
        aria-valuemin={0}
        aria-valuemax={Math.floor(length)}
        aria-valuenow={Math.floor(time)}
        aria-valuetext={`${clock(time)} / ${clock(length)}`}
        onClick={onWave}
        onKeyDown={onKey}
        className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-px"
      >
        {BARS.map((height, index) => (
          <span
            key={index}
            style={{ height: `${height}%` }}
            className={`min-w-px flex-1 rounded-full ${
              (index + 0.5) / BARS.length <= progress ? "bg-accent" : "bg-border-strong"
            }`}
          />
        ))}
      </div>

      <span className="shrink-0 text-xs text-fg-muted tabular-nums">{clock(playing || time ? time : length)}</span>

      <button
        type="button"
        aria-label={t("pbx.speed")}
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
        className="shrink-0 cursor-pointer rounded px-1 text-xs font-medium text-fg-muted tabular-nums hover:bg-surface-hover"
      >
        {speed}×
      </button>
      <a
        href={src}
        download={fileName}
        aria-label={t("pbx.download")}
        title={t("pbx.download")}
        className="grid size-6 shrink-0 place-items-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg"
      >
        <Icon as={DownloadIcon} size={14} />
      </a>

      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setLength(event.currentTarget.duration)}
        hidden
      />
    </div>
  );
}
