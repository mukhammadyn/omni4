import { useTranslation } from "react-i18next";
import {
  AlarmClockIcon,
  CircleDotIcon,
  FlagIcon,
  LayersIcon,
  MapPinIcon,
  NetworkIcon,
  Rows3Icon,
  UserSearchIcon,
  type LucideIcon,
} from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { ToolButton } from "@/shared/ui/tool-button";
import {
  PLAN_GROUPS,
  PLAN_HEIGHTS,
  PLAN_ROW_PARTS,
  usePlanSettings,
  type PlanGroup,
  type PlanRowPart,
} from "./plan-settings";

export const GROUP_ICON: Record<PlanGroup, LucideIcon> = {
  branch: MapPinIcon,
  dept: NetworkIcon,
  status: CircleDotIcon,
  priority: FlagIcon,
  recruiter: UserSearchIcon,
};

const PART_ICON: Record<PlanRowPart, LucideIcon> = {
  status: CircleDotIcon,
  dept: NetworkIcon,
  branch: MapPinIcon,
  deadline: AlarmClockIcon,
};

/**
 * Кнопки «Планирования» в строке вкладок — `vtG` и «Строка» тулбара
 * прототипа: группировка и вид строки. Личные, как и период: пишут
 * в ui-store, а не в настройки view (plan-settings).
 */
export function VacancyPlanTools({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const settings = usePlanSettings(viewId);

  return (
    <>
      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <ToolButton
            icon={LayersIcon}
            label={t("view.groupBy")}
            text={t(`vacancy.plan.by.${settings.group}`)}
            open={open}
            on
            onClick={toggle}
          />
        )}
      >
        {(close) =>
          PLAN_GROUPS.map((key) => (
            <PopoverItem
              key={key}
              icon={<Icon as={GROUP_ICON[key]} size={16} className="shrink-0 text-fg-muted" />}
              active={settings.group === key}
              onClick={() => {
                settings.setGroup(key);
                close();
              }}
            >
              {t(`vacancy.plan.by.${key}`)}
            </PopoverItem>
          ))
        }
      </Popover>

      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <ToolButton icon={Rows3Icon} label={t("vacancy.plan.row")} open={open} onClick={toggle} />
        )}
      >
        {() => (
          <div className="w-72">
            <Heading>{t("vacancy.plan.row")}</Heading>
            {PLAN_ROW_PARTS.map((part) => (
              <label
                key={part}
                className="flex h-7.5 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-fg transition-colors hover:bg-surface-hover"
              >
                <Icon as={PART_ICON[part]} size={16} className="shrink-0 text-fg-muted" />
                <span className="flex-1 truncate">{t(`vacancy.plan.part.${part}`)}</span>
                <Checkbox checked={settings.shows(part)} onChange={() => settings.toggle(part)} />
              </label>
            ))}

            <PopoverSeparator />

            <Heading>{t("vacancy.plan.height")}</Heading>
            <div className="mx-1.5 mb-1 flex rounded-md bg-surface-hover p-0.5">
              {PLAN_HEIGHTS.map((height) => (
                <button
                  key={height}
                  type="button"
                  aria-pressed={settings.height === height}
                  onClick={() => settings.setHeight(height)}
                  className={`h-6 flex-1 rounded-[5px] text-xs transition-colors ${
                    settings.height === height
                      ? "bg-surface font-medium text-fg shadow-raised"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {t(`vacancy.plan.heights.${height}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>
    </>
  );
}

function Heading({ children }: { children: string }) {
  return <div className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-fg-subtle">{children}</div>;
}
