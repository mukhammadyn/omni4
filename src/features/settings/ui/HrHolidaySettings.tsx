import { useTranslation } from "react-i18next";
import { HolidayCalendars } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Праздничные дни» — производственные календари `hcRoot` прототипа, а не справочник. */
export function HrHolidaySettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("dir.holidays")} hint={t("dir.holidaysHint")} />
      <HolidayCalendars />
    </div>
  );
}
