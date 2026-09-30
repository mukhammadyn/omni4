import { SearchIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";

/**
 * Окно «Поиск или AI» — `CmdK` прототипа (docs/REDESIGN.md, 4.2): 680px,
 * под шапкой экрана, строка ввода 54px. Только omni4.
 *
 * Пока заглушка: строка ввода есть, а поиска по записям и ответов AI
 * ещё нет — вместо результатов сказано, что будет. Поиск по меню, который
 * жил в поле сайдбара, убран намеренно: у прототипа поле ищет по данным
 * всех модулей, и старое поведение под новой подписью врало бы.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  return (
    <Modal onClose={onClose} className="flex items-start justify-center px-4 pt-[12vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("sidebar.search")}
        className="flex max-h-[70vh] w-[680px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <div className="flex h-13.5 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <Icon as={SearchIcon} size={18} className="text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            /* Escape — здесь, а не в Modal: у Modal его нет намеренно
               (см. shared/ui/modal), а у этого окна своих вложенных
               списков со своим Escape пока нет. */
            onKeyDown={(event) => event.key === "Escape" && onClose()}
            placeholder={t("sidebar.palettePlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="shrink-0 rounded-sm border border-border-strong px-1 text-[11px] leading-4 text-fg-subtle">
            Esc
          </kbd>
        </div>

        <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
          <Icon as={SparklesIcon} size={20} className="text-fg-subtle" />
          <p className="text-sm font-medium text-fg">{t("sidebar.paletteSoon")}</p>
          <p className="max-w-sm text-xs text-fg-muted">{t("sidebar.paletteSoonNote")}</p>
        </div>
      </div>
    </Modal>
  );
}
