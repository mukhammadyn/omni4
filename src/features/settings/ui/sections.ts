import {
  BracesIcon,
  Building2Icon,
  CableIcon,
  CreditCardIcon,
  DatabaseIcon,
  HistoryIcon,
  IdCardIcon,
  GlobeIcon,
  KeyRoundIcon,
  PaletteIcon,
  PlugIcon,
  RouteIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useGlobalRight } from "@/features/auth";
import type { TranslationKey } from "@/shared/lib/i18n";
import { DIRECTORY_TABS, type Directory, type RecordSection } from "./directories";

/**
 * Разделы настроек и их группы — отдельно от самих разделов: крошки
 * в верхней полосе называют открытый раздел, и тянуть ради подписи
 * все экраны настроек в общий бандл незачем.
 *
 * Группы — как навигация прототипа: основное, люди и доступ,
 * интеграции, разработка, журнал. Личный профиль — в конце,
 * «Аккаунтом»: в прототипе он вне настроек пространства, но свой
 * экран ему заводить незачем.
 */
export type SettingsSection = {
  id: string;
  labelKey: TranslationKey;
  icon: typeof UserIcon;
  /**
   * Глобальное право роли, без которого раздела не видно. Совпадает
   * с именами кнопок из прав (`GLOBAL_RIGHTS`): это те самые галки,
   * которые админ ставит роли на вкладке «Приложение».
   */
  right?: string;
  /**
   * Раздел сам занимает всю площадь: у него своя таблица и своя
   * прокрутка. Узкие разделы — строки «подпись — значение» колонкой
   * 760px, как `.set-sec` прототипа.
   */
  wide?: boolean;
  /**
   * Право раздела ЗАМЕНЯЕТ групповое, а не добавляется к нему. Тариф
   * стоит в «Основных», как у прототипа, но старая админка показывала
   * его по одному `billing`, в личной группе
   * (`useSettingsPopupProps.jsx:87`, `:160`): роль с биллингом и без
   * настроек проекта иначе его потеряла бы.
   */
  ownRight?: boolean;
  /**
   * Узкий раздел пошире — 980px, как `#s-profile` прототипа: строки
   * «подпись — значение» и под ними таблица.
   */
  medium?: boolean;
  /** Раздел — справочник модуля: открывается общим экраном (DirectorySettings). */
  directory?: Directory;
  /** Раздел — одна строка таблицы Ядра (RecordSettings). */
  record?: RecordSection;
};

export type SettingsGroup = {
  titleKey: TranslationKey;
  /**
   * Право на ГРУППУ целиком. `settings_button` — это не кнопка окна,
   * как читается по имени, а разрешение на настройки ПРОЕКТА: без него
   * старая админка выбрасывает из окна всё, кроме личной группы
   * (`useSettingsPopupProps.jsx:286` — `tabs.splice(1)`).
   *
   * Поэтому право стоит на группе, а не на каждом разделе: у половины
   * разделов своего права нет вовсе, и без группового они оставались бы
   * видны роли, которой настройки проекта запрещены целиком.
   */
  right?: string;
  items: SettingsSection[];
};

/** Вкладка модуля над разделами — `.set-tabs` прототипа. */
export type SettingsTab = {
  id: string;
  labelKey: TranslationKey;
  icon: typeof UserIcon;
  /** Цветная плашка иконки модуля. Нет — иконка без плашки, как у «Общих». */
  tint?: string;
  groups: SettingsGroup[];
};

