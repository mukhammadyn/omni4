import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { MODULE_PILL, MODULE_PILL_ACTIVE, MODULE_PILL_IDLE } from "./module-pill";
import { Icon } from "@/shared/ui/icon";

/**
 * Вкладки: подчёркнутые для навигации, сегменты для режима (ниже).
 *
 * Один компонент на все вкладки приложения. Ими показывается не только набор
 * view: раскладка таблицы по значению поля (`group_fields`) и связи
 * в карточке записи — это те же вкладки, с тем же поведением. В старой
 * админке на каждый случай был свой компонент со своими кнопками
 * (Grid.jsx, tabGroupBtn), и три полосы вкладок выглядели по-разному
 * без единой причины; у нас это успело повториться в карточке.
 *
 * Живёт в shared, а не в features/view: карточку записи рисует
 * features/item, а обратный импорт (item → view) замкнул бы фичи
 * в кольцо — features/view уже импортирует features/item.
 *
 * Много вкладок — полоса прокручивается вбок. В старой админке вместо
 * этого мерили ширину и складывали лишнее в меню «Ещё», из-за чего
 * последняя видимая вкладка переставала открываться и превращалась
 * в кнопку меню. Прокрутка стоит одного класса и не врёт.
 */
export type TabItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Готовая иконка вместо `icon` — например, выбранная админом. */
  iconNode?: ReactNode;
  /** Подсказка под курсором. Нужна там, где подпись сокращена до кода. */
  title?: string;
  /** Сколько записей за вкладкой. undefined — не считали или ещё едет. */
  count?: number | undefined;
};

/*
 * Два вида — как в прототипе.
 *
 * underline — навигация: view, связи в карточке, разделы настроек
 * (`.view-tab`). Вкладка тянется на всю высоту своей полосы, и черта
 * активной ложится на нижнюю границу полосы, а не висит над ней.
 *
 * segment — переключатель режима внутри экрана: день/неделя/месяц
 * у календаря и таймлайна (`.seg`). Навигацией он не является, и
 * подчёркнутым рядом с поиском и кнопками читался бы как вторая полоса
 * вкладок.
 *
 * field — тот же segment как поле формы: высота поля ввода, вкладки
 * делят ширину колонки поровну.
 */
const STYLES = {
  module: {
    track: "flex min-w-0 w-full items-center",
    tab: `${MODULE_PILL} min-w-0 flex-1 justify-center`,
    active: MODULE_PILL_ACTIVE,
    idle: MODULE_PILL_IDLE,
  },
  underline: {
    track:
      "flex min-w-0 max-w-full gap-1 self-stretch overflow-x-auto [scrollbar-width:none]",
    tab: "group/tab relative inline-flex min-h-9 shrink-0 items-center px-2 text-sm font-medium transition-colors",
    active:
      "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-fg",
    idle: "text-fg-muted hover:text-fg",
  },
  segment: {
    track: "flex w-fit min-w-0 max-w-full items-center overflow-x-auto rounded-md bg-surface-hover p-0.5",
    tab: "inline-flex h-6 shrink-0 items-center rounded-[5px] px-2.5 text-xs transition-colors",
    active: "bg-surface text-fg shadow-raised",
    idle: "text-fg-muted hover:text-fg",
  },
  field: {
    track: "flex h-(--spacing-input) w-full min-w-0 items-stretch rounded-md bg-surface-hover p-0.5",
    tab: "inline-flex flex-1 items-center justify-center rounded-[5px] px-2.5 text-sm transition-colors",
    active: "bg-surface text-fg shadow-raised",
    idle: "text-fg-muted hover:text-fg",
  },
} as const;

export function Tabs({
  tabs,
  activeId,
  onSelect,
  variant = "underline",
  panelPrefix,
  ariaLabel,
}: {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  variant?: keyof typeof STYLES;
  panelPrefix?: string;
  ariaLabel?: string;
}) {
  if (!tabs.length) return null;

  const style = STYLES[variant];

  return (
    <div className={style.track} role={panelPrefix ? "tablist" : undefined} aria-label={ariaLabel}>
      {tabs.map((item) => {
        const active = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={!panelPrefix && active ? "page" : undefined}
            role={panelPrefix ? "tab" : undefined}
            id={panelPrefix ? `${panelPrefix}-${item.id}` : undefined}
            aria-selected={panelPrefix ? active : undefined}
            aria-controls={panelPrefix ? `${panelPrefix}-panel-${item.id}` : undefined}
            tabIndex={panelPrefix ? active ? 0 : -1 : undefined}
            onKeyDown={panelPrefix ? (event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const at = tabs.findIndex((tab) => tab.id === item.id);
              const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              const next = tabs[index]!; onSelect(next.id); document.getElementById(`${panelPrefix}-${next.id}`)?.focus();
            } : undefined}
            onClick={() => onSelect(item.id)}
            {...(item.title ? { title: item.title } : {})}
            className={`${style.tab} whitespace-nowrap ${active ? style.active : style.idle}`}
          >
            {/* Подпись в своей плашке: у подчёркнутой вкладки наведение
                подсвечивает её, а не всю высоту полосы — `span.in`
                у `.view-tab` прототипа. У сегмента плашкой служит сама
                кнопка, и эта обёртка ничего не красит. */}
            <span
              className={`inline-flex items-center ${variant === "module" ? "gap-1.25" : "gap-1.5"} ${
                variant === "underline"
                  ? "rounded-[5px] px-1.5 py-0.75 transition-colors group-hover/tab:bg-surface-hover"
                  : ""
              }`}
            >
              {item.iconNode ?? (item.icon && <Icon as={item.icon} size={14} />)}
              {item.label}
              {item.count !== undefined && (
                <span className="font-normal text-fg-subtle tabular-nums">{item.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
