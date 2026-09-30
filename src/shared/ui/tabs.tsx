import type { Icon as TablerIcon } from "@tabler/icons-react";
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
  icon?: TablerIcon;
  /** Подсказка под курсором. Нужна там, где подпись сокращена до кода. */
  title?: string;
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
 */
const STYLES = {
  underline: {
    track:
      "flex min-w-0 max-w-full gap-1 self-stretch overflow-x-auto [scrollbar-width:none]",
    tab: "relative inline-flex min-h-9 shrink-0 items-center gap-1.5 px-2 text-sm font-medium transition-colors",
    active:
      "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-fg",
    idle: "text-fg-muted hover:text-fg",
  },
  segment: {
    track: "flex w-fit min-w-0 max-w-full items-center overflow-x-auto rounded-md bg-surface-hover p-0.5",
    tab: "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors",
    active: "bg-surface text-fg shadow-raised",
    idle: "text-fg-muted hover:text-fg",
  },
} as const;

export function Tabs({
  tabs,
  activeId,
  onSelect,
  variant = "underline",
}: {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  variant?: keyof typeof STYLES;
}) {
  if (!tabs.length) return null;

  const style = STYLES[variant];

  return (
    <div className={style.track}>
      {tabs.map((item) => {
        const active = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            {...(item.title ? { title: item.title } : {})}
            className={`${style.tab} whitespace-nowrap ${active ? style.active : style.idle}`}
          >
            {item.icon && <Icon as={item.icon} size={14} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
