import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CarrotIcon,
  CircleCheckIcon,
  ClockIcon,
  FlagIcon,
  LeafIcon,
  LightbulbIcon,
  PlaneIcon,
  SearchIcon,
  ShuffleIcon,
  SmileIcon,
  VolleyballIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/shared/lib/i18n";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { Tooltip } from "@/shared/ui/tooltip";
import {
  EMOJI_SECTIONS,
  SKIN_TONES,
  emojiImage,
  emojiUrl,
  useEmoji,
  type Emoji,
  type EmojiSection,
  type SkinTone,
} from "../api/emoji";
import { ICON_COLORS, iconValue, useLucideIcons, type LucideGlyph } from "../api/lucide";
import { pushRecent, readRecent, readTone, saveTone } from "../model/prefs";

/**
 * Выбор иконки — как у Notion: вкладки «Эмодзи» и «Иконки», «Убрать»
 * справа. Один на всё приложение: пункт меню, кнопка-поле, действие
 * таблицы, ячейка.
 *
 * Эмодзи — картинки Apple (api/emoji), иконки — Lucide, тот же набор,
 * что у интерфейса (api/lucide). Оба списка большие и прокручиваются
 * виртуально: в DOM только видимые строки.
 */
/** Свой набор иконок отдельной вкладкой — например, значки view. */
export type IconPreset = { label: string; icons: { name: string; icon: LucideIcon }[] };

export function IconPicker({
  value,
  type,
  onChange,
  preset,
  placeholder,
}: {
  value: string;
  type: string;
  onChange: (icon: string) => void;
  preset?: IconPreset | undefined;
  /** Что показать, пока иконка не выбрана. Нет — первая буква типа. */
  placeholder?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <>
      {/* Снизу, как у Notion, пока там есть место хотя бы на шапку,
          фильтр, пару строк и нижнюю панель; список ужмётся. */}
      <Popover
        minBelow={260}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={t("iconPicker.choose")}
            /* Высота — как у поля ввода рядом (--spacing-input). */
            className={`grid size-(--spacing-input) shrink-0 place-items-center rounded-md border bg-input text-fg-muted transition-colors hover:bg-surface-hover ${
              open ? "border-accent text-fg" : "border-border-strong"
            }`}
          >
            <DynamicIcon name={value} fallback={placeholder ?? <Placeholder type={type} />} />
          </button>
        )}
      >
        {(close) => (
          <IconPickerPanel
            value={value}
            preset={preset}
            onPick={(icon) => {
              onChange(icon);
              close();
            }}
            onRemove={() => {
              onChange("");
              close();
            }}
          />
        )}
      </Popover>

    </>
  );
}

function Placeholder({ type }: { type: string }) {
  return <span className="text-2xs text-fg-subtle">{type.slice(0, 1) || "?"}</span>;
}

/** Сохранённое значение — иконка Lucide (имя или адрес с цветом)? Тогда открываемся на «Иконках». */
const isLucide = (value: string) =>
  value.startsWith("lucide:") || value.startsWith("https://api.iconify.design/lucide/");

/** Сама панель — без кнопки: её можно поставить в любой поповер. */
export function IconPickerPanel({
  value,
  onPick,
  onRemove,
  preset,
}: {
  value: string;
  onPick: (icon: string) => void;
  onRemove: () => void;
  preset?: IconPreset | undefined;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"emoji" | "icons" | "preset">(
    preset ? "preset" : isLucide(value) ? "icons" : "emoji",
  );

  return (
    /* Ширина — 12 клеток по 32px, поля по 12px и полоса прокрутки 8px
       (app/styles.css): без её места правый столбец обрезался. */
    /* min-h-0: когда поповеру не хватает высоты, ужимается список,
       а шапка, фильтр и нижняя панель остаются на месте. */
    <div className="flex min-h-0 w-[26rem] max-w-full flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b border-border px-1.5">
        <Tabs
          tabs={[
            { id: "emoji", label: t("iconPicker.tabEmoji") },
            { id: "icons", label: t("iconPicker.tabIcons") },
            ...(preset ? [{ id: "preset", label: preset.label }] : []),
          ]}
          activeId={tab}
          onSelect={(id) => setTab(id as "emoji" | "icons" | "preset")}
        />
        {value && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto self-center rounded-[5px] px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {t("iconPicker.remove")}
          </button>
        )}
      </div>

      {tab === "emoji" && <EmojiTab onPick={onPick} />}
      {tab === "icons" && <IconsTab onPick={onPick} />}
      {tab === "preset" && preset && (
        <div className="grid grid-cols-12 px-3 py-2">
          {preset.icons.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => onPick(iconValue(item.name, ""))}
              aria-label={item.name}
              title={item.name.replaceAll("-", " ")}
              className="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Icon as={item.icon} size={20} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Общие куски ─────────────────────────────────────────────── */

const CELL = 32;
const COLUMNS = 12;

function Filter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();

  return (
    <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 text-sm transition-colors focus-within:border-accent">
      <Icon as={SearchIcon} className="text-fg-subtle" />
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("iconPicker.filter")}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
      />
    </label>
  );
}

/** Квадратная кнопка в строке фильтра: «случайная», оттенок, цвет. */
function SquareButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-md border border-border-strong text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let at = 0; at < items.length; at += size) rows.push(items.slice(at, at + size));
  return rows;
}

