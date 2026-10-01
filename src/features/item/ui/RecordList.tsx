import type { UIEvent } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Field, Relation } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import type { Item } from "../model/types";
import { Cell } from "./Cell";

/**
 * Список — `r_list` прототипа (`.nlist`, `.nli`): строка 40px, имя
 * записи слева, остальные колонки view — справа мелким текстом.
 *
 * В прототипе списков несколько: свой у задач проекта (с группами
 * и колонками), свои у посещаемости и обучений. Взят общий — тот, что
 * движок прототипа рисует для любой таблицы вкладкой «Список»: ему
 * не нужно ничего, кроме колонок view.
 *
 * Строки и всё вокруг них — те же, что у таблицы: отбор, сортировка,
 * поиск, страницы и «Свойства» работают без единой своей ветки
 * (routes/_authed.m.$menuId). Первая колонка view — имя записи, как
 * и в таблице, где она шире прочих.
 *
 * Без виртуализации: страница — это 20–200 строк по 40px. Предел —
 * догрузка прокруткой: дорастёт до тысяч строк — вынести окно строк
 * из DataGrid (useVirtualizer) и поставить сюда.
 */
export function RecordList({
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
  /** «Новая запись» под строками. Нет — права на запись нет. */
  onAdd?: (() => void) | undefined;
  /** Докрутили до конца — пора следующий кусок. Как у DataGrid. */
  onEndReached?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const [title, ...props] = columns;
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

  // Запас в пять строк: следующий кусок едет, пока человек докручивает.
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (onEndReached && box.scrollHeight - box.scrollTop - box.clientHeight < 200) onEndReached();
  };

  return (
    /* Поля 24px — те же, что у таблицы и строки вкладок (`.page.full`). */
    <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-6 pt-1">
      {/* Пустое значение — пусто, без прочерка и без зазора на его месте:
          справа стоят только заполненные свойства, как `fmtVal` прототипа.
          Подсказка «связать» (`data-placeholder`) — тоже не значение. */}
      <ul className="[&_[data-empty]]:hidden">
        {rows.map((row, index) => {
          const guid = typeof row.guid === "string" ? row.guid : String(index);

          return (
            <li key={`${guid}:${index}`} className="border-b border-border">
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
                className="flex h-10 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[5px] px-1.5 text-sm transition-colors hover:bg-surface-hover"
              >
                <span className="flex min-w-0 flex-1 items-center font-medium">
                  {title && cell(title, row)}
                </span>

                <span className="flex max-w-[65%] shrink-0 items-center justify-end gap-3.5 overflow-hidden text-xs text-fg-muted">
                  {props.map((field) => (
                    <span
                      key={field.id}
                      className="flex max-w-48 min-w-0 shrink-0 items-center has-[[data-empty],[data-placeholder]]:hidden"
                    >
                      {cell(field, row)}
                    </span>
                  ))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {!rows.length && (
        <p className="py-8 text-center text-sm text-fg-subtle">{t("table.noRows")}</p>
      )}

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-row w-full items-center gap-1.5 rounded-[5px] px-2 text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={PlusIcon} size={16} />
          {t("table.addRow")}
        </button>
      )}
    </div>
  );
}

/** Заглушка той же геометрии: строки 40px, имя слева, свойства справа. */
export function ListSkeleton({ rows = 14 }: { rows?: number }) {
  const widths = [55, 35, 45, 60, 40, 50];

  return (
    <div className="min-h-0 flex-1 overflow-hidden px-6 pt-1" aria-hidden>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-10 items-center gap-3.5 border-b border-border px-1.5">
          <div
            className="h-3 rounded-sm bg-surface-active"
            style={{ width: `${widths[row % widths.length]! * 0.6}%` }}
          />
          <div className="ml-auto h-3 w-16 rounded-sm bg-surface-active" />
          <div className="h-3 w-20 rounded-sm bg-surface-active" />
        </div>
      ))}
    </div>
  );
}
