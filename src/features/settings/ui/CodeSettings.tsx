import { useState } from "react";
import { BracesIcon, LayersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tabs } from "@/shared/ui/tabs";
import { FunctionSettings } from "./FunctionSettings";
import { MicrofrontendSettings } from "./MicrofrontendSettings";
import { SectionHeader } from "./parts";

/**
 * Код — `#s-dev-code` прототипа: фронтенд и серверные функции одним
 * разделом, вкладками. Это два вида одного и того же — своего кода
 * проекта, — и в навигации им хватает одного пункта.
 */
export function CodeSettings() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("frontend");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader title={t("core.code")} hint={t("core.codeHint")} />

      <div className="mb-4 shrink-0">
        <Tabs
          variant="segment"
          tabs={[
            { id: "frontend", label: t("core.frontend"), icon: LayersIcon },
            { id: "functions", label: t("functions.title"), icon: BracesIcon },
          ]}
          activeId={tab}
          onSelect={setTab}
        />
      </div>

      {tab === "frontend" ? <MicrofrontendSettings /> : <FunctionSettings />}
    </div>
  );
}
