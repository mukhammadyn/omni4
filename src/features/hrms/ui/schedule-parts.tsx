import { useTranslation } from "react-i18next";
import { HouseIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { CHIP_STYLES } from "@/shared/ui/chip";
import type { Shift, ShiftKind } from "../model/schedule";

/* Общее у экранов графика: календаря, окна смены, вкладки сотрудника. */

/** Тип смены: подложка, полоса слева и значок — `KIND` прототипа. */
export const KIND_STYLE: Record<ShiftKind, { chip: string; stripe: string; icon: LucideIcon }> = {
  day: { chip: CHIP_STYLES.blue, stripe: "bg-chart-1", icon: SunIcon },
  night: { chip: CHIP_STYLES.purple, stripe: "bg-chart-7", icon: MoonIcon },
  remote: { chip: CHIP_STYLES.green, stripe: "bg-chart-3", icon: HouseIcon },
};

/** «8 ч», «7 ч 30 м». */
export function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h && m ? t("timesheet.hm", { h, m }) : m ? t("timesheet.m", { m }) : t("timesheet.h", { h });
  };
}

/** Новая смена на клетке или правка существующей — окну смены. */
export type OpenShift = { shift?: Shift; employeeId?: string; date: string };
