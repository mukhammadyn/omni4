/**
 * Свой порядок вкладок поверх порядка по умолчанию: сохранённые id — в своём
 * порядке, остальные (новые вкладки, которых в сохранённом нет) — следом,
 * как шли. Сохранённые, которых больше нет, пропускаются.
 */
export function applyOrder<T extends { id: string }>(items: T[], saved: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const first = saved.flatMap((id) => byId.get(id) ?? []);
  const placed = new Set(first.map((item) => item.id));
  return [...first, ...items.filter((item) => !placed.has(item.id))];
}

/** Перенос: элемент `id` встаёт на место `target`. */
export function moveId(ids: string[], id: string, target: string): string[] {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const rest = ids.filter((item) => item !== id);
  rest.splice(ids.indexOf(target), 0, id);
  return rest;
}
