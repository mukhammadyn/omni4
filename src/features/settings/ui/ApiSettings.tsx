import { useState } from "react";
import { CodeXmlIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTables } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import { useApiKeys } from "../api/api-keys";
import { useUsage } from "../api/usage";
import { SDK_LANGUAGES, sdkCode, type SdkLanguage } from "../model/sdk";
import { ApiKeySettings } from "./ApiKeySettings";
import { CAPS_LABEL, CodeCard, Quota, SectionHeader } from "./parts";
import { TableFilter } from "./TableFilter";

/**
 * API — как в прототипе (`#s-dev-api`): шапка с месячной квотой
 * запросов и две вкладки, код SDK и ключи. Ключи без SDK — это логин
 * и пароль без адреса, куда их вводить; SDK без ключей — адрес без
 * пропуска. Поэтому они на одном экране.
 *
 * Квота — та же, что в журнале расхода (`Usage`), и с тем же кэшем:
 * здесь только её сводка, разбор «кто съел» остаётся в журнале.
 */
export function ApiSettings() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState("sdk");
  const { usage } = useUsage(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader title={t("api.title")} hint={t("api.hint")}>
        {usage && (
          <Quota
            label={t("api.quota")}
            used={usage.used.toLocaleString(i18n.language)}
            limit={usage.unlimited ? "" : usage.limit.toLocaleString(i18n.language)}
            percent={usage.percentUsed}
          />
        )}
      </SectionHeader>

      <div className="mb-3 shrink-0">
        <Tabs
          variant="segment"
          tabs={[
            { id: "sdk", label: t("api.sdk"), icon: CodeXmlIcon },
            { id: "keys", label: t("apiKeys.title"), icon: KeyRoundIcon },
          ]}
          activeId={tab}
          onSelect={setTab}
        />
      </div>

      {tab === "sdk" ? <Sdk /> : <ApiKeySettings />}
    </div>
  );
}

/**
 * Готовый код под выбранную таблицу и ключ. Это не документация
 * ручек, а то, что вставляют в чужой проект и запускают: поэтому
 * ключ подставлен настоящий, а адрес — того шлюза, с которым работает
 * эта админка.
 */
function Sdk() {
  const { t } = useTranslation();
  const [picked, setPicked] = useState("");
  /* Пока не выбрали — первая таблица, как у прототипа: пустой выбор
     дал бы код с заглушкой вместо адреса. Список тот же, что внутри
     `TableFilter` (тот же ключ кэша), — второго запроса нет. */
  const first = useTables("").items[0]?.slug ?? "";
  const table = picked || first;
  const [language, setLanguage] = useState<SdkLanguage>("js");
  const [keyId, setKeyId] = useState("");

  /* Ключей в проекте единицы; первой страницы хватает с запасом. */
  const { apiKeys } = useApiKeys({ search: "", page: 1, limit: 100 });
  const key = apiKeys.find((item) => item.id === keyId) ?? apiKeys[0];

  const code = sdkCode(
    language,
    import.meta.env.VITE_API_URL,
    table || "TABLE_SLUG",
    key?.appId || "YOUR_API_KEY",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-6">
      {/* `.dx-fields` прототипа: поля по 200px в ряд, подпись капителью. */}
      <div className="mb-3.5 flex shrink-0 flex-wrap gap-3.5">
        <label className="w-50">
          <span className={`mb-1.5 block ${CAPS_LABEL}`}>{t("api.table")}</span>
          <TableFilter value={table} onChange={setPicked} clearable={false} size="control" />
        </label>

        <label className="w-50">
          <span className={`mb-1.5 block ${CAPS_LABEL}`}>{t("api.language")}</span>
          <Dropdown
            value={language}
            items={SDK_LANGUAGES.map((item) => ({ value: item.id, label: item.label }))}
            ariaLabel={t("api.language")}
            size="control"
            onChange={(value) => setLanguage(value as SdkLanguage)}
          />
        </label>

        <label className="w-50">
          <span className={`mb-1.5 block ${CAPS_LABEL}`}>{t("api.key")}</span>
          <Dropdown
            value={key?.id ?? ""}
            items={apiKeys.map((item) => ({ value: item.id, label: item.name }))}
            placeholder={t("api.noKeys")}
            ariaLabel={t("api.key")}
            size="control"
            disabled={!apiKeys.length}
            onChange={setKeyId}
          />
        </label>
      </div>

      <CodeCard
        className="flex-1"
        title={t("api.generated")}
        code={code}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(code);
              toast.success(t("cell.copied"));
            }}
          >
            <Icon as={CopyIcon} size={14} />
            {t("cell.copy")}
          </Button>
        }
      />
    </div>
  );
}
