import { SKIN_TONES, type SkinTone } from "../api/emoji";

/**
 * Удобства одного человека в выборе иконки: недавние эмодзи и оттенок
 * кожи. Не данные — поэтому localStorage, и молча: в приватном окне
 * или с запретом хранилища выбор просто начинается с чистого листа.
 */
const RECENT_KEY = "omni4.recentEmoji";
const TONE_KEY = "omni4.skinTone";
const RECENT_LIMIT = 24;

export function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Выбранное — в начало, без повторов, не больше RECENT_LIMIT. */
export function pushRecent(recent: string[], image: string): string[] {
  const next = [image, ...recent.filter((item) => item !== image)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Хранилище недоступно — список живёт до закрытия окна выбора.
  }
  return next;
}

export function readTone(): SkinTone {
  try {
    const value = localStorage.getItem(TONE_KEY) ?? "";
    return (SKIN_TONES as readonly string[]).includes(value) ? (value as SkinTone) : "";
  } catch {
    return "";
  }
}

export function saveTone(tone: SkinTone) {
  try {
    localStorage.setItem(TONE_KEY, tone);
  } catch {
    // См. выше: без хранилища выбор держится до закрытия окна.
  }
}
