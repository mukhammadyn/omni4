import { useQuery } from "@tanstack/react-query";
import { keys } from "@/shared/lib/query-keys";

/**
 * Иконки для пунктов меню и прочего, что выбирает человек, — Lucide,
 * тот же набор, что у интерфейса omni4 (docs/DESIGN.md, «Иконки»):
 * контурные, и рядом с нашими они не выглядят чужими.
 *
 * Весь набор — одним файлом `@iconify-json/lucide` с jsdelivr (≈600 КБ,
 * по сети сжат), а не по запросу на иконку: в сетке их почти две тысячи.
 *
 * В данные пишется `lucide:<имя>` — его рисуют Iconify-ом и наш сайдбар,
 * и старая админка (shared/ui/dynamic-icon). С цветом — адрес Iconify
 * с `?color=`: его оба клиента показывают картинкой.
 */
const VERSION = "1.2.137";

export type LucideGlyph = { name: string; body: string };

type IconifyJson = { icons?: Record<string, { body?: string }> };

/**
 * Тело иконки — разметка внутри `<svg viewBox="0 0 24 24">`. Толщина
 * линии сразу наша (1.8, как у обёртки Icon), а не родная 2.
 */
export function toGlyphs(json: IconifyJson): LucideGlyph[] {
  return Object.entries(json.icons ?? {})
    .filter(([, icon]) => icon.body)
    .map(([name, icon]) => ({ name, body: icon.body!.replaceAll('stroke-width="2"', 'stroke-width="1.8"') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useLucideIcons(enabled: boolean) {
  return useQuery({
    queryKey: keys.icons.lucide(),
    queryFn: ({ signal }) =>
      fetch(`https://cdn.jsdelivr.net/npm/@iconify-json/lucide@${VERSION}/icons.json`, { signal })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error(String(response.status))),
        )
        .then((json: IconifyJson) => toGlyphs(json)),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

/**
 * Цвета иконки — те же девять оттенков, что `--c-*` у прототипа. Это
 * цвет ДАННЫХ: он уезжает в адрес картинки и хранится в пункте, поэтому
 * HEX, а не токен (как и карта цветов в shared/ui/chip). Без цвета
 * иконка рисуется цветом текста и сама следует теме.
 */
export const ICON_COLORS = [
  ["gray", "#787774"],
  ["brown", "#9f6b53"],
  ["orange", "#d9730d"],
  ["yellow", "#cb912f"],
  ["green", "#448361"],
  ["blue", "#337ea9"],
  ["purple", "#9065b0"],
  ["pink", "#c14c8a"],
  ["red", "#d44c47"],
] as const;

/** Что сохранить: без цвета — имя Iconify, с цветом — адрес с `?color=`. */
export function iconValue(name: string, color: string) {
  return color
    ? `https://api.iconify.design/lucide/${name}.svg?color=${encodeURIComponent(color)}`
    : `lucide:${name}`;
}
