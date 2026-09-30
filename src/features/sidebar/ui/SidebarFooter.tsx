import { UserPlusIcon, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SettingsDialog } from "@/features/settings";
import { Icon } from "@/shared/ui/icon";

/**
 * Низ сайдбара — `.sb-bottom` прототипа (docs/REDESIGN.md, 4.2): над
 * линией «Пригласить участников». Тема, язык и выход — в меню шапки
 * сайдбара (WorkspaceHeader).
 */
export function SidebarFooter() {
  const { t } = useTranslation();
  const [inviting, setInviting] = useState(false);

  return (
    /* Высота — 44px вместе с линией, как у подвала таблицы (GridFooter,
       `h-11`): обе полосы у нижнего края, и их линии стоят вровень. */
    <div className="-mx-2 -mb-2 flex h-11 shrink-0 flex-col justify-center border-t border-border px-2">
      <FooterRow icon={UserPlusIcon} onClick={() => setInviting(true)}>
        {t("workspace.invite")}
      </FooterRow>

      {inviting && <SettingsDialog initialSection="users" onClose={() => setInviting(false)} />}
    </div>
  );
}

/** Строка низа — те же 28px и приглушённый текст, что у пунктов меню выше. */
function FooterRow({
  icon,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover"
    >
      <Icon as={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
