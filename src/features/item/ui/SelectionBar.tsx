import { useRef, useState } from "react";
import { DownloadIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localized, type Field, type Relation } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import { editorKind } from "../model/cell-kind";
import { isLinkable } from "../model/relation";
import { relationDataKey, type Item } from "../model/types";
import { ActiveCell } from "./CellEditor";
import { fieldIcon } from "./field-icon";

/**
 * Панель над отмеченными строками — `.bulkbar` прототипа: снизу по
 * центру, «N выбрано», правка поля сразу во всех, экспорт, удаление.
 *
 * Правится выбор — статус, мультивыбор, связь: то, что ставят кликом
 * и одинаково для многих. Текст и дату разом не правят.
 *
 * Редактор — тот же, что у ячейки (ActiveCell), над пустой строкой:
 * выбранное копится в ней и уезжает во все строки при закрытии. Иначе
 * мультивыбор слал бы запрос на каждую галочку в каждую строку.
 */
export function SelectionBar({
  count,
  columns,
  relations,
  tableSlug,
  locale,
  language,
  onEdit,
  onExport,
  onDelete,
  onClear,
  busy,
}: {
  count: number;
  columns: Field[];
  relations: Relation[];
  tableSlug: string;
  locale: string;
  language: string;
  /** Нет — права на правку нет, и кнопок полей тоже. */
  onEdit?: ((values: Record<string, unknown>) => void) | undefined;
  onExport?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onClear: () => void;
  busy?: boolean | undefined;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ field: Field; anchor: DOMRect } | null>(null);
  /* Редактор зовёт onEdit и тут же onClose — в одном тике, и state
     к закрытию ещё старый. Поэтому черновик и в ref. */
  const [draft, setDraft] = useState<Item>({});
  const latest = useRef<Item>({});
  const patch = (values: Item) => {
    latest.current = { ...latest.current, ...values };
    setDraft(latest.current);
  };
  const byId = new Map(relations.map((relation) => [relation.id, relation]));

  const fields = onEdit
    ? columns.filter((field) => {
        const kind = editorKind(field);
        if (kind === "status" || kind === "multiselect") return true;
        const relation = field.relationId ? byId.get(field.relationId) : undefined;
        return kind === "relation" && relation !== undefined && isLinkable(relation.type);
      })
    : [];

  const close = () => {
    if (editing && editing.field.slug in latest.current) onEdit?.(latest.current);
    setEditing(null);
    latest.current = {};
    setDraft({});
  };

  const base =
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-sm transition-colors hover:bg-surface-hover disabled:opacity-50";
  const button = `${base} text-fg-muted hover:text-fg`;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-popover">
        <span className="shrink-0 px-2.5 text-sm font-medium text-accent-text">
          {t("table.filterChosen", { count })}
        </span>
        {/* Полей бывает с десяток (сделка): полоса полей фиксированной
            ширины и прокручивается сама — колесом мыши вбок, а нажатая
            кнопка доезжает до видимой части. «Удалить» и крестик всегда
            на виду. Полоса прокрутки скрыта: обрезанная кнопка у края
            и так говорит, что дальше есть ещё. */}
        <div
          className="flex max-w-[480px] min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onWheel={(event) => {
            if (!event.deltaX) event.currentTarget.scrollLeft += event.deltaY;
          }}
        >
        {fields.map((field) => (
          <button
            key={field.id}
            type="button"
            disabled={busy}
            className={button}
            onClick={(event) => {
              const target = event.currentTarget;
              target.scrollIntoView({ block: "nearest", inline: "nearest" });
              setEditing({ field, anchor: target.getBoundingClientRect() });
            }}
          >
            <Icon as={fieldIcon(field.type)} size={16} />
            {localized(field.labels, language, field.label)}
          </button>
        ))}
        </div>
        {onExport && (
          <button type="button" className={button} onClick={onExport}>
            <Icon as={DownloadIcon} size={16} />
            {t("view.export")}
          </button>
        )}
        {onDelete && (
          <button type="button" disabled={busy} className={`${base} text-danger`} onClick={onDelete}>
            <Icon as={Trash2Icon} size={16} />
            {t("action.delete")}
          </button>
        )}
        <button type="button" aria-label={t("action.close")} title={t("action.close")} className={`${button} px-1.5`} onClick={onClear}>
          <Icon as={XIcon} size={16} />
        </button>
      </div>

      {editing && (
        <ActiveCell
          field={editing.field}
          row={draft}
          guid={undefined}
          tableSlug={tableSlug}
          anchor={editing.anchor}
          relations={byId}
          locale={locale}
          language={language}
          creating
          onEdit={(value) => patch({ [editing.field.slug]: value })}
          onLink={(item) =>
            patch({ [editing.field.slug]: item?.["guid"] ?? null, [relationDataKey(editing.field.slug)]: item })
          }
          onClose={close}
        />
      )}
    </>
  );
}
