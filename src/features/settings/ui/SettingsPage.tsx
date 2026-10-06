import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import { ActivityLog } from "./ActivityLog";
import { ApiSettings } from "./ApiSettings";
import { BillingSettings } from "./BillingSettings";
import { BrandSettings } from "./BrandSettings";
import { ClientTypeSettings } from "./ClientTypeSettings";
import { CodeSettings } from "./CodeSettings";
import { CompanySettings } from "./CompanySettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { DatabaseSettings } from "./DatabaseSettings";
import { DirectorySettings } from "./DirectorySettings";
import { EndpointSettings } from "./EndpointSettings";
import { LocaleSettings } from "./LocaleSettings";
import { ProfileSettings } from "./ProfileSettings";
import { RecordSettings } from "./RecordSettings";
import { RoleSettings } from "./RoleSettings";
import { UserSettings } from "./UserSettings";
import { ResourceSettings } from "./resources/ResourceSettings";
import { useSettingsSections } from "./sections";

/**
 * Настройки — страница, как `settings.html` прототипа (docs/REDESIGN.md,
 * 4.5): у каждого раздела свой адрес (`/settings?section=…`), вход —
 * пунктом «Настройки» в папке «Система» модуля.
 *
 * Сверху — полоса вкладок модулей (`.set-tabs`): «Общие» — платформа,
 * остальные — справочники модулей (directories.ts). Вкладка без единого
 * справочника не заводится: пустая вкладка — обещание.
 *
 * Разделы и их группы — в `sections.ts`.
 *
 * Пустых пунктов нет: пункт, который ничего не открывает, — это
 * обещание. Разделы, которых у нас нет намеренно, перечислены
 * с причинами в docs/PARITY.md.
 *
 * Содержимое монтируется только у открытого раздела — значит и запросы
 * уходят только у него.
 */
const CONTENT: Record<string, () => React.JSX.Element> = {
  profile: ProfileSettings,
  company: CompanySettings,
  brand: BrandSettings,
  locale: LocaleSettings,
  clientTypes: ClientTypeSettings,
  users: UserSettings,
  roles: RoleSettings,
  api: ApiSettings,
  endpoints: EndpointSettings,
  code: CodeSettings,
  connections: ConnectionSettings,
  database: DatabaseSettings,
  billing: BillingSettings,
  resources: ResourceSettings,
  activity: ActivityLog,
};

/**
 * Тело страницы под верхней полосой: вкладки модулей, навигация
 * разделов 240px на заливке сайдбара (`.set-nav`) и сам раздел.
 */
export function SettingsPage({ section }: { section: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tabs, tab, groups, active } = useSettingsSections(section);
  const Content = active ? CONTENT[active.id] : undefined;
  /* Элемент, а не компонент: справочник — один экран с разными данными,
     и собранная на лету функция-компонент сбрасывала бы его состояние
     на каждом рендере. */
  const content = active?.directory ? (
    <DirectorySettings directory={active.directory} />
  ) : active?.record ? (
    <RecordSettings section={active.record} />
  ) : (
    Content && <Content />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Линия сверху — своя: у верхней полосы её нет, как у `.topbar`. */}
      <div className="flex h-11.5 shrink-0 items-stretch border-y border-border px-4">
        {/* Вкладка ведёт в свой первый раздел: своего адреса у вкладки
            нет, она — группа разделов. */}
        <Tabs
          /* Модуль — белой иконкой на своём цвете, как `.dn-mic` прототипа;
             «Общие» — простой иконкой. */
          tabs={tabs.map((item) =>
            item.tint
              ? {
                  id: item.id,
                  label: t(item.labelKey),
                  iconNode: (
                    <span
                      className={`grid size-4.5 shrink-0 place-items-center rounded-[5px] text-accent-fg ${item.tint}`}
                    >
                      <Icon as={item.icon} size={12} />
                    </span>
                  ),
                }
              : { id: item.id, label: t(item.labelKey), icon: item.icon },
          )}
          activeId={tab?.id ?? ""}
          onSelect={(id) => {
            const first = tabs.find((item) => item.id === id)?.groups[0]?.items[0];
            if (first) void navigate({ to: "/settings", search: { section: first.id } });
          }}
        />
      </div>

      {/* На узком экране навигация ложится полосой над разделом,
          как у прототипа ниже 820px: подписи групп прячутся. */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
        <nav
          aria-label={t("workspace.settings")}
          className="flex gap-0.5 overflow-x-auto border-b border-border bg-bg px-2 py-1.5 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:py-3"
        >
          {groups.map((group) => (
            <div key={group.titleKey} className="contents">
              <p className="hidden px-2 pt-2.5 pb-1 text-xs font-semibold text-fg-subtle md:block">
                {t(group.titleKey)}
              </p>

              {group.items.map((item) => (
                /* `.sb-item` прототипа — та же строка 28px, что у пунктов
                   меню в сайдбаре: выбранный — подложкой и основным цветом. */
                <Link
                  key={item.id}
                  to="/settings"
                  search={{ section: item.id }}
                  className={`flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors ${
                    active?.id === item.id
                      ? "bg-surface-active text-fg"
                      : "text-fg-muted hover:bg-surface-hover"
                  }`}
                >
                  <Icon as={item.icon} className="shrink-0 text-fg-subtle" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* key — прокрутка и черновики раздела не переезжают в соседний. */}
        {content &&
          (active?.wide ? (
            /* Отступы — те же, что у узких (`.set-body` прототипа, 32×60),
               потолок 1180px — `.set-sec.wide`. Прокрутка у раздела своя. */
            <div key={active.id} className="flex min-h-0 min-w-0 flex-col px-4 pt-5 md:px-15 md:pt-8">
              <div className="flex min-h-0 w-full max-w-295 flex-1 flex-col">
                {content}
              </div>
            </div>
          ) : (
            <div key={active?.id} className="min-w-0 overflow-y-auto px-4 pt-5 pb-20 md:px-15 md:pt-8 md:pb-25">
              <div className={active?.medium ? "max-w-245" : "max-w-190"}>
                {content}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
