import type { ReactNode } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
/* Размеры страницы — те же, что у таблицы данных: это один и тот же
   вопрос «сколько строк показывать», и два разных набора значений
   разошлись бы на первой же правке. */
import { PAGE_SIZES } from "@/features/item";
import { CHIP_STYLES, Chip, type ChipColor } from "@/shared/ui/chip";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { GAP, pageCount, pageItems } from "@/shared/ui/pagination";
import { highlightCode, type CodeTokenKind } from "../model/code-highlight";

/**
 * Общие части разделов настроек: шапка, строки «подпись — значение»,
 * таблица, страницы.
 *
 * Разделов таких пять, и все они устроены одинаково — заголовок,
 * кнопка «добавить», таблица, страницы. Пять копий одних и тех же
 * классов разъезжаются на первой же правке отступа: в старой админке
 * ровно так и вышло — свой `CTable` со своими стилями почти в каждом
 * модуле.
 *
 * В shared/ это не уезжает намеренно: за пределами настроек списков
 * такого вида нет, а таблица данных у нас своя и совсем другая.
 */

/**
 * Заголовок раздела — `.set-sec h2` и `.sd` прототипа: 22px полужирным,
 * под ним строка о том, чего раздел касается. Линии снизу нет: отступы
 * задаёт страница настроек, а таблица под заголовком начинается своей.
 */
