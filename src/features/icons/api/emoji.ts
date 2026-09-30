import { useQuery } from "@tanstack/react-query";
import { keys } from "@/shared/lib/query-keys";

/**
 * Эмодзи Apple — картинками, а не шрифтом: шрифт у каждой системы свой
 * (Windows рисует Segoe, Android — Noto), и один и тот же символ выглядел
 * бы по-разному. Картинка одна везде.
 *
 * Источник — пакет `emoji-datasource-apple` с jsdelivr: картинки 64px
 * и список с разделами. В бандл не идёт ничего; список (≈1.3 МБ,
 * по сети сжат) грузится один раз, когда открыли выбор.
 *
 * В данные пишется ПОЛНЫЙ адрес картинки: так иконку рисуют и другие
 * клиенты — старая админка и мы сами показываем адрес через `<img>`
 * (shared/ui/dynamic-icon). Свой префикс `emoji:` они бы не поняли.
 */
const VERSION = "16.0.0";
const BASE = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@${VERSION}`;

export const emojiUrl = (image: string) => `${BASE}/img/apple/64/${image}`;

/**
 * Разделы — как у Notion: смайлы и люди — один раздел «Люди». Значок
 * раздела в нижней панели задаёт интерфейс, здесь только состав.
 */
export const EMOJI_SECTIONS = [
  { id: "people", label: "emoji.people", from: ["Smileys & Emotion", "People & Body"] },
  { id: "nature", label: "emoji.animals", from: ["Animals & Nature"] },
  { id: "food", label: "emoji.food", from: ["Food & Drink"] },
  { id: "activity", label: "emoji.activities", from: ["Activities"] },
  { id: "travel", label: "emoji.travel", from: ["Travel & Places"] },
  { id: "objects", label: "emoji.objects", from: ["Objects"] },
  { id: "symbols", label: "emoji.symbols", from: ["Symbols"] },
  { id: "flags", label: "emoji.flags", from: ["Flags"] },
] as const;

export type EmojiSection = (typeof EMOJI_SECTIONS)[number]["id"];

/** Оттенки кожи: пусто — жёлтый по умолчанию, дальше модификаторы Фицпатрика. */
export const SKIN_TONES = ["", "1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

export type Emoji = {
  /** Файл картинки: `1f3af.png`. Он же ключ. */
  image: string;
  /** Английские имена — других у набора нет; по ним и поиск. */
  names: string[];
  section: EmojiSection;
  /** Картинки в оттенках кожи — у тех, у кого они есть. */
  skins: Partial<Record<SkinTone, string>>;
};

type EmojiDto = {
  image?: string;
  name?: string;
  short_names?: string[];
  category?: string;
  sort_order?: number;
  has_img_apple?: boolean;
  obsoleted_by?: string;
  skin_variations?: Record<string, { image?: string; has_img_apple?: boolean }>;
};

const SECTION_OF = new Map<string, EmojiSection>(
  EMOJI_SECTIONS.flatMap((section) => section.from.map((category) => [category, section.id] as const)),
);

/**
 * Разбор списка: только с картинкой Apple, без служебных (оттенки кожи
 * сами по себе) и устаревших, в порядке набора. Оттенки берутся только
 * одиночные — у пар («1F3FB-1F3FC») свой выбор на каждого, его в одной
 * кнопке не выразить.
 */
export function toEmoji(list: EmojiDto[]): Emoji[] {
  return list
    .filter((dto) => dto.has_img_apple && dto.image && !dto.obsoleted_by && SECTION_OF.has(dto.category ?? ""))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((dto) => {
      const skins: Partial<Record<SkinTone, string>> = {};
      for (const tone of SKIN_TONES) {
        const variant = tone ? dto.skin_variations?.[tone] : undefined;
        if (variant?.image && variant.has_img_apple) skins[tone] = variant.image;
      }

      return {
        image: dto.image!,
        names: [...(dto.short_names ?? []), (dto.name ?? "").toLowerCase()].filter(Boolean),
        section: SECTION_OF.get(dto.category!)!,
        skins,
      };
    });
}

/** Картинка эмодзи в выбранном оттенке — если он у эмодзи есть. */
export const emojiImage = (emoji: Emoji, tone: SkinTone) => emoji.skins[tone] ?? emoji.image;

export function useEmoji(enabled: boolean) {
  return useQuery({
    queryKey: keys.icons.emoji(),
    queryFn: ({ signal }) =>
      fetch(`${BASE}/emoji.json`, { signal })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error(String(response.status))),
        )
        .then((list: EmojiDto[]) => toEmoji(list)),
    enabled,
    // Набор не меняется — держим на весь сеанс.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
