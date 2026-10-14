import { useTranslation } from "react-i18next";
import { Building2Icon, FilterIcon, LayersIcon, LayoutTemplateIcon, NetworkIcon, XIcon, type LucideIcon } from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { ToolButton } from "@/shared/ui/tool-button";
import { useScheduleDirectory, useTemplates } from "../api/schedule";
import { SCHEDULE_FILTERS, SCHEDULE_GROUPS, useScheduleSettings, type ScheduleFilter, type ScheduleGroup } from "./schedule-settings";

const ICON: Record<Exclude<ScheduleGroup, "none">, LucideIcon> = {
  dept: NetworkIcon,
  location: Building2Icon,
  template: LayoutTemplateIcon,
};

/** Отбор «без шаблона» — сотрудник, у которого шаблона нет ни в сменах, ни в карточке. */
export const NO_TEMPLATE = "";

/**
 * Кнопки календаря графика в строке вкладок — `vtG` и фильтр тулбара
 * прототипа. Личные, как и период: пишут в ui-store (schedule-settings).
 */
export function ScheduleTools({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const settings = useScheduleSettings(viewId);
  const directory = useScheduleDirectory();
  const { templates } = useTemplates();
  const options: Record<ScheduleFilter, { id: string; name: string }[]> = {
    dept: directory.departments,
    location: directory.locations,
    template: [...templates.map(({ id, name }) => ({ id, name })), { id: NO_TEMPLATE, name: t("schedule.noTemplate") }],
  };

  return (
    <>
      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <ToolButton
            icon={FilterIcon}
            label={t("schedule.filter")}
            {...(settings.active ? { text: String(settings.active) } : {})}
            open={open}
            on={settings.active > 0}
            onClick={toggle}
          />
        )}
      >
        {() => (
          <div className="max-h-[60vh] w-72 overflow-auto">
            {SCHEDULE_FILTERS.map((filter, index) => (
              <div key={filter}>
                {index > 0 && <PopoverSeparator />}
                <div className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-fg-subtle">{t(`schedule.by.${filter}`)}</div>
                {options[filter].map((option) => (
                  <label
                    key={option.id || "none"}
                    className="flex h-7.5 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-fg transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex-1 truncate">{option.name || "—"}</span>
                    <Checkbox checked={settings.values(filter).includes(option.id)} onChange={() => settings.toggle(filter, option.id)} />
                  </label>
                ))}
              </div>
            ))}
            {settings.active > 0 && (
              <>
                <PopoverSeparator />
                <PopoverItem icon={<Icon as={XIcon} size={16} className="shrink-0 text-fg-muted" />} onClick={settings.clear}>
                  {t("schedule.clearFilters")}
                </PopoverItem>
              </>
            )}
          </div>
        )}
      </Popover>

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
    </>
  );
}
