import { useTranslation } from "react-i18next";
import { PipelineSettings } from "@/features/hrms";
import { SectionHeader } from "./parts";

/** «Воронки рекрутинга» — воронки и их этапы одним деревом, как в прототипе. */
export function HrPipelineSettings() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("dir.recPipelines")} hint={t("dir.recPipelinesHint")} />
      <PipelineSettings />
    </div>
  );
}
