import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, LayoutGridIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { Tooltip } from "@/shared/ui/tooltip";
import type { MenuNode } from "../model/types";
import { MenuIcon } from "./MenuIcon";

/**
 * Ряд модулей ERP под поиском — `.sb-modules` прототипа
 * (docs/REDESIGN.md, 4.2). Модули — папки корня меню с `is_tab`
 * (docs/adr/0010, CONTEXT.md «Module»); их заводят в ucode, а не здесь.
 *
 * Выбранный — с подписью, остальные — значком с подсказкой. Выбор меняет
 * только то, что показывает дерево ниже: модуль живёт в том же проекте,
 * поэтому ни входа заново, ни смены сессии.
 *
 * Ряд подстраивается под ширину сайдбара (её тянут ручкой) и под число
 * модулей — их бывает и один, и два, и пять:
 *
 *   все помещаются с подписями — каждый вкладкой со значком и подписью,
 *   вкладки делят ширину поровну и занимают её целиком; «Все модули»
 *   не нужна и не рисуется;
 *
 *   не помещаются — выбранный с подписью, остальные значками, сколько
 *   влезает, лишние — в «Все модули» справа. При совсем узком сайдбаре
 *   подпись выбранного обрезается.
 */

/** Кнопка-значок: min-w-7.5 (30px) — `.sb-mod` прототипа. */
const ICON_WIDTH = 30;

/** Вкладка модуля с подписью — `.sb-mod.active` прототипа по размерам. */
const TAB = "inline-flex h-8 items-center gap-1.25 rounded-lg pr-2.25 pl-1.75 text-sm";

export function ModuleSwitcher({
  modules,
  activeId,
  onSelect,
}: {
  modules: MenuNode[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  /** Невидимая копия ряда: все модули с подписями, в натуральную ширину. */
  const probe = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(modules.length);
  const [spread, setSpread] = useState(false);

  const signature = modules.map((module) => `${module.id}:${module.label}`).join("|");
  const active = modules.find((module) => module.id === activeId);
  const others = modules.filter((module) => module.id !== activeId);

  /*
   * Сколько значков помещается: ширина ряда минус подпись выбранного
   * и кнопка «Все модули». Меряем по факту — подпись у каждого модуля
   * своей длины, а сайдбар тянут ручкой.
   */
  useLayoutEffect(() => {
    const box = row.current;
    if (!box) return;

    const measure = () => {
      setSpread((probe.current?.scrollWidth ?? Infinity) <= box.clientWidth);
      /* Сначала — влезают ли все значки без «Все модули»: тогда место под
         неё не нужно. Иначе — сколько влезает рядом с ней. */
      const room = box.clientWidth - (pill.current?.offsetWidth ?? 0);
      const others = modules.length - 1;
      const all = Math.floor(room / ICON_WIDTH);
      setFits(all >= others ? others : Math.max(0, Math.floor((room - ICON_WIDTH) / ICON_WIDTH)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (pill.current) observer.observe(pill.current);
    return () => observer.disconnect();
    // Подписи — часть замера: переименовали модуль — меряем заново.
    // Строкой, а не массивом: массив новый на каждую перерисовку сайдбара.
  }, [activeId, signature]);

  /* Копия для замера — те же классы, что у вкладок, но без растяжения:
     нужна натуральная ширина всех подписей подряд. */
  const measureCopy = (
    <div ref={probe} aria-hidden className="pointer-events-none invisible absolute flex whitespace-nowrap">
      {modules.map((module) => (
        <span key={module.id} className={`${TAB} shrink-0`}>
          <MenuIcon name={module.icon} type={module.type} />
          {module.label}
        </span>
      ))}
    </div>
  );

  if (spread) {
    return (
      <div ref={row} role="group" aria-label={t("sidebar.modules")} className="relative flex min-w-0 items-center">
        {measureCopy}
        {modules.map((module) =>
          module.id === activeId ? (
            <span
              key={module.id}
              aria-current="true"
              className={`${TAB} min-w-0 flex-1 justify-center bg-surface-active font-semibold text-fg`}
            >
              <span className="flex shrink-0">
                <MenuIcon name={module.icon} type={module.type} />
              </span>
              <span className="truncate">{module.label}</span>
            </span>
          ) : (
            <button
              key={module.id}
              type="button"
              onClick={() => onSelect(module.id)}
              className={`${TAB} min-w-0 flex-1 justify-center font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg`}
            >
              <span className="flex shrink-0">
                <MenuIcon name={module.icon} type={module.type} />
              </span>
              <span className="truncate">{module.label}</span>
            </button>
          ),
        )}
      </div>
    );
  }

  const shown = others.slice(0, fits);
  /** Кто-то не влез — нужна «Все модули»; иначе значки делят пустое место. */
  const overflow = shown.length < others.length;

  return (
    /* Размеры — `.sb-mod` прототипа: 32px в высоту, без зазоров между
       кнопками; у выбранного подпись 14px/600. */
    <div ref={row} role="group" aria-label={t("sidebar.modules")} className="relative flex min-w-0 items-center">
      {measureCopy}
      {active && (
        <span
          ref={pill}
          aria-current="true"
          /* Подпись сжимается последней: пока в ряду есть значки, она
             в полную ширину — иначе замер брал бы уже сжатую подпись,
             насчитывал лишние значки, и те сжимали бы её дальше. Когда
             значков не осталось, она обрезается многоточием. */
          className={`inline-flex h-8 min-w-0 items-center gap-1.25 rounded-lg bg-surface-active pr-2.25 pl-1.75 text-sm font-semibold text-fg ${
            fits > 0 ? "shrink-0" : "shrink"
          }`}
        >
          <span className="flex shrink-0">
            <MenuIcon name={active.icon} type={active.type} />
          </span>
          <span className="truncate">{active.label}</span>
        </span>
      )}

      {shown.map((module) => (
        <Tooltip key={module.id} label={module.label}>
          <button
            type="button"
            onClick={() => onSelect(module.id)}
            aria-label={module.label}
            className={`grid h-8 min-w-7.5 place-items-center rounded-lg px-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ${
              overflow ? "shrink-0" : "flex-1"
            }`}
          >
            <MenuIcon name={module.icon} type={module.type} />
          </button>
        </Tooltip>
      ))}

      {/* «Все модули» — список всех, в том числе не поместившихся в ряд.
          У прототипа тут плитки с описаниями (`modulesMenu`); описаний
          у модулей нет, поэтому — список. */}
      {overflow && (
      <Popover
        align="end"
        className="ml-auto shrink-0"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t("sidebar.allModules")}
            title={t("sidebar.allModules")}
            className={`grid h-8 min-w-7.5 place-items-center rounded-lg px-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ${
              open ? "bg-surface-hover text-fg" : ""
            }`}
          >
            <Icon as={LayoutGridIcon} size={17} />
          </button>
        )}
      >
        {(close) =>
          modules.map((module) => (
            <PopoverItem
              key={module.id}
              icon={<MenuIcon name={module.icon} type={module.type} />}
              onClick={() => {
                onSelect(module.id);
                close();
              }}
              {...(module.id === activeId ? { trailing: <Icon as={CheckIcon} size={14} /> } : {})}
            >
              {module.label}
            </PopoverItem>
          ))
        }
      </Popover>
      )}
    </div>
  );
}
