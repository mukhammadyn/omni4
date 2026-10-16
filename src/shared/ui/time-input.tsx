import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon } from "lucide-react";
import { Icon } from "./icon";
import { Input } from "./input";
import { Popover } from "./popover";

/** «ЧЧ:ММ», 00:00–23:59. */
export const isClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const HOUR_LIST = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTE_LIST = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

/**
 * Время «ЧЧ:ММ»: вводится с клавиатуры (цифры, двоеточие ставится само)
 * или выбирается в двух колонках — часы и минуты с шагом 5.
 * Не `<input type="time">` — по той же причине, что DatePicker.
 */
export function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [hour = "", minute = ""] = value.split(":");
  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  };
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <div className="relative">
          <Input
            value={value}
            inputMode="numeric"
            maxLength={5}
            placeholder="09:00"
            aria-invalid={Boolean(value) && !isClock(value)}
            onFocus={() => !open && toggle()}
            onClick={() => !open && toggle()}
            onKeyDown={(event) => event.key === "Enter" && open && toggle()}
            onChange={(event) => type(event.target.value)}
            className={`pr-8 tabular-nums ${!value || isClock(value) ? "" : "border-danger"}`}
          />
          <Icon as={ClockIcon} size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle" />
        </div>
      )}
    >
      {(close) => (
        <div className="w-44">
          <div className="grid grid-cols-4 gap-1 border-b border-border pb-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onChange(preset);
                  close();
                }}
                className={`rounded-md py-1 text-xs tabular-nums transition-colors ${
                  preset === value ? "bg-accent-subtle text-accent-text" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            <ClockColumn label={t("time.hours")} items={HOUR_LIST} value={hour} onPick={(next) => onChange(`${next}:${minute.length === 2 ? minute : "00"}`)} />
            <div className="w-px bg-border" />
            <ClockColumn
              label={t("time.minutes")}
              items={MINUTE_LIST}
              value={minute}
              onPick={(next) => {
                onChange(`${hour.length === 2 ? hour : "09"}:${next}`);
                // Минуты — последний шаг выбора.
                close();
              }}
            />
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Частые начала и концы смен — в один клик. */
const PRESETS = ["08:00", "09:00", "10:00", "13:00", "14:00", "17:00", "18:00", "20:00"];

function ClockColumn({ label, items, value, onPick }: { label: string; items: string[]; value: string; onPick: (value: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  // scrollTop, а не scrollIntoView: тот прокрутил бы и модальное окно под пикером (shared/ui/calendar, TimeColumn).
  useEffect(() => {
    const box = list.current;
    const button = active.current;
    if (box && button) box.scrollTop = button.offsetTop - box.clientHeight / 2 + button.clientHeight / 2;
  }, []);
  return (
    <div className="flex flex-1 flex-col">
      <span className="pb-1 text-center text-2xs font-medium tracking-wide text-fg-subtle uppercase">{label}</span>
      <div ref={list} role="listbox" className="relative flex h-48 flex-col gap-px overflow-y-auto [scrollbar-width:none]">
        {items.map((item) => (
          <button
            key={item}
            ref={item === value ? active : undefined}
            type="button"
            role="option"
            aria-selected={item === value}
            onClick={() => onPick(item)}
            className={`shrink-0 rounded-md py-1.5 text-center text-sm tabular-nums transition-colors ${
              item === value ? "bg-accent-solid font-semibold text-accent-fg" : "text-fg hover:bg-surface-hover"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
