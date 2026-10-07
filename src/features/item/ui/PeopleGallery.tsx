import type { ReactNode, UIEvent } from "react";
import { MailIcon, PhoneIcon, PlusIcon, SendIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Field, Relation } from "@/features/table";
import { CHIP_COLORS, CHIP_STYLES } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { cellKind } from "../model/cell-kind";
import { isBlank, toList } from "../model/cell-value";
import { valueLabelOf } from "../model/relation";
import type { Item } from "../model/types";
import { Cell } from "./Cell";

/**
 * Сетка людей — «Сетка» сотрудников прототипа (`galleryCard` в
 * employees.html, `.emp-card`): крупный аватар, имя, строка «должность ·
 * отдел · филиал», статус, внизу — связаться.
 *
 * Роль колонки view решает её тип, а не слаг, поэтому сетка годится
 * любой таблице людей (кандидаты, контакты), а состав правится
 * «Свойствами», как у галереи:
 *   картинка        — аватар (нет — инициалы);
 *   первая прочая   — имя;
 *   STATUS          — плашка, кроме самого частого значения: «Работает»
 *                     на каждой карточке — шум, прототип его не рисует;
 *   EMAIL, телефоны — кнопки внизу;
 *   остальные       — строкой под именем через « · ».
 */
/** Виды ячейки, которые в строке под именем идут словами, а не ячейкой. */
const AS_TEXT = new Set(["text", "relation", "status", "multiselect"]);

