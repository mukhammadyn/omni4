import { lazy } from "react";

/**
 * Страница — отдельным чанком. `useProject` и `useWorkspaceTitle` нужны
 * каждому экрану (шапка, сайдбар), и статический реэкспорт страницы
 * рядом с ними склеивал всю фичу — SQL-консоль, диаграмму, журналы —
 * в стартовую загрузку: 166 КБ gzip на любой странице, даже без захода
 * в настройки. Монтируется под Suspense маршрута настроек.
 */
export const SettingsPage = lazy(() =>
  import("./ui/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
export { useSettingsSections } from "./ui/sections";
export { useProject, useWorkspaceTitle } from "./api/project";
