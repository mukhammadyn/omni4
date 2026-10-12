/** Группа «Без модуля» в дереве: папки, чей модуль не найден. */
export const NO_MODULE = "-";

/**
 * Личное в сайдбаре дашбордов — избранное, свёрнутые узлы, скрыт ли
 * сам сайдбар. В браузере, по проекту и пользователю (ADR-0013):
 * своего хранилища настроек пользователя у бэкенда нет.
 */
export type Prefs = { favorites: string[]; closed: string[]; hidden: boolean };

const EMPTY: Prefs = { favorites: [], closed: [], hidden: false };

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function readPrefs(key: string): Prefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof raw !== "object" || raw === null) return EMPTY;
    const value = raw as Record<string, unknown>;
    return { favorites: strings(value["favorites"]), closed: strings(value["closed"]), hidden: value["hidden"] === true };
  } catch {
    return EMPTY;
  }
}

export function writePrefs(key: string, prefs: Prefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Приватное окно или запрет хранилища — живём без памяти.
  }
}

/** Добавить, если нет; убрать, если есть. */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
