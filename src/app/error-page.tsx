import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ChevronDownIcon, HouseIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

/**
 * Экран упавшего маршрута — вместо стандартного «Something went wrong!»
 * роутера. Человеку — что случилось и куда идти; текст ошибки свёрнут,
 * он нужен тому, кому человек пришлёт скриншот.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(import.meta.env.DEV);
  const message = error instanceof Error ? error.message : String(error);

  const retry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-danger-subtle text-danger">
          <Icon as={TriangleAlertIcon} size={22} />
        </span>
        <h1 className="text-xl font-semibold">{t("error.title")}</h1>
        <p className="mt-1.5 text-sm text-fg-muted">{t("error.hint")}</p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={retry}>
            <Icon as={RotateCwIcon} size={14} />
            {t("error.retry")}
          </Button>
          <Button variant="secondary" onClick={() => void router.navigate({ to: "/" })}>
            <Icon as={HouseIcon} size={14} />
            {t("error.home")}
          </Button>
        </div>

        {message && (
          <div className="mt-6 text-left">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="mx-auto flex cursor-pointer items-center gap-1 text-xs text-fg-subtle transition-colors hover:text-fg"
            >
              {t("error.details")}
              <Icon as={ChevronDownIcon} size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs whitespace-pre-wrap text-danger select-all">
                {message}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
