import { useUi } from "@/shared/lib/ui-store";
import type { Month } from "../model/vacancy-plan";

/**
 * Настройки «Планирования» одного человека — по view, в ui-store.
 * Их читают двое: экран (VacancyPlan) и его кнопки в строке вкладок
 * (VacancyPlanTools), — поэтому они не в состоянии компонента.
 */

/** Группировки — `PGRPS` прототипа. */
export const PLAN_GROUPS = ["branch", "dept", "status", "priority", "recruiter"] as const;
export type PlanGroup = (typeof PLAN_GROUPS)[number];

/** Что видно под названием вакансии — `rows.fields` прототипа. */
export const PLAN_ROW_PARTS = ["status", "dept", "branch", "deadline"] as const;
export type PlanRowPart = (typeof PLAN_ROW_PARTS)[number];

export const PLAN_HEIGHTS = ["compact", "normal", "spacious"] as const;
export type PlanHeight = (typeof PLAN_HEIGHTS)[number];

type Saved = {
  group?: PlanGroup;
  /** Опорный месяц. Нет — окно едет за сегодняшней датой. */
  anchor?: Month | undefined;
  /** Скрытые части строки: по умолчанию видно всё. */
  hidden?: PlanRowPart[];
  height?: PlanHeight;
};

/** Из хранилища может прийти что угодно — старая версия, чужая правка. */
function read(value: unknown): Saved {
  if (!value || typeof value !== "object") return {};
  const { group, anchor, hidden, height } = value as Record<string, unknown>;
  return {
    ...(PLAN_GROUPS.includes(group as PlanGroup) ? { group: group as PlanGroup } : {}),
    ...(Number.isInteger(anchor) ? { anchor: anchor as number } : {}),
    ...(Array.isArray(hidden)
      ? { hidden: hidden.filter((part): part is PlanRowPart => PLAN_ROW_PARTS.includes(part)) }
      : {}),
    ...(PLAN_HEIGHTS.includes(height as PlanHeight) ? { height: height as PlanHeight } : {}),
  };
}

export function usePlanSettings(viewId: string) {
  const saved = read(useUi((s) => s.viewState[viewId]));
  const setViewState = useUi((s) => s.setViewState);
  const remember = (next: Saved) => setViewState(viewId, { ...saved, ...next });
  const hidden = saved.hidden ?? [];

  return {
    group: saved.group ?? "branch",
    anchor: saved.anchor,
    height: saved.height ?? "normal",
    shows: (part: PlanRowPart) => !hidden.includes(part),
    setGroup: (group: PlanGroup) => remember({ group }),
    setAnchor: (anchor: Month | undefined) => remember({ anchor }),
    setHeight: (height: PlanHeight) => remember({ height }),
    toggle: (part: PlanRowPart) =>
      remember({ hidden: hidden.includes(part) ? hidden.filter((p) => p !== part) : [...hidden, part] }),
  };
}
