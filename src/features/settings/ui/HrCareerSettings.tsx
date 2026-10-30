import { useTranslation } from "react-i18next";
import { CareerSite } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Карьерный сайт» — настройки публичной страницы вакансий с предпросмотром (`careerInit` прототипа). */
export function HrCareerSettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("career.title")} hint={t("career.hint")} />
      <CareerSite />
    </div>
  );
}
