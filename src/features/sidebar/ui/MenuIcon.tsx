import {
  CalendarIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  FileIcon,
  FolderIcon,
  LayoutGridIcon,
  LinkIcon,
  PaintBucketIcon,
  SettingsIcon,
  Table2Icon,
  TablePropertiesIcon,
  UsersIcon,
  WebhookIcon,
  type LucideIcon,
} from "lucide-react";
import { DynamicIcon } from "@/shared/ui/dynamic-icon";
import { Icon } from "@/shared/ui/icon";
import { kindOf } from "../model/types";

/**
 * Иконка пункта меню.
 *
 * Сначала пробуем ту, что задал бэкенд (Iconify, URL или файл в CDN),
 * и только если её нет или она не загрузилась — рисуем свою по типу
 * пункта. Строка меню не остаётся пустой ни в один момент.
 */

/**
 * Тип пункта → иконка по умолчанию. Покрывает все типы бэкенда.
 * Экспортирован: тот же маппинг рисует пункты меню создания
 * (AddMenuButton) — второй список типов рядом был бы второй правдой.
 */
export const byType: Record<string, LucideIcon> = {
  FOLDER: FolderIcon,
  WIKI_FOLDER: FolderIcon,
  MINIO_FOLDER: PaintBucketIcon,
  TABLE: Table2Icon,
  LINK: LinkIcon,
  MICROFRONTEND: LayoutGridIcon,
  PIVOT: TablePropertiesIcon,
  REST: WebhookIcon,
  USER: UsersIcon,
  WEBPAGE: FileIcon,
  WIKI: FileIcon,
};

/** Популярные имена, которые присылает бэкенд, — на случай отказа CDN. */
const byName: Record<string, LucideIcon> = {
  settings: SettingsIcon,
  chart: ChartColumnIcon,
  calendar: CalendarIcon,
  table: Table2Icon,
  folder: FolderIcon,
  users: UsersIcon,
};

export function MenuIcon({ name, type }: { name: string; type: string }) {
  return <DynamicIcon name={name} fallback={<BuiltinIcon name={name} type={type} />} />;
}

function BuiltinIcon({ name, type }: { name: string; type: string }) {
  const fallback = kindOf(type) === "group" ? FolderIcon : Table2Icon;
  const component = byName[name] ?? byType[type] ?? fallback;

  return <Icon as={component} />;
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <Icon
      as={ChevronDownIcon}
      size={14}
      className={`transition-transform ${open ? "" : "-rotate-90"}`}
    />
  );
}
