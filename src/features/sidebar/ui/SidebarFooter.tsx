import { SettingsIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Icon } from "@/shared/ui/icon";

/**
 * Низ сайдбара — `.sb-bottom` прототипа (docs/REDESIGN.md, 4.2): над
 * линией вход в настройки. Пункт «Настройки» из папок модулей в дереве
 * не показывается — вход один, здесь. Тема, язык и выход — в меню шапки
 * сайдбара (WorkspaceHeader).
 */
export function SidebarFooter() {
  const { t } = useTranslation();
  const row =
    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover";

  return (
    /* Высота — 44px вместе с линией, как у подвала таблицы (GridFooter,
       `h-11`): обе полосы у нижнего края, и их линии стоят вровень. */
    <div className="-mx-2 -mb-2 flex h-11 shrink-0 flex-col justify-center border-t border-border px-2">
      {/* Горит на любом разделе настроек: раздел — в поиске адреса. */}
      <Link
        to="/settings"
        className={row}
        activeOptions={{ includeSearch: false }}
        activeProps={{ className: `${row} row-active text-fg` }}
      >
        <Icon as={SettingsIcon} />
        <span className="min-w-0 flex-1 truncate">{t("workspace.settings")}</span>
      </Link>
    </div>
  );
}
