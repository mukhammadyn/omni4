import { useTranslation } from "react-i18next";
import { GradeMatrix } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Зарплаты по грейдам» — матрица `gmInit` прототипа, а не справочник вилок. */
export function HrSalarySettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("dir.salaryBands")} hint={t("dir.salaryBandsHint")} />
      <GradeMatrix />
    </div>
  );
}
