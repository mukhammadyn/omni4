import { useState } from "react";
import { FileTextIcon, FolderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DocumentDrive } from "@/features/hrms";
import { Tabs } from "@/shared/ui/tabs";
import { DirectorySettings } from "./DirectorySettings";
import { DOC_TEMPLATES } from "./directories";
import { SectionHeader } from "./parts";

/**
 * «Файлы и документы» — `#s-hr-files` прототипа: вкладки «Файлы»
 * (файловый менеджер `mkDrive` прототипа на данных и окнах
 * модуля HRMS) и «Шаблоны» (справочник шаблонов).
 */
export function HrFilesSettings() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState("files");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-6">
      <SectionHeader title={t("dir.files")} hint={t("dir.filesHint")} />
      <div className="mb-3.5 shrink-0">
        <Tabs
          variant="segment"
          activeId={tab}
          onSelect={setTab}
          tabs={[
            { id: "files", label: t("dir.filesTab"), icon: FolderIcon },
            { id: "templates", label: t("dir.templatesTab"), icon: FileTextIcon },
          ]}
        />
      </div>
      {tab === "files" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <DocumentDrive locale={i18n.language} />
        </div>
      ) : (
        <DirectorySettings directory={DOC_TEMPLATES} headless />
      )}
    </div>
  );
}
