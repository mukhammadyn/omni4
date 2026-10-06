import {
  CheckIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { logout } from "@/features/auth";
import { useWorkspaceTitle } from "@/features/settings";
import { WorkspaceSwitcher } from "@/features/workspace";
import { useSession } from "@/shared/api/use-session";
import { LOCALE_NAMES, LOCALES, setLocale, type Locale } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";
import { BrandMark } from "@/shared/ui/brand-mark";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";

/**
 * Шапка сайдбара — `.sb-workspace` прототипа (docs/REDESIGN.md, 4.2):
 * одна строка 36px, плитка с инициалами текущего проекта, его имя и
 * кнопка «свернуть». Пространство — это проект, а не компания: у одной
 * компании их несколько, и переключаются именно они.
 *
 * Меню — «Рабочее пространство», как `wsMenu` прототипа: карточка
 * проекта и приглашение. Настройки проекта — не здесь, а пунктом
 * «Настройки» в папке «Система» модуля, как в меню прототипа (`NAV`). Переключатель проектов остаётся
 * здесь же: в прототипе его нет, но без него проект не сменить. Ниже —
 * тема, язык (подменю, как `themeMenu` прототипа) и выход.
 *
 * Имя пользователя и роль — из ответа логина, отдельного запроса за
 * профилем нет. Имя проекта — из его карточки (useWorkspaceTitle).
 */
export function WorkspaceHeader({ floating = false }: { floating?: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const profile = useSession().getProfile();

  /*
   * Имя и логотип — текущего проекта, а не компании. Запрос проекта уже
   * сделан настройками и живёт в кэше пять минут; своего здесь нет.
   */
  const { title, logo, brand } = useWorkspaceTitle();
  const tile = { title, image: logo, brand };

  return (
    <>
      <Popover
        trigger={({ open, toggle }) => (
          /*
           * Подсветка — на ряду целиком, а не на кнопке поповера: кнопка
           * сворачивания стоит ВНУТРИ этой подсветки. Кнопки две, а не одна:
           * вложенных <button> не бывает, да и действия у них разные.
           */
          <div
            className={`flex h-9 items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface-hover ${
              open ? "bg-surface-hover" : ""
            }`}
          >
            <button
              type="button"
              onClick={toggle}
              className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left"
            >
              <WorkspaceTile {...tile} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</span>
            </button>

            <CollapseButton floating={floating} />
          </div>
        )}
      >
        {(close) => (
          <div className="w-72">
            <p className="px-2.5 pt-0.5 pb-1 text-2xs font-semibold text-fg-subtle">
              {t("workspace.menuTitle")}
            </p>
            <div className="flex items-center gap-2.5 px-2.5 py-1.5">
              <WorkspaceTile {...tile} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{title}</p>
                {/* Кто вошёл — строкой под проектом: отдельной карточки
                    профиля в этом меню больше нет. */}
                <p className="truncate text-xs text-fg-muted">
                  {[profile?.name || t("workspace.noName"), profile?.role].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>

            <PopoverSeparator />

            <PopoverItem
              icon={<Icon as={UserPlusIcon} />}
              onClick={() => {
                close();
                void navigate({ to: "/settings", search: { section: "users" } });
              }}
            >
              {t("workspace.invite")}
            </PopoverItem>

            <PopoverSeparator />

            {/* Ряд переключателя — компания, над списком её проектов. */}
            <WorkspaceSwitcher current={profile?.company || t("app.name")} onSwitched={close} />

            <PopoverSeparator />

            <ThemeItem />
            <LanguageItem />
            <LogoutItem onDone={close} />
          </div>
        )}
      </Popover>
    </>
  );
}

/**
 * Кнопка сворачивания — видна всегда, как `.sb-iconbtn` прототипа:
 * бледная, пока на неё не навели.
 */
function CollapseButton({ floating }: { floating: boolean }) {
  const { t } = useTranslation();
  const { toggleSidebar } = useUi();
  // У всплывающего сайдбара та же кнопка делает обратное: закрепляет его.
  const label = t(floating ? "sidebar.open" : "sidebar.collapse");

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
      /* Наведение красит `surface-active`, а не `surface-hover`: кнопка
         лежит внутри подсвеченного ряда, и второй такой же заливкой
         она бы на нём не проступила. */
      className="grid size-6.5 shrink-0 place-items-center rounded-[5px] text-fg-subtle transition-colors hover:bg-surface-active hover:text-fg-muted"
    >
      {/* Пара зеркальная: убрать панель — стрелки влево, вернуть —
          вправо. Тот же значок стоит на кнопке в шапке контента. */}
      <Icon as={floating ? ChevronsRightIcon : ChevronsLeftIcon} size={16} />
    </button>
  );
}

/**
 * Плитка рабочего пространства — `.ws-icon` прототипа: 22px, инициалы
 * компании белым по тёмному (в тёмной теме наоборот — `bg-fg`/`text-bg`
 * меняются сами). Логотип проекта, если загружен, — вместо инициалов.
 * Без компании — знак продукта.
 */
export function WorkspaceTile({
  title,
  image,
  brand,
  size = "md",
}: {
  title: string;
  image: string;
  brand: boolean;
  /** sm — 18px в крошках верхней полосы, как `.ws-icon` там у прототипа. */
  size?: "sm" | "md" | "lg";
}) {
  const box = {
    sm: "size-4.5 rounded-[4px] text-[8.5px]",
    md: "size-5.5 rounded-[5px] text-[10.5px]",
    lg: "size-9 rounded-lg text-sm",
  }[size];

  if (image) {
    return (
      <span className={`grid shrink-0 place-items-center overflow-hidden ${box}`}>
        <img src={image} alt="" className="size-full object-cover" />
      </span>
    );
  }

  if (brand) {
    return (
      <span className={`grid shrink-0 place-items-center text-fg ${box}`}>
        <BrandMark size={{ sm: 18, md: 22, lg: 36 }[size]} />
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center bg-fg font-bold tracking-[0.3px] text-bg ${box}`}
    >
      {initials(title)}
    </span>
  );
}

/** «Tech Market» → «TM», «Test123» → «T»: как «TM» у прототипа. */
function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0]?.[0] ?? "")).toUpperCase();
}


/**
 * Пункт с подменю: справа текущее значение и стрелка, варианты — отдельным
 * меню рядом, как `themeMenu` у прототипа. Выбор закрывает только подменю:
 * основное меню остаётся, и видно, что значение сменилось.
 */
function ChoiceItem<T extends string>({
  icon,
  label,
  value,
  options,
  onPick,
}: {
  icon: ReactNode;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? value;

  return (
    <Popover
      trigger={({ toggle }) => (
        <PopoverItem
          icon={icon}
          onClick={toggle}
          trailing={
            <span className="flex items-center gap-1 text-xs text-fg-subtle">
              {current}
              <Icon as={ChevronRightIcon} size={14} />
            </span>
          }
        >
          {label}
        </PopoverItem>
      )}
    >
      {(close) =>
        options.map((option) => (
          <PopoverItem
            key={option.value}
            onClick={() => {
              onPick(option.value);
              close();
            }}
            {...(option.value === value ? { trailing: <Icon as={CheckIcon} size={14} /> } : {})}
          >
            {option.label}
          </PopoverItem>
        ))
      }
    </Popover>
  );
}

/**
 * Тема живёт здесь, а не в настройках: её меняют по настроению, а не
 * один раз при заведении аккаунта.
 */
function ThemeItem() {
  const { t } = useTranslation();
  const { theme, setTheme } = useUi();

  return (
    <ChoiceItem
      icon={<Icon as={MoonIcon} />}
      label={t("sidebar.theme")}
      value={theme}
      options={(["light", "dark", "system"] as const).map((option) => ({
        value: option,
        label: t(`theme.${option}`),
      }))}
      onPick={setTheme}
    />
  );
}

function LanguageItem() {
  const { t, i18n } = useTranslation();
  const current = (LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : LOCALES[0];

  return (
    <ChoiceItem
      icon={<Icon as={LanguagesIcon} />}
      label={t("sidebar.language")}
      value={current}
      options={LOCALES.map((option) => ({ value: option, label: LOCALE_NAMES[option] }))}
      onPick={setLocale}
    />
  );
}

/**
 * Выход — с подтверждением: одно касание в конце меню не должно
 * выбрасывать из рабочего места посреди правки.
 */
function LogoutItem({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <PopoverItem danger icon={<Icon as={LogOutIcon} />} onClick={() => setAsking(true)}>
        {t("auth.signOut")}
      </PopoverItem>

      {asking && (
        <ConfirmDialog
          title={t("auth.signOutTitle")}
          description={t("auth.signOutDescription")}
          confirmLabel={t("auth.signOut")}
          busy={false}
          onConfirm={() => {
            setAsking(false);
            onDone();
            logout();
            void navigate({ to: "/login" });
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}