export function SectionHeader({
  title,
  hint,
  children,
}: {
  title: string;
  /** Одна строка о том, чего это касается. Не инструкция. */
  hint?: string;
  /** Поиск и кнопки — у правого края, вровень с заголовком. */
  children?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-start gap-3 pb-4.5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[22px] leading-tight font-semibold text-fg">{title}</h2>
        {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      </div>

      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/**
 * Заголовок блока внутри раздела — `.dx-h3` прототипа: 16px, под ним
 * строка пояснения, справа кнопки. Им открываются разделы, встроенные
 * в чужой: «Окружения» в «Профиле компании», функции и фронтенды
 * во вкладках «Кода». Второй SectionHeader в разделе — это раздел
 * внутри раздела.
 */
export function SubHeader({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 pb-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {hint && <p className="text-[13px] text-fg-muted">{hint}</p>}
      </div>

      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Строка настройки — `.srow` прототипа: подпись с пояснением слева,
 * значение справа, линия между строками. На узком экране значение
 * уходит под подпись во всю ширину.
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        {hint && <p className="text-[12.5px] text-fg-muted">{hint}</p>}
      </div>

      <div className="flex w-full items-center gap-2 sm:w-65 sm:justify-end">{children}</div>
    </div>
  );
}

/**
 * Полоса инструментов вкладки — поиск и кнопки над таблицей, когда
 * заголовок раздела уже нарисовал тот, кто держит вкладки (API, база
 * данных). Своего заголовка у вкладки нет: два заголовка подряд — это
 * раздел внутри раздела.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-b border-border">
      {children}
    </div>
  );
}

/**
 * Квота в шапке раздела — `.dx-quota` прототипа: обведённая плашка
 * с подписью, полосой и «занято / предел». Предела нет — полосы тоже:
 * заполнять её нечем.
 *
 * Порог предупреждения тот же, что в журнале расхода (`Usage`): за
 * четырьмя пятыми лимита цифра из справочной становится предупреждением.
 */
export function Quota({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: string;
  /** Пусто — предела нет. */
  limit: string;
  /** 0–100. null — сравнивать не с чем. */
  percent: number | null;
}) {
  const warn = (percent ?? 0) > 80;

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs whitespace-nowrap text-fg-muted shadow-[inset_0_0_0_1px_var(--color-border)]">
      {label}
      {percent !== null && (
        <span className="h-1 w-22.5 overflow-hidden rounded-[2px] bg-surface-active">
          <span
            className={`block h-full rounded-[2px] ${warn ? "bg-warning" : "bg-accent"}`}
            /* Полоса не короче точки: нулевая ширина читается как «не загрузилось». */
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </span>
      )}
      <span className={`tabular-nums ${warn ? "text-warning" : ""}`}>
        <b className="font-semibold text-fg">{used}</b>
        {limit && ` / ${limit}`}
      </span>
    </div>
  );
}

/**
 * Подпись над полем и шапка карточки — `.dx-lbl` прототипа: 11.5px
 * капителью с разрядкой. Строкой классов, а не компонентом: ложится
 * и на `<label>`, и на шапку карточки, у которых своя разметка.
 */
export const CAPS_LABEL =
  "text-[11.5px] font-semibold tracking-[.04em] text-fg-subtle uppercase";

/**
 * Обводка карточек и таблиц — рамка, а не inset-тень, как у прототипа
 * (`box-shadow: inset 0 0 0 1px var(--border)`). Inset-тень рисуется
 * ПОД фоном детей: у карточки с залитой шапкой линия по краю шапки
 * пропадала, а кольцо фокуса поля внутри ложилось прямоугольником
 * поверх скругления. Рамка — над детьми и со своим скруглением.
 */
export const OUTLINE = "rounded-lg border border-border";

const CODE_COLOR: Record<CodeTokenKind, string> = {
  keyword: "text-code-keyword",
  string: "text-code-string",
  comment: "text-code-comment",
  number: "text-code-number",
  plain: "",
};

/**
 * Карточка кода — `.dx-card` с `.dx-pre` прототипа: шапка капителью
 * на мягкой подложке, под ней код с номерами строк и подсветкой.
 * Номер строки — не украшение: по нему договариваются, «что в
 * двенадцатой строке», и он не попадает в копирование (`select-none`).
 */
export function CodeCard({
  title,
  actions,
  code,
  className = "",
}: {
  title: ReactNode;
  actions?: ReactNode;
  code: string;
  /** Высота задаётся снаружи: у SDK она своя, у схемы — своя. */
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${OUTLINE} ${className}`}>
      <div
        className={`flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-soft px-3 ${CAPS_LABEL}`}
      >
        {title}
        {actions && <span className="ml-auto flex items-center gap-2 normal-case">{actions}</span>}
      </div>

      <pre className="min-h-0 flex-1 overflow-auto py-3 font-mono text-[12.5px] leading-[1.65]">
        {highlightCode(code).map((line, index) => (
          <span key={index} className="block pr-3.5 whitespace-pre">
            <span className="mr-3.5 inline-block w-9.5 text-right text-fg-subtle select-none">
              {index + 1}
            </span>
            {line.map((token, at) => (
              <span key={at} className={CODE_COLOR[token.kind]}>
                {token.text}
              </span>
            ))}
          </span>
        ))}
      </pre>
    </div>
  );
}

/**
 * Мегабайты человеку: до гигабайта — целыми, дальше — гигабайтами
 * с десятой долей. «1234 МБ» читается хуже, чем «1,2 ГБ», а «0,2 МБ»
 * хуже, чем «0 МБ»: точность здесь никому не нужна.
 */
export function formatSize(mb: number, locale: string, units: { mb: string; gb: string }): string {
  return mb >= 1024
    ? `${(mb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} ${units.gb}`
    : `${Math.round(mb).toLocaleString(locale)} ${units.mb}`;
}

/** Заголовок группы строк — `.set-group-t` прототипа: 14px с линией снизу. */
export function GroupTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-6.5 mb-1 border-b border-border pb-2">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {hint && <p className="mt-0.5 text-[12.5px] text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Заголовок колонки. Липкий: у списков своя прокрутка. */
export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`sticky top-0 z-10 h-9 border-b border-border bg-surface px-3 text-left text-xs font-normal text-fg-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`h-10 border-b border-border px-3 text-sm text-fg ${className}`}>
      {children}
    </td>
  );
}

/** Пусто — это ответ, а не ошибка: так и пишем словами. */
export function Empty({ text, colSpan }: { text: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-sm text-fg-subtle">
        {text}
      </td>
    </tr>
  );
}

/**
 * Страницы. Логика номеров — общая (`shared/ui/pagination`), та же,
 * что у таблицы данных: полоса постоянной ширины, чтобы кнопки
 * не разъезжались под курсором.
 *
 * Слева — счётчик и размер страницы, справа — номера. Счётчик тут
 * не украшение: без него «20 строк» на экране не отличить от «20 строк
 * всего», а в журнале это разные ответы. Поэтому полоса рисуется
 * и тогда, когда страница одна: листать нечего, а знать сколько всего
 * — есть зачем. Пусто — полосы нет вовсе: «Показано 0 из 0» под пустой
 * таблицей повторяет то, что она уже сказала словами.
 *
 * Размер страницы появляется только у того, кто передал `onLimit`:
 * у списка, где число строк задано жёстко, выбор из четырёх значений
 * был бы кнопкой, которая ничего не меняет.
 */
export function Pager({
  page,
  total,
  limit,
  onPage,
  onLimit,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit?: ((limit: number) => void) | undefined;
}) {
  const { t } = useTranslation();
  const pages = pageCount(total, limit);

  if (!total) return null;

  const button =
    "inline-flex size-7 items-center justify-center rounded-md text-sm transition-colors";

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs text-fg-muted tabular-nums">
          {/* Диапазон, а не число загруженного, как в таблице данных:
              там строки копятся прокруткой, здесь страница ровно одна
              и важно, какая именно. Ключ тот же. */}
          {t("table.shownOf", {
            shown: `${(page - 1) * limit + 1}–${Math.min(page * limit, total)}`,
            total,
          })}
        </span>

        {onLimit && (
          <>
            <div className="w-20">
              <Dropdown
                value={String(limit)}
                items={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                ariaLabel={t("table.customLimit")}
                size="sm"
                onChange={(value) => onLimit(Number(value))}
              />
            </div>
            <span className="text-xs text-fg-muted">{t("table.perPage")}</span>
          </>
        )}
      </div>

      {/* Номера прячутся, а счётчик остаётся: на одной странице листать
          нечего, но «сколько всего» спрашивают и там. */}
      {pages > 1 && (
        <nav className="flex shrink-0 items-center gap-1" aria-label={t("table.pages")}>
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label={t("table.prevPage")}
            className={`${button} text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-30`}
          >
            <Icon as={ChevronLeftIcon} size={14} />
          </button>

          {pageItems(page, pages).map((item, index) =>
            item === GAP ? (
              <span key={`${GAP}${index}`} className={`${button} text-fg-subtle`} aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPage(item)}
                aria-current={item === page ? "page" : undefined}
                className={`${button} ${
                  item === page
                    ? "bg-accent-subtle text-accent-text"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            aria-label={t("table.nextPage")}
            className={`${button} text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-30`}
          >
            <Icon as={ChevronRightIcon} size={14} />
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * Метод запроса плашкой, а не словом в общей строке.
 *
 * В журнале полсотни строк на экран, и глазами по ним ищут не «что
 * случилось», а «где мой DELETE». Слово одного цвета среди других слов
 * для этого перечитывают целиком, цветная плашка — узнаётся формой
 * и оттенком, не читаясь.
 *
 * Оттенки — из палитры чипов (`shared/ui/chip`): она уже проверена
 * в обеих темах, и это тот же набор, которым красятся значения Status
 * в таблицах. Свои цвета здесь означали бы десятый набор в системе.
 * Соответствие привычное (зелёный — создание, красный — удаление),
 * и незнакомый метод не выдумывает себе цвет, а остаётся серым.
 */
const METHOD_COLOR: Record<string, ChipColor> = {
  GET: "blue",
  POST: "green",
  PUT: "orange",
  PATCH: "orange",
  DELETE: "red",
};

/**
 * Вид — `.lg-m` прототипа: моноширинный и постоянной ширины, чтобы
 * адреса в списке журнала начинались с одной вертикали. Метода нет —
 * пустое место той же ширины, а не сдвиг строки влево.
 */
export function MethodBadge({ method }: { method: string }) {
  const name = method.trim().toUpperCase();

  return (
    <span
      className={`w-14 shrink-0 rounded-[5px] py-0.5 text-center font-mono text-[11px] font-bold tracking-[.03em] ${
        name ? CHIP_STYLES[METHOD_COLOR[name] ?? "gray"] : ""
      }`}
    >
      {name}
    </span>
  );
}

/**
 * Исход запроса — `.lg-st` прототипа: галочка или крестик и код.
 * До 300 — зелёный, отказ клиента — жёлтый, сбой сервера — красный.
 */
export function StatusPill({ ok, tone, children }: { ok: boolean; tone: ChipColor; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.25 text-[13px] font-semibold tabular-nums ${CHIP_STYLES[tone]}`}
    >
      <Icon as={ok ? CheckIcon : XIcon} size={13} />
      {children}
    </span>
  );
}

/** Код ответа пилюлей. Нуля не бывает: у записей без кода её нет вовсе. */
export function StatusCode({ code }: { code: number }) {
  if (!code) return null;

  return (
    <StatusPill ok={code < 400} tone={code < 300 ? "green" : code < 500 ? "yellow" : "red"}>
      {code}
    </StatusPill>
  );
}

/**
 * Раздел «Логи» — `#s-logs` прототипа: заголовок, под ним одна
 * карточка, в ней панель отбора на мягкой подложке и список.
 *
 * Общая у трёх видов журнала (изменения, функции, расход): вид
 * выбирается первым полем панели, и прыгать при смене вида экран
 * не должен — меняются поля и строки, а не рамка вокруг них.
 */
export function LogLayout({
  hint,
  actions,
  filters,
  children,
}: {
  hint: string;
  actions?: ReactNode;
  filters: ReactNode;
  /** Список и страницы. Прокрутку держит сам: у таблиц липкая шапка. */
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader title={t("activity.title")} hint={hint}>
        {actions}
      </SectionHeader>

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${OUTLINE}`}>
        <div className="flex shrink-0 flex-wrap items-end gap-3.5 border-b border-border bg-surface-soft px-4.5 py-4">
          {filters}
        </div>

        {children}
      </div>
    </div>
  );
}

/** Поле панели отбора: подпись капителью над ним — `.dx-lbl`. */
export function LogField({
  label,
  className = "w-52",
  children,
}: {
  label: string;
  /** Ширина. Поле само тянется на всю: у `Input` в базе `w-full`. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className={`mb-1.5 block ${CAPS_LABEL}`}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Тип действия плашкой: «CREATE VIEW», «DELETE ITEM», «GET_LIST».
 *
 * Цвет берётся по ГЛАГОЛУ — первому слову. Оно и есть то, что ищут
 * глазами в журнале: «кто удалил» спрашивают куда чаще, чем «что было
 * с view». Сущность после глагола цвета не меняет: иначе пришлось бы
 * держать таблицу из четырёх десятков значений, которая растёт вместе
 * с ручками бэкенда и устареет молча — ровно то, из-за чего отбор
 * по типу здесь поиск, а не список.
 *
 * Оттенки те же, что у методов запроса, и по тому же смыслу: создание
 * зелёное, удаление красное, правка оранжевая, чтение синее. Глагол
 * не из списка остаётся серым, а не выдумывает себе цвет.
 *
 * `GET_LIST` и `GET_ITEM` подводятся под `GET`: подчёркивание здесь
 * — не другой глагол, а уточнение.
 */
const ACTION_COLOR: Record<string, ChipColor> = {
  CREATE: "green",
  UPDATE: "orange",
  UPSERT: "orange",
  DELETE: "red",
  GET: "blue",
};

export function ActionBadge({ action }: { action: string }) {
  const name = action.trim().toUpperCase();
  if (!name) return null;

  const verb = name.split(/[\s_]/)[0] ?? "";

  return <Chip color={ACTION_COLOR[verb] ?? "gray"}>{name}</Chip>;
}

/**
 * Дата так, как её понимает человек. Мусор не показываем вовсе —
 * пустая ячейка честнее, чем «Invalid Date».
 */
export function formatDateTime(value: string, locale: string): string {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale);
}

/** Пустой список или загрузка — `.dx-empty` прототипа. */
export function LogEmpty({ text }: { text: string }) {
  return <p className="p-7 text-center text-[13.5px] text-fg-subtle">{text}</p>;
}

/** Период «с — по» одним полем отбора — `.lg-period` прототипа. */
export function Period({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <DatePicker
          value={from}
          locale={i18n.language}
          placeholder={t("activity.from")}
          ariaLabel={t("activity.from")}
          clearLabel={t("table.clearFilters")}
          onChange={(next) => onChange(next, to)}
        />
      </div>
      <span className="text-fg-subtle">–</span>
      <div className="min-w-0 flex-1">
        <DatePicker
          value={to}
          locale={i18n.language}
          placeholder={t("activity.to")}
          ariaLabel={t("activity.to")}
          clearLabel={t("table.clearFilters")}
          onChange={(next) => onChange(from, next)}
        />
      </div>
    </div>
  );
}
