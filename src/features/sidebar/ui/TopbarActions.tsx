import { BellIcon, EllipsisIcon, LinkIcon, StarIcon, UserIcon, type LucideIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/shared/api/use-session";
import { toast } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tooltip } from "@/shared/ui/tooltip";

/**
 * Правая часть верхней полосы — как у `.topbar` прототипа
 * (docs/REDESIGN.md, 4.3): колокольчик, «в избранное», аватар, «…».
 *
 * Уведомлений и избранного у нас пока нет — кнопки стоят заглушками со
 * «скоро», как ряд модулей. Красной точки на колокольчике нет: она
 * сообщала бы о непрочитанном, которого не бывает.
 *
 * Аватар — меню профиля: кто вошёл и «Мой профиль». Тема, язык и выход
 * остаются в меню шапки сайдбара — так решено, второго места для них нет.
 */
export function TopbarActions() {
  const { t } = useTranslation();
  const profile = useSession().getProfile();
  const navigate = useNavigate();

  const name = profile?.name || t("workspace.noName");

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Soon icon={BellIcon} label={t("topbar.notificationsSoon")} />
      <Soon icon={StarIcon} label={t("topbar.favoritesSoon")} />

      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t("topbar.profile")}
            title={t("topbar.profile")}
            className={`grid h-7 place-items-center rounded-[5px] px-1 transition-colors hover:bg-surface-hover ${
              open ? "bg-surface-hover" : ""
            }`}
          >
            <UserAvatar name={name} photo={profile?.photo} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-64">
            <div className="flex items-center gap-2.5 px-2.5 py-1.5">
              <UserAvatar name={name} photo={profile?.photo} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{name}</p>
                <p className="truncate text-xs text-fg-muted">
                  {[profile?.role, profile?.company].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <PopoverSeparator />
            <PopoverItem
              icon={<Icon as={UserIcon} />}
              onClick={() => {
                close();
                void navigate({ to: "/settings", search: { section: "profile" } });
              }}
            >
              {t("topbar.myProfile")}
            </PopoverItem>
          </div>
        )}
      </Popover>

      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <TopbarButton icon={EllipsisIcon} label={t("topbar.more")} open={open} onClick={toggle} />
        )}
      >
        {(close) => (
          <PopoverItem
            icon={<Icon as={LinkIcon} />}
            onClick={() => {
              close();
              void navigator.clipboard.writeText(window.location.href).then(
                () => toast.success(t("topbar.linkCopied")),
                () => toast.error(t("topbar.linkCopyFailed")),
              );
            }}
          >
            {t("topbar.copyLink")}
          </PopoverItem>
        )}
      </Popover>
    </div>
  );
}

/** `.tb-btn.icon` прототипа: 28px, приглушённая, подложка при наведении. */
function TopbarButton({
  icon,
  label,
  open = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  open?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      title={label}
      className={`grid size-7 place-items-center rounded-[5px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ${
        open ? "bg-surface-hover text-fg" : ""
      }`}
    >
      <Icon as={icon} />
    </button>
  );
}

function Soon({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Tooltip label={label} placement="bottom">
      {/* aria-disabled, а не disabled: отключённая кнопка в части
          браузеров глотает наведение, и «скоро» не показалось бы. */}
      <button
        type="button"
        aria-disabled="true"
        aria-label={label}
        className="grid size-7 cursor-default place-items-center rounded-[5px] text-fg-muted transition-colors hover:bg-surface-hover"
      >
        <Icon as={icon} />
      </button>
    </Tooltip>
  );
}

/** Аватар человека — `.avatar` прототипа: круг 24px, инициалы белым. */
function UserAvatar({
  name,
  photo,
  size = "md",
}: {
  name: string;
  photo?: string | undefined;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-9 text-sm" : "size-6 text-[11px]";

  if (photo) {
    return <img src={photo} alt="" className={`shrink-0 rounded-full object-cover ${box}`} />;
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0]?.[0] ?? "")).toUpperCase();

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-accent-solid font-semibold tracking-[0.2px] text-accent-fg ${box}`}
    >
      {letters}
    </span>
  );
}
