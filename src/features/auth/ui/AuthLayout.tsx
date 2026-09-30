import { useLayoutEffect, type ReactNode } from "react";
import { applyTheme, useUi } from "@/shared/lib/ui-store";

/**
 * Общий каркас экранов входа и регистрации: одна колонка по центру, как
 * `.login` прототипа (docs/REDESIGN.md, 4.6). Правой панели с витриной
 * продукта у прототипа нет, и в omni4 её тоже нет; в new-ucode она
 * осталась.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
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

  return <div className="grid min-h-dvh place-items-center p-6">{children}</div>;
}
