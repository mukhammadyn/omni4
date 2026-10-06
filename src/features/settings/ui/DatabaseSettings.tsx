import { useState } from "react";
import { NetworkIcon, SquareTerminalIcon, Table2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tabs } from "@/shared/ui/tabs";
import { useDatabaseSize } from "../api/usage";
import { Quota, SectionHeader, formatSize } from "./parts";
import { SchemaDiagram } from "./SchemaDiagram";
import { SqlConsole } from "./SqlConsole";
import { TableBrowser } from "./TableBrowser";

/**
 * База данных — как в прототипе (`#s-dev-db`): шапка с занятым местом
 * и три вкладки — таблицы как есть, схема связей, SQL.
 *
 * Все три смотрят в базу ТЕКУЩЕГО окружения: в prod и dev строки,
 * схема и место разные. Об этом говорит подзаголовок, потому что
 * больше на экране это не видно ничем.
 *
 * Содержимое вкладки монтируется, только когда она открыта: диаграмма
 * и строки ходят в базу, и делать это за закрытой вкладкой незачем.
 */
export function DatabaseSettings() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState("tables");
  const { storage } = useDatabaseSize();

  const size = (mb: number) =>
    formatSize(mb, i18n.language, { mb: t("usage.mb"), gb: t("usage.gb") });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader title={t("database.title")} hint={t("database.hint")}>
        {storage && (
          <Quota
            label={t("database.quota")}
            used={size(storage.used)}
            limit={storage.limit ? size(storage.limit) : ""}
            percent={storage.percentUsed}
          />
        )}
      </SectionHeader>

      <div className="mb-3 shrink-0">
        <Tabs
          variant="segment"
          tabs={[
            { id: "tables", label: t("database.tabTables"), icon: Table2Icon },
            { id: "diagram", label: t("database.tabDiagram"), icon: NetworkIcon },
            { id: "sql", label: t("sql.title"), icon: SquareTerminalIcon },
          ]}
          activeId={tab}
          onSelect={setTab}
        />
      </div>

      {tab === "tables" && <TableBrowser />}
      {tab === "diagram" && <SchemaDiagram />}
      {tab === "sql" && <SqlConsole />}
    </div>
  );
}
