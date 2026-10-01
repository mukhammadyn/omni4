import type { UIEvent } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Field, Relation } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import { cellKind } from "../model/cell-kind";
import { toList } from "../model/cell-value";
import type { Item } from "../model/types";
import { Cell } from "./Cell";

/**
 * Галерея — карточки сеткой, `r_gallery` прототипа (`.gallery`, `.gcard`).
 *
 * Сеток в прототипе несколько: общая (имя и свойства столбиком), своя
 * у имущества (`properties`, цветная обложка с иконкой категории), своя
 * у проектов (эмодзи, прогресс, участники). Взята общая — и к ней то,
 * что у двух других не про их данные: обложка сверху, когда она есть,
 * и пустая карточка «новая запись» последней.
 *
 * Обложка — первая колонка-картинка с непустым значением, то же правило,
 * что у карточки доски. Нет картинки среди колонок — нет и обложки:
 * карточка без неё короче, а не с пустым прямоугольником.
 *
 * Строки и всё вокруг — от таблицы, как у RecordList: отбор, сортировка,
 * поиск, страницы, «Свойства». Первая колонка (не картинка) — имя
 * записи, остальные — строками под ним; пустые не занимают места.
 */
export function Gallery({
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
  /** Докрутили до конца — пора следующий кусок. Как у DataGrid. */
  onEndReached?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const images = columns.filter((field) => cellKind(field.type) === "image");
  const [title, ...props] = columns.filter((field) => !images.includes(field));
  const byId = new Map(relations.map((relation) => [relation.id, relation]));

  const cell = (field: Field, row: Item) => (
    <Cell
      field={field}
      row={row}
      tableSlug={tableSlug}
      relations={byId}
      locale={locale}
      language={language}
    />
  );

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (onEndReached && box.scrollHeight - box.scrollTop - box.clientHeight < 300) onEndReached();
  };

  return (
    /* Поля 24px — те же, что у таблицы и строки вкладок (`.page.full`). */
    <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-6">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 py-3.5 [&_[data-empty]]:hidden">
        {rows.map((row, index) => {
          const guid = typeof row.guid === "string" ? row.guid : String(index);
          const cover = images
            .map((field) => toList(row[field.slug])[0])
            .find((url): url is string => typeof url === "string" && url !== "");

          return (
            <li key={`${guid}:${index}`}>
              {/* Не <button>: у значений бывают свои кнопки (скопировать,
                  перейти по ссылке), а кнопка в кнопке — невалидный HTML. */}
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
                /* `.gcard`: радиус 8, тень карточки. Рамка — наша: тень
                   прототипа несёт обводку в себе, наша — без неё. */
                className="flex h-full cursor-pointer flex-col overflow-hidden rounded-[8px] border border-border bg-surface shadow-raised transition-colors hover:bg-surface-hover"
              >
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-34 w-full shrink-0 border-b border-border object-cover"
                  />
                )}

                <div className="flex min-w-0 flex-col gap-1.5 p-3">
                  <div className="flex min-h-5 min-w-0 items-center text-sm font-medium">
                    {title && cell(title, row)}
                  </div>

                  {props.map((field) => (
                    <div
                      key={field.id}
                      className="flex min-w-0 items-center text-xs text-fg-muted has-[[data-empty],[data-placeholder]]:hidden"
                    >
                      {cell(field, row)}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}

        {/* Последней — пустая карточка, как «Новый проект» в прототипе:
            новую запись ищут там, где кончаются старые. */}
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

/** Заглушка той же геометрии: сетка карточек с именем и двумя строками. */
export function GallerySkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden px-6" aria-hidden>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 py-3.5">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="flex flex-col gap-2.5 rounded-[8px] border border-border p-3">
            <div className="h-3.5 w-3/5 rounded-sm bg-surface-active" />
            <div className="h-3 w-2/5 rounded-sm bg-surface-active" />
            <div className="h-3 w-1/3 rounded-sm bg-surface-active" />
          </div>
        ))}
      </div>
    </div>
  );
}
