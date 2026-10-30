import { useTranslation } from "react-i18next";
import { Building2Icon, BriefcaseIcon, LayersIcon, ListFilterIcon, MapIcon, NetworkIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";
import { activeFilterCount, FilterBar, MAX_LIMIT, useItems, type Item } from "@/features/item";
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
        on={activeFilterCount(settings.own) > 0}
        onClick={settings.toggleOpen}
      />

      {grouping && <RegionButton viewId={viewId} />}

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
      filters={settings.own}
      sorts={[]}
      onFilters={settings.setWhere}
      onSorts={() => {}}
    />
  );
}

/**
 * «Регион» — фильтр прототипа (`attendance.html`, `schedule.html`).
 * Регион с вложенными: «Ташкент» отбирает и его районы.
 */
function RegionButton({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const settings = useScheduleSettings(viewId);
  const { page } = useItems("core_regions", { limit: MAX_LIMIT, page: 1, relations: false });
  const rows = page.rows.filter((row) => row.is_active !== false || row.guid === settings.region);
  const name = (row: Item | undefined) => String(row?.name ?? "");
  const picked = rows.find((row) => row.guid === settings.region);

  /* Деревом: корни, под каждым — его дети, с отступом по глубине. */
  const tree: { row: Item; depth: number }[] = [];
  const walk = (parent: string, depth: number) =>
    rows
      .filter((row) => String(row.core_regions_id ?? "") === parent)
      .sort((a, b) => name(a).localeCompare(name(b)))
      .forEach((row) => {
        tree.push({ row, depth });
        walk(String(row.guid), depth + 1);
      });
  walk("", 0);

  if (!rows.length) return null;
  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <ToolButton
          icon={MapIcon}
          label={t("schedule.region")}
          {...(picked ? { text: name(picked) } : {})}
          open={open}
          on={Boolean(picked)}
          onClick={toggle}
        />
      )}
    >
      {(close) => (
        <div className="max-h-80 overflow-y-auto">
          <PopoverItem
            active={!settings.region}
            onClick={() => {
              settings.setRegion("");
              close();
            }}
          >
            {t("schedule.allRegions")}
          </PopoverItem>
          {tree.map(({ row, depth }) => (
            <PopoverItem
              key={String(row.guid)}
              active={row.guid === settings.region}
              onClick={() => {
                settings.setRegion(String(row.guid));
                close();
              }}
            >
              <span style={{ paddingLeft: depth * 14 }}>{name(row)}</span>
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