export function PeopleGallery({
  tableSlug,
  columns,
  rows,
  relations,
  locale,
  language,
  onOpenRow,
  onAdd,
  onEndReached,
}: {
  tableSlug: string;
  columns: Field[];
  rows: Item[];
  relations: Relation[];
  locale: string;
  language: string;
  onOpenRow: (guid: string) => void;
  /** Карточка «Новая запись» последней. Нет — права на запись нет. */
  onAdd?: (() => void) | undefined;
  onEndReached?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const photo = columns.find((field) => cellKind(field.type) === "image");
  const status = columns.find((field) => field.type === "STATUS");
  const contacts = columns.filter((field) => contactOf(field));
  const [title, ...rest] = columns.filter(
    (field) => field !== photo && field !== status && !contacts.includes(field),
  );
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const labels = new Map(rest.map((field) => [field, valueLabelOf(field, relations, language)]));

  /*
   * Значение строкой: связь и вариант — подписью, остальное как есть.
   * Связь без подписи (не настроены поля показа) не показывается вовсе:
   * uuid вместо должности хуже пустого места.
   */
  const text = (field: Field, row: Item) =>
    toList(row[field.slug])
      .map(
        (value) =>
          labels.get(field)?.(row, value) || (cellKind(field.type) === "relation" ? "" : value),
      )
      .filter(Boolean)
      .join(", ");

  /*
   * Часть строки под именем. Связь, вариант и текст — словами, чтобы
   * строка читалась фразой «должность · отдел · филиал», как в прототипе.
   * Дата, число, флаг и прочее — ячейкой: сырое «2024-03-01T00:00:00Z»
   * здесь читалось бы как поломка.
   */
  const part = (field: Field, row: Item): ReactNode => {
    if (AS_TEXT.has(cellKind(field.type))) return text(field, row) || null;
    if (isBlank(row[field.slug])) return null;
    return (
      <Cell
        field={field}
        row={row}
        tableSlug={tableSlug}
        relations={byId}
        locale={locale}
        language={language}
      />
    );
  };
  const usual = status && mostCommon(rows.map((row) => toList(row[status.slug])[0]));

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (onEndReached && box.scrollHeight - box.scrollTop - box.clientHeight < 300) onEndReached();
  };

  return (
    <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-6">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 py-3.5">
        {rows.map((row, index) => {
          const guid = typeof row.guid === "string" ? row.guid : String(index);
          const name = title ? text(title, row) : "";
          const src = photo ? toList(row[photo.slug])[0] : undefined;
          const subtitle = rest
            .map((field) => ({ field, node: part(field, row) }))
            .filter((item) => item.node !== null);
          const state = status ? toList(row[status.slug])[0] : undefined;
          const showState = state !== undefined && state !== usual;

          return (
            <li key={`${guid}:${index}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenRow(guid)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenRow(guid);
                  }
                }}
                className="flex h-full cursor-pointer flex-col rounded-[8px] border border-border bg-surface px-4 pt-4 pb-2.5 shadow-raised transition-colors hover:bg-surface-hover"
              >
                <div className="flex items-center gap-3.5 border-b border-border pb-3">
                  <Avatar name={name} photo={src} size="xl" />

                  <div className="flex min-w-0 flex-col">
                    <b className="truncate text-[15px] font-semibold">{name || "—"}</b>
                    {subtitle.length > 0 && (
                      <small className="text-[13px] leading-[1.4] text-fg-muted">
                        {subtitle.map((item, at) => (
                          <span key={item.field.id} className="inline-flex max-w-full items-center">
                            {at > 0 && <span className="px-1">·</span>}
                            {item.node}
                          </span>
                        ))}
                      </small>
                    )}
                    {status && showState && (
                      <span className="mt-1.5 flex">
                        <Cell
                          field={status}
                          row={row}
                          tableSlug={tableSlug}
                          relations={byId}
                          locale={locale}
                          language={language}
                        />
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex min-h-8 items-center gap-0.5 pt-2">
                  {contacts.map((field) => {
                    const value = isBlank(row[field.slug]) ? "" : String(row[field.slug]);
                    const contact = contactOf(field);
                    if (!value || !contact) return null;

                    return (
                      <a
                        key={field.id}
                        href={contact.href(value)}
                        target="_blank"
                        rel="noreferrer"
                        title={value}
                        aria-label={value}
                        onClick={(event) => event.stopPropagation()}
                        className="grid size-6 place-items-center rounded-[5px] text-fg-subtle transition-colors hover:bg-surface-active hover:text-fg-muted"
                      >
                        <Icon as={contact.icon} size={15} />
                      </a>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}

        {onAdd && (
          <li>
            <button
              type="button"
              onClick={onAdd}
              className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Icon as={PlusIcon} size={18} />
              {t("table.addRow")}
            </button>
          </li>
        )}
      </ul>

      {!rows.length && !onAdd && (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("table.noRows")}</p>
      )}
    </div>
  );
}

/**
 * Чем связаться по значению поля. Telegram — по слагу: своего типа
 * у него нет, это SINGLE_LINE (`employees.telegram_username`).
 */
function contactOf(field: Field): { icon: LucideIcon; href: (value: string) => string } | null {
  if (field.type === "EMAIL") return { icon: MailIcon, href: (value) => `mailto:${value}` };
  if (field.type === "PHONE" || field.type === "INTERNATION_PHONE") {
    return { icon: PhoneIcon, href: (value) => `tel:${value.replace(/[^\d+]/g, "")}` };
  }
  if (field.slug.includes("telegram")) {
    return { icon: SendIcon, href: (value) => `https://t.me/${value.replace(/^@/, "")}` };
  }
  return null;
}

/** Самое частое значение. Ничьё — первое из равных. */
export function mostCommon(values: (string | undefined)[]) {
  const counts = new Map<string, number>();
  for (const value of values) if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | undefined;
  for (const [value, count] of counts) if (best === undefined || count > counts.get(best)!) best = value;
  return best;
}

const AVATAR_SIZES = {
  sm: "size-5 text-[9px]",
  md: "size-6 text-[11px]",
  lg: "size-8 text-xs",
  xl: "size-14 text-xl",
};

/**
 * Аватар человека — `.avatar` прототипа: фото, иначе инициалы на цвете
 * от имени. Один на сетку и оргструктуру, чтобы человек везде был
 * одного цвета.
 */
export function Avatar({
  name,
  photo,
  size = "md",
}: {
  name: string;
  photo?: string | undefined;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const box = AVATAR_SIZES[size];

  return photo ? (
    <img
      src={photo}
      alt=""
      loading="lazy"
      draggable={false}
      className={`shrink-0 rounded-full object-cover ${box}`}
    />
  ) : (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${box} ${CHIP_STYLES[colorOf(name)]}`}
    >
      {initials(name)}
    </span>
  );
}

/** «Иванов Пётр» → «ИП». */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0]?.[0] ?? "")).toUpperCase();
}

/**
 * Цвет аватара без фото — от имени, чтобы человек был одного цвета
 * на каждой карточке. Прототип красит по отделу; отдела в общем случае
 * нет, а имя есть всегда. Серый пропущен: он читается как «пусто».
 */
export function colorOf(name: string) {
  const palette = CHIP_COLORS.filter((color) => color !== "gray");
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}
