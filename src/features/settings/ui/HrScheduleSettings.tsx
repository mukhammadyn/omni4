import { useTranslation } from "react-i18next";
import { WorkSchedules } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Шаблоны графиков работы» — те же карточки, что вкладка «Шаблоны» графика (`tplView` прототипа). */
export function HrScheduleSettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("dir.schedules")} hint={t("dir.schedulesHint")} />
      <WorkSchedules />
    </div>
  );
}