const GROUPS: SettingsGroup[] = [
  {
    titleKey: "settings.groupMain",
    right: "settings_button",
    items: [
      /* `#s-profile` прототипа: логотип и название проекта, реквизиты
         юрлица «Основное» из Ядра и окружения одним разделом. Шире
         остальных узких — в нём таблица окружений. */
      { id: "company", labelKey: "core.company", icon: Building2Icon, medium: true },
      { id: "brand", labelKey: "core.brand", icon: PaletteIcon },
      /* Пояс, формат даты, валюта и НДС — `org_settings` Ядра; ниже
         языки данных проекта и курсы валют. */
      { id: "locale", labelKey: "core.locale", icon: GlobeIcon },
      {
        id: "billing",
        labelKey: "billing.title",
        icon: CreditCardIcon,
        right: "billing",
        ownRight: true,
      },
    ],
  },
  {
    titleKey: "settings.groupAccess",
    right: "settings_button",
    items: [
      { id: "users", labelKey: "users.title", icon: UsersIcon, wide: true },
      { id: "roles", labelKey: "settings.roles", icon: ShieldCheckIcon, wide: true },
      {
        id: "clientTypes",
        labelKey: "clientTypes.title",
        icon: IdCardIcon,
        wide: true,
      },
    ],
  },
  {
    titleKey: "settings.groupIntegrations",
    right: "settings_button",
    items: [
      { id: "resources", labelKey: "resources.title", icon: PlugIcon, wide: true },
      /* Не DatabaseIcon: он у раздела «База данных» — своей базы проекта.
         Здесь — провод к чужой. */
      { id: "connections", labelKey: "connections.title", icon: CableIcon, wide: true },
    ],
  },
  {
    titleKey: "settings.groupDeveloper",
    right: "settings_button",
    items: [
      /* API — SDK и ключи одним разделом (ApiSettings). Право — то же,
         что было у ключей: SDK без ключа бесполезен. */
      {
        id: "api",
        labelKey: "api.title",
        icon: KeyRoundIcon,
        right: "api_keys_button",
        wide: true,
      },
      {
        id: "endpoints",
        labelKey: "endpoints.title",
        icon: RouteIcon,
        right: "redirects_button",
        wide: true,
      },
      /* «Код» прототипа: фронтенд и функции вкладками одного раздела. */
      { id: "code", labelKey: "core.code", icon: BracesIcon, wide: true },
      /* Таблицы, схема и SQL-консоль (DatabaseSettings). Своего права
         у раздела нет: в GLOBAL_RIGHTS такой кнопки не заводили. Значит
         его видит тот же, кто видит настройки проекта целиком, —
         групповое `settings_button`. */
      { id: "database", labelKey: "database.title", icon: DatabaseIcon, wide: true },
    ],
  },
  {
    titleKey: "settings.groupMonitoring",
    right: "settings_button",
    items: [
      {
        id: "activity",
        labelKey: "activity.title",
        /* «Логи» прототипа. */
        icon: HistoryIcon,
        right: "version_button",
        wide: true,
      },
    ],
  },
  {
    titleKey: "settings.groupAccount",
    items: [{ id: "profile", labelKey: "settings.profile", icon: UserIcon }],
  },
];

/**
 * «Общие» — платформа ucode; остальные вкладки — справочники модулей
 * (directories.ts). Право на них то же, что на настройки проекта
 * целиком: справочник модуля правит тот же, кто правит проект.
 */
const TABS: SettingsTab[] = [
  { id: "common", labelKey: "settings.tabCommon", icon: SettingsIcon, groups: GROUPS },
  ...DIRECTORY_TABS.map((tab) => ({
    id: tab.id,
    labelKey: tab.labelKey,
    icon: tab.icon,
    tint: tab.tint,
    groups: tab.groups.map((group) => ({
      titleKey: group.titleKey,
      right: "settings_button",
      items: group.items.map((item) =>
        "fields" in item
          ? { id: item.id, labelKey: item.titleKey, icon: item.icon, record: item }
          : { id: item.id, labelKey: item.titleKey, icon: item.icon, wide: true, directory: item },
      ),
    })),
  })),
];

/**
 * Вкладки и разделы, доступные роли, и открытый из них. Отдельным хуком:
 * крошки в верхней полосе называют тот же раздел, что открыт на странице.
 *
 * Вкладка — та, в которой лежит раздел из адреса: адрес у раздела один
 * (`?section=`), и ссылка на справочник открывает его вкладку сама.
 * Незнакомый или недоступный раздел открывает первый доступный, а не
 * пустоту: ссылку могли прислать из другой роли.
 */
export function useSettingsSections(section: string | undefined) {
  /*
   * Права спрашиваются по одному и всегда: хук нельзя звать в цикле
   * по видимым разделам — их число менялось бы между рендерами.
   */
  const allowed: Record<string, boolean> = {
    settings_button: useGlobalRight("settings_button"),
    project_settings_button: useGlobalRight("project_settings_button"),
    environments_button: useGlobalRight("environments_button"),
    api_keys_button: useGlobalRight("api_keys_button"),
    redirects_button: useGlobalRight("redirects_button"),
    version_button: useGlobalRight("version_button"),
    billing: useGlobalRight("billing"),
  };

  const tabs = TABS.map((tab) => ({
    ...tab,
    groups: tab.groups
      .map((group) => {
        const groupAllowed = !group.right || Boolean(allowed[group.right]);

        return {
          ...group,
          items: group.items.filter(
            (item) => (item.ownRight || groupAllowed) && (!item.right || allowed[item.right]),
          ),
        };
      })
      .filter((group) => group.items.length),
  })).filter((tab) => tab.groups.length);

  const items = tabs.flatMap((tab) => tab.groups.flatMap((group) => group.items));
  const active = items.find((item) => item.id === section) ?? items[0];
  const tab =
    tabs.find((candidate) =>
      candidate.groups.some((group) => group.items.some((item) => item.id === active?.id)),
    ) ?? tabs[0];

  return { tabs, tab, groups: tab?.groups ?? [], active };
}
