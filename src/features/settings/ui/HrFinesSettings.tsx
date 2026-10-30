import { useTranslation } from "react-i18next";
import { PenaltySettings } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Штрафы за посещаемость» — свой экран `fnRoot` прототипа, а не справочник. */
export function HrFinesSettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("dir.penalties")} hint={t("dir.penaltiesHint")} />
      <PenaltySettings />
    </div>
  );
}
