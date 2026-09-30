import { useEffect, useState } from "react";
import {
  BuildingIcon,
  DatabaseIcon,
  HistoryIcon,
  IdCardIcon,
  LayoutGridIcon,
  PlugIcon,
  RouteIcon,
  ServerIcon,
  ShieldCheckIcon,
  SquareFunctionIcon,
  SquareTerminalIcon,
  UserIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGlobalRight } from "@/features/auth";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { ActivityLog } from "./ActivityLog";
import { ApiKeySettings } from "./ApiKeySettings";
import { ClientTypeSettings } from "./ClientTypeSettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { EndpointSettings } from "./EndpointSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { FunctionSettings } from "./FunctionSettings";
import { MicrofrontendSettings } from "./MicrofrontendSettings";
import { ProfileSettings } from "./ProfileSettings";
import { ProjectSettings } from "./ProjectSettings";
import { RoleSettings } from "./RoleSettings";
import { SqlConsole } from "./SqlConsole";
import { UserSettings } from "./UserSettings";
import { ResourceSettings } from "./resources/ResourceSettings";

/**
 * Настройки — окно, а не страница.
 *
 * Их открывают из любого места и закрывают, вернувшись туда же: страница
 * означала бы, что человек уходит с таблицы, на которую потом должен
 * попасть обратно сам. В старой админке это тоже окно (SettingsPopup),
 * и там же лежит причина: настроек два десятка разделов, а работают
 * люди не в них.
 *
 * Разделы сгруппированы по тому, ЧЬИ это настройки: свои, проекта и
 * его внешних границ (ключи, адреса, чужие базы, ресурсы, журнал).
 * Группа — не украшение: одиннадцать пунктов подряд читаются как
 * список, а не как структура, и «Окружения» теряются между «Профилем»
 * и «API-ключами».
 *
 * Пустых пунктов нет: пункт, который ничего не открывает, — это
 * обещание. Разделы, которых у нас нет намеренно (биллинг), перечислены
 * с причинами в docs/PARITY.md.
 *
 * Содержимое монтируется только у открытого раздела — значит и запросы
 * уходят только у него. Восемь разделов, грузящихся разом при открытии
 * окна, — это восемь запросов ради одного, на который человек смотрит.
 */
type Section = {
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
   * Раздел сам занимает всю площадь: у него своя шапка, своя таблица
   * и своя прокрутка. Общий отступ таким только мешает.
   */
  wide?: boolean;
};

const GROUPS: {
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
  items: Section[];
}[] = [
  {
    titleKey: "settings.groupAccount",
    items: [
      { id: "profile", labelKey: "settings.profile", icon: UserIcon },
    ],
  },
  {
    titleKey: "settings.groupProject",
    right: "settings_button",
    items: [
      {
        id: "project",
        labelKey: "settings.project",
        icon: BuildingIcon,
        right: "project_settings_button",
      },
      {
        id: "environments",
        labelKey: "environments.title",
        icon: ServerIcon,
        right: "environments_button",
        wide: true,
      },
      {
        id: "clientTypes",
        labelKey: "clientTypes.title",
        icon: IdCardIcon,
        wide: true,
      },
      { id: "users", labelKey: "users.title", icon: UsersIcon, wide: true },
      { id: "roles", labelKey: "settings.roles", icon: ShieldCheckIcon, wide: true },
    ],
  },
  {
    titleKey: "settings.groupDeveloper",
    right: "settings_button",
    items: [
      {
        id: "apiKeys",
        labelKey: "apiKeys.title",
        icon: WebhookIcon,
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
      { id: "functions", labelKey: "functions.title", icon: SquareFunctionIcon, wide: true },
      {
        id: "microfrontends",
        labelKey: "microfrontends.title",
        icon: LayoutGridIcon,
        wide: true,
      },
      { id: "connections", labelKey: "connections.title", icon: DatabaseIcon, wide: true },
      /* Своего права у консоли нет: в GLOBAL_RIGHTS такой кнопки не
         заводили. Значит её видит тот же, кто видит настройки проекта
         целиком, — групповое `settings_button`. */
      { id: "sql", labelKey: "sql.title", icon: SquareTerminalIcon, wide: true },
      { id: "resources", labelKey: "resources.title", icon: PlugIcon, wide: true },
      {
        id: "activity",
        labelKey: "activity.title",
        icon: HistoryIcon,
        right: "version_button",
        wide: true,
      },
    ],
  },
];

const CONTENT: Record<string, () => React.JSX.Element> = {
  profile: ProfileSettings,
  project: ProjectSettings,
  environments: EnvironmentSettings,
  clientTypes: ClientTypeSettings,
  users: UserSettings,
  roles: RoleSettings,
  apiKeys: ApiKeySettings,
  endpoints: EndpointSettings,
  functions: FunctionSettings,
  microfrontends: MicrofrontendSettings,
  connections: ConnectionSettings,
  sql: SqlConsole,
  resources: ResourceSettings,
  activity: ActivityLog,
};

export function SettingsDialog({
  onClose,
  initialSection = "profile",
}: {
  onClose: () => void;
  /** С какого раздела открыть: «Пригласить участников» ведёт сразу в «Пользователей». */
  initialSection?: string;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState(initialSection);

  /*
   * Права спрашиваются по одному и всегда: хук нельзя звать в цикле
   * по видимым разделам — их число менялось бы между рендерами.
   * Названия — из GLOBAL_RIGHTS, то есть из тех же галок, что админ
   * ставит роли.
   */
  const allowed: Record<string, boolean> = {
    settings_button: useGlobalRight("settings_button"),
    project_settings_button: useGlobalRight("project_settings_button"),
    environments_button: useGlobalRight("environments_button"),
    api_keys_button: useGlobalRight("api_keys_button"),
    redirects_button: useGlobalRight("redirects_button"),
    version_button: useGlobalRight("version_button"),
  };

  const groups = GROUPS.filter((group) => !group.right || allowed[group.right])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.right || allowed[item.right]),
    }))
    .filter((group) => group.items.length);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const items = groups.flatMap((group) => group.items);
  const active = items.find((item) => item.id === section) ?? items[0];
  const Content = active ? CONTENT[active.id] : undefined;

  return (
    <Modal onClose={onClose}>
      {/* Окно широкое: в правах помещается матрица «таблица × право»,
          а она не сжимается — колонок одиннадцать. На узком экране
          растягивается до его краёв. */}
      <div className="flex h-[min(48rem,92vh)] w-full max-w-[min(84rem,96vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
        {/* Список разделов слева: их немного, и прятать их в выпадающий
            список значит заставлять открывать его на каждый переход. */}
        <nav className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-bg p-2">
          {groups.map((group) => (
            <div key={group.titleKey} className="flex flex-col gap-0.5">
              <span className="px-2 py-1 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
                {t(group.titleKey)}
              </span>

              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
                    active?.id === item.id
                      ? "bg-surface text-fg shadow-raised"
                      : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  <Icon as={item.icon} size={16} className="shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-header shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="flex-1 text-sm font-medium">
              {t(active?.labelKey ?? "workspace.settings")}
            </span>

            <button
              type="button"
              onClick={onClose}
              aria-label={t("action.close")}
              title={t("action.close")}
              className="grid size-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Icon as={XIcon} size={16} />
            </button>
          </header>

          {Content &&
            (active?.wide ? (
              <Content />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <Content />
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}
