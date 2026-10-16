import { useTranslation } from "react-i18next";
import { Building2Icon, BriefcaseIcon, LayersIcon, ListFilterIcon, NetworkIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";
import { FilterBar } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { ToolButton } from "@/shared/ui/tool-button";
import { EMPLOYEES } from "../api/employee";
import { SCHEDULE_GROUPS, useScheduleSettings, type ScheduleGroup } from "./schedule-settings";

const ICON: Record<Exclude<ScheduleGroup, "none">, LucideIcon> = {
  dept: NetworkIcon,
  location: Building2Icon,
  position: BriefcaseIcon,
};

/**
 * Кнопки календаря графика и экранов посещаемости в строке вкладок:
 * фильтр — как у таблицы (открывает полосу PeopleFilterBar), и группировка.
 * Личные, как и период: пишут в ui-store (schedule-settings).
 */
export function ScheduleTools({ viewId, grouping = true }: { viewId: string; /** Сводным (зарплата, бюджет) группировка не нужна. */ grouping?: boolean }) {
  const { t } = useTranslation();
  const settings = useScheduleSettings(viewId);

  return (
    <>
      <ToolButton
        icon={ListFilterIcon}
        label={t("table.filter")}
        open={settings.open}
        on={settings.active > 0}
        onClick={settings.toggleOpen}
      />

      {grouping && (
      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <ToolButton
            icon={LayersIcon}
            label={t("view.groupBy")}
            {...(settings.group !== "none" ? { text: t(`schedule.by.${settings.group}`) } : {})}
            open={open}
            on={settings.group !== "none"}
            onClick={toggle}
          />
        )}
      >
        {(close) =>
          SCHEDULE_GROUPS.map((key) => (
            <PopoverItem
              key={key}
              {...(key !== "none" ? { icon: <Icon as={ICON[key]} size={16} className="shrink-0 text-fg-muted" /> } : {})}
              active={settings.group === key}
              onClick={() => {
                settings.setGroup(key);
                close();
              }}
            >
              {t(`schedule.by.${key}`)}
            </PopoverItem>
          ))
        }
      </Popover>
      )}
    </>
  );
}

/**
 * Полоса отбора сотрудников — та же FilterBar, что у таблицы, по полям
 * `hr_employees`: экраны графика и посещаемости строят строки по людям.
 */
export function PeopleFilterBar({
  viewId,
  language,
  tableSlug = EMPLOYEES,
}: {
  viewId: string;
  language: string;
  /** По чьим полям отбор. Сводные (зарплата, бюджет) — по своей таблице. */
  tableSlug?: string;
}) {
  const settings = useScheduleSettings(viewId);
  const { schema } = useTableSchema(tableSlug);
  if (!settings.open) return null;
  return (
    <FilterBar
      columns={schema.fields}
      relations={schema.relations}
      language={language}
      filters={settings.where}
      sorts={[]}
      onFilters={settings.setWhere}
      onSorts={() => {}}
    />
  );
}
