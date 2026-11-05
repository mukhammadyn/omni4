import type { ReactNode } from "react";

/**
 * Общая обёртка экранов входа и регистрации: заголовок, подзаголовок,
 * форма и строка внизу. Слева по краю, как `.auth-form` прототипа
 * сайта; логотип — в AuthLayout, над формой.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-fg-muted text-balance">{subtitle}</p>
      </div>

      {children}

      <div className="text-sm text-fg-muted">{footer}</div>
    </div>
  );
}