const random = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

function Loading() {
  return (
    <div className="grid h-64 min-h-0 shrink grid-cols-12 content-start gap-0 overflow-hidden px-3 pt-2" aria-hidden>
      {Array.from({ length: 60 }, (_, index) => (
        <div key={index} className="m-1 h-6 rounded-md bg-surface-active" />
      ))}
    </div>
  );
}

/* ── Эмодзи ──────────────────────────────────────────────────── */

type Row =
  | { kind: "label"; section: EmojiSection | "recent"; text: string }
  | { kind: "cells"; section: EmojiSection | "recent"; items: Emoji[] };

const SECTION_ICONS: Record<EmojiSection | "recent", LucideIcon> = {
  recent: ClockIcon,
  people: SmileIcon,
  nature: LeafIcon,
  food: CarrotIcon,
  activity: VolleyballIcon,
  travel: PlaneIcon,
  objects: LightbulbIcon,
  symbols: CircleCheckIcon,
  flags: FlagIcon,
};

/** Рука — для кнопки оттенка кожи, как ✋ у Notion. */
const HAND = "270b.png";

function EmojiTab({ onPick }: { onPick: (icon: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useEmoji(true);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<SkinTone>(readTone);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const scroller = useRef<HTMLDivElement>(null);

  const all = useMemo(() => data ?? [], [data]);
  const byImage = useMemo(() => new Map(all.map((emoji) => [emoji.image, emoji])), [all]);
  const hand = byImage.get(HAND);

  const rows = useMemo<Row[]>(() => {
    const words = query.trim().toLowerCase();
    if (words) {
      const found = all.filter((emoji) => emoji.names.some((name) => name.includes(words)));
      return chunk(found, COLUMNS).map((items) => ({ kind: "cells", section: "people", items }));
    }

    const out: Row[] = [];
    const recentItems = recent.map((image) => byImage.get(image)).filter((emoji): emoji is Emoji => !!emoji);
    if (recentItems.length) {
      out.push({ kind: "label", section: "recent", text: t("iconPicker.recent") });
      for (const items of chunk(recentItems, COLUMNS)) out.push({ kind: "cells", section: "recent", items });
    }
    for (const section of EMOJI_SECTIONS) {
      const items = all.filter((emoji) => emoji.section === section.id);
      if (!items.length) continue;
      out.push({ kind: "label", section: section.id, text: t(section.label as TranslationKey) });
      for (const cells of chunk(items, COLUMNS)) out.push({ kind: "cells", section: section.id, items: cells });
    }
    return out;
  }, [all, byImage, query, recent, t]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (rows[index]?.kind === "label" ? 30 : CELL),
    overscan: 6,
  });

  // Какой раздел сейчас наверху — его значок подсвечен в нижней панели.
  const firstVisible = virtualizer.getVirtualItems()[0]?.index ?? 0;
  const current = rows[firstVisible]?.section;

  const pick = (emoji: Emoji) => {
    const image = emojiImage(emoji, tone);
    // В недавние — сам эмодзи, а не его оттенок: оттенок применится при показе.
    setRecent((list) => pushRecent(list, emoji.image));
    onPick(emojiUrl(image));
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-1">
        <Filter value={query} onChange={setQuery} />
        <SquareButton
          label={t("iconPicker.random")}
          onClick={() => {
            const emoji = random(all);
            if (emoji) pick(emoji);
          }}
        >
          <Icon as={ShuffleIcon} />
        </SquareButton>

        <Popover
          align="end"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={t("iconPicker.skinTone")}
              title={t("iconPicker.skinTone")}
              className="grid size-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-surface-hover"
            >
              {hand && <img src={emojiUrl(emojiImage(hand, tone))} alt="" className="size-5.5" />}
            </button>
          )}
        >
          {(close) => (
            <div className="flex gap-0.5">
              {SKIN_TONES.map((option) => (
                <button
                  key={option || "default"}
                  type="button"
                  onClick={() => {
                    setTone(option);
                    saveTone(option);
                    close();
                  }}
                  aria-pressed={tone === option}
                  className={`grid size-8 place-items-center rounded-md transition-colors ${
                    tone === option ? "bg-surface-active" : "hover:bg-surface-hover"
                  }`}
                >
                  {hand && <img src={emojiUrl(emojiImage(hand, option))} alt="" className="size-5.5" />}
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {error && <p className="px-3 py-6 text-xs text-danger">{t("iconPicker.emojiFailed")}</p>}
      {isLoading && <Loading />}

      {!isLoading && !error && (
        <div ref={scroller} className="h-64 min-h-0 shrink overflow-y-auto px-3">
          {rows.length === 0 && <p className="py-6 text-xs text-fg-subtle">{t("iconPicker.empty")}</p>}
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  className="absolute inset-x-0"
                  style={{ top: item.start, height: item.size }}
                >
                  {row.kind === "label" ? (
                    <p className="px-1 pt-2.5 text-xs font-semibold text-fg-muted">{row.text}</p>
                  ) : (
                    <div className="grid grid-cols-12">
                      {row.items.map((emoji) => (
                        <button
                          key={emoji.image}
                          type="button"
                          onClick={() => pick(emoji)}
                          title={emoji.names[0]?.replaceAll("_", " ")}
                          className="grid size-8 place-items-center rounded-md transition-colors hover:bg-surface-hover"
                        >
                          <img
                            src={emojiUrl(emojiImage(emoji, tone))}
                            alt={emoji.names[0] ?? ""}
                            className="size-6"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Нижняя панель разделов — как у Notion; при поиске разделов нет. */}
      {!query.trim() && !isLoading && !error && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1.5">
          {(["recent", ...EMOJI_SECTIONS.map((section) => section.id)] as const).map((section) => {
            const at = rows.findIndex((row) => row.kind === "label" && row.section === section);
            const label =
              section === "recent"
                ? t("iconPicker.recent")
                : t(EMOJI_SECTIONS.find((item) => item.id === section)!.label as TranslationKey);
            return (
              <button
                key={section}
                type="button"
                disabled={at === -1}
                onClick={() => virtualizer.scrollToIndex(at, { align: "start" })}
                aria-label={label}
                title={label}
                className={`grid size-8 place-items-center rounded-md transition-colors disabled:opacity-30 ${
                  current === section ? "bg-surface-active text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                }`}
              >
                <Icon as={SECTION_ICONS[section]} size={18} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Иконки ──────────────────────────────────────────────────── */

function IconsTab({ onPick }: { onPick: (icon: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useLucideIcons(true);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().replaceAll(" ", "-");
    const found = (data ?? []).filter((glyph) => !words || glyph.name.includes(words));
    return chunk(found, COLUMNS);
  }, [data, query]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => CELL,
    overscan: 6,
  });

  const pick = (glyph: LucideGlyph) => onPick(iconValue(glyph.name, color));

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-1">
        <Filter value={query} onChange={setQuery} />
        <SquareButton
          label={t("iconPicker.random")}
          onClick={() => {
            const glyph = random(data ?? []);
            if (glyph) pick(glyph);
          }}
        >
          <Icon as={ShuffleIcon} />
        </SquareButton>

        <Popover
          align="end"
          trigger={({ toggle }) => (
            <SquareButton label={t("iconPicker.color")} onClick={toggle}>
              <Swatch color={color} />
            </SquareButton>
          )}
        >
          {(close) => (
            <div className="flex gap-0.5">
              {[["default", ""] as const, ...ICON_COLORS].map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setColor(hex);
                    close();
                  }}
                  aria-pressed={color === hex}
                  aria-label={t(`color.${name}` as TranslationKey)}
                  title={t(`color.${name}` as TranslationKey)}
                  className={`grid size-8 place-items-center rounded-md transition-colors ${
                    color === hex ? "bg-surface-active" : "hover:bg-surface-hover"
                  }`}
                >
                  <Swatch color={hex} />
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {error && <p className="px-3 py-6 text-xs text-danger">{t("iconPicker.failed")}</p>}
      {isLoading && <Loading />}

      {!isLoading && !error && (
        <div ref={scroller} className="h-72 min-h-0 shrink overflow-y-auto px-3 pt-1">
          {rows.length === 0 && <p className="py-6 text-xs text-fg-subtle">{t("iconPicker.empty")}</p>}
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                className="absolute inset-x-0 grid grid-cols-12"
                style={{ top: item.start, height: item.size }}
              >
                {rows[item.index]!.map((glyph) => (
                  <Tooltip key={glyph.name} label={glyph.name.replaceAll("-", " ")}>
                    <button
                      type="button"
                      onClick={() => pick(glyph)}
                      aria-label={glyph.name}
                      /* Без выбранного цвета — цветом текста, как наши иконки;
                         с цветом — им же, чтобы видно было, что сохранится. */
                      className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-surface-hover ${
                        color ? "" : "text-fg-muted hover:text-fg"
                      }`}
                      style={color ? { color } : undefined}
                    >
                      {/* Тело — из пакета Lucide с jsdelivr, закреплённой
                          версии (api/lucide): доверяем так же, как самому
                          набору иконок. */}
                      <svg
                        viewBox="0 0 24 24"
                        width={20}
                        height={20}
                        aria-hidden
                        dangerouslySetInnerHTML={{ __html: glyph.body }}
                      />
                    </button>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Кружок цвета: без цвета — цвет текста, чтобы было видно «по умолчанию». */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className={`size-3.5 rounded-full ${color ? "" : "bg-fg-muted"}`}
      style={color ? { background: color } : undefined}
    />
  );
}
