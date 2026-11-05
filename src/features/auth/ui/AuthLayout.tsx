import { useLayoutEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { applyTheme, useUi } from "@/shared/lib/ui-store";

/** Правая панель: заголовок, цвет модуля и скриншот. */
const ASIDES = {
  signin: { title: "auth.asideSignIn", bg: "bg-module-crm/10", screen: "/auth/signin.png" },
  signup: { title: "auth.asideSignUp", bg: "bg-module-hrms/10", screen: "/auth/signup.png" },
} as const;

/**
 * Общий каркас экранов входа и регистрации, как `signin.html` /
 * `signup.html` прототипа сайта (ucode_website): слева логотип, форма
 * по центру и подпись внизу, справа — панель цвета модуля со скриншотом
 * приложения. Уже lg панель прячется, остаётся одна колонка.
 *
 * Поля и кнопки здесь крупнее, чем в приложении (46px против 32–34),
 * как в прототипе: переопределены переменные размера, а не сами
 * компоненты — Input и Button остаются общими.
 */
export function AuthLayout({
  children,
  aside = "signin",
}: {
  children: ReactNode;
  aside?: keyof typeof ASIDES;
}) {
  const { t } = useTranslation();
  const panel = ASIDES[aside];

  /*
   * Вход всегда светлый, какая бы тема ни стояла у человека.
   *
   * Тёмная тема — настройка рабочего места, а до входа рабочего места
   * ещё нет: экран показывают и тому, у кого своих настроек не будет
   * вовсе (приглашение, восстановление пароля).
   *
   * useLayoutEffect, а не useEffect: тема снимается ДО отрисовки, иначе
   * при входе в тёмной теме экран моргнёт тёмным на кадр. При уходе
   * возвращается та, что выбрана в настройках.
   */
  useLayoutEffect(() => {
    applyTheme("light");
    return () => applyTheme(useUi.getState().theme);
  }, []);

  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-2">
      <div className="flex flex-col px-4 py-5 sm:px-12 sm:py-7">
        <img src="/omni4-logo.svg" alt="omni4" className="h-7 w-fit" />
        <div className="m-auto w-full max-w-100 py-10 [--spacing-control:44px] [--spacing-input:44px]">
          {children}
        </div>
        <p className="text-xs text-fg-muted">© 2026 omni4</p>
      </div>

      <aside
        className={`hidden flex-col justify-center gap-9 overflow-hidden py-16 pl-16 lg:flex ${panel.bg}`}
        aria-hidden
      >
        <h2 className="max-w-110 pr-12 text-3xl font-semibold tracking-tight text-balance text-fg">
          {t(panel.title)}
        </h2>
        <figure className="w-[130%] overflow-hidden rounded-l-xl border border-r-0 border-border-strong bg-surface shadow-xl">
          <div className="flex h-8.5 items-center gap-1.5 border-b border-border bg-surface-soft px-3.5">
            <i className="size-2.5 rounded-full bg-border-strong" />
            <i className="size-2.5 rounded-full bg-border-strong" />
            <i className="size-2.5 rounded-full bg-border-strong" />
          </div>
          <img
            src={panel.screen}
            alt=""
            width={2160}
            height={1350}
            decoding="async"
            className="aspect-16/10 w-full object-cover object-left-top"
          />
        </figure>
      </aside>
    </div>
  );
}
