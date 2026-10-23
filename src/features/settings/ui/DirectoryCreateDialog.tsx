import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, GitForkIcon, Trash2Icon } from "lucide-react";
import {
  ActiveCell,
  Cell,
  blankItem,
  cellKind,
  type CellKind,
  relationDataKey,
  rowErrors,
  useCreateItem,
  useUpdateItem,
  type Item,
} from "@/features/item";
import { IconPicker } from "@/features/icons";
import { localized, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { CHIP_COLORS, CHIP_DOT, CHIP_HEX, hexToChipColor } from "@/shared/ui/chip";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown, type DropdownItem } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { TimeInput } from "@/shared/ui/time-input";

/**
 * Новая запись справочника — окно, как «Создать» в графике работы:
 * подпись над полем, поле ввода, «Отмена» и «Создать» внизу.
 *
 * Простые типы — свои поля ввода. Остальное (связь, цвет, иконка,
 * время, выбор из вариантов) — кнопка в рамке поля, а по щелчку тот же
 * редактор, что у ячейки (ActiveCell): у каждого типа он уже есть,
 * и второй набор редакторов разошёлся бы с первым.
 */
/** Короткие значения — по два в ряд; текст, связь, файлы — на всю ширину. */
const HALF = new Set<CellKind>(["icon", "time", "number", "date", "datetime", "datetime_naive", "status", "multiselect"]);

export function DirectoryCreateDialog({
  table,
  title,
  fields,
  relations,
  language,
  row,
  readOnly = false,
  defaults,
  parent,
  note,
  iconSlug,
  layout,
  onDelete,
  onClose,
}: {
  /**
   * Раскладка по секциям (`Directory.form`): подзаголовок, порядок полей,
   * какие встают парой. Нет — все поля подряд в порядке схемы. Поле,
   * которого нет ни в одной секции, уходит в последнюю.
   */
  layout?: { title: string; fields: string[]; half?: string[] }[] | undefined;
  /** Текстовое поле с именем иконки (`Directory.iconField`) — правится пикером, как поле ICON. */
  iconSlug?: string | undefined;
  table: string;
  /** Запись на правку; нет — новая. */
  row?: Item | undefined;
  /** Прав на правку нет — только посмотреть. */
  readOnly?: boolean;
  title: string;
  fields: Field[];
  relations: Relation[];
  language: string;
  /** Значения новой записи поверх пустых: родитель и его цвет у «Добавить вложенный». */
  defaults?: Item | undefined;
  /**
   * Ссылка на себя — списком дерева, а не поиском связи: в нём нет
   * самой записи и её потомков, и цикл из окна не собрать.
   */
  parent?: { slug: string; options: DropdownItem[] } | undefined;
  /** Строка под полями: «Вложенных элементов: 3». */
  note?: string | undefined;
  onDelete?: (() => void) | undefined;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const create = useCreateItem(table);
  const update = useUpdateItem(table);
  const [draft, setDraft] = useState<Item>(() => row ?? { ...blankItem(fields), ...defaults });
  const [showErrors, setShowErrors] = useState(false);
  const [active, setActive] = useState<{ field: Field; anchor: DOMRect } | null>(null);
  const errors = rowErrors(fields, draft);
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const set = (slug: string, value: unknown) => setDraft((current) => ({ ...current, [slug]: value }));

  const submit = () => {
    if (errors.size) return setShowErrors(true);
    if (row) {
      // Уезжает только изменённое: PUT с полной строкой перезаписал бы и то, что правили рядом.
      const values = Object.fromEntries(fields.filter((field) => draft[field.slug] !== row[field.slug]).map((field) => [field.slug, draft[field.slug] ?? null]));
      if (!Object.keys(values).length) return onClose();
      return update.mutate(
        { guid: String(row["guid"]), values },
        {
          onSuccess: () => {
            toast.success(t("settings.saved"));
            onClose();
          },
        },
      );
    }
    create.mutate(draft, {
      onSuccess: () => {
        toast.success(t("table.rowCreated"));
        onClose();
      },
    });
  };

  // Иконка — слева от названия, как у пункта меню (MenuFormDialog): это часть имени, а не отдельное поле.
  const iconField = fields.find((field) => cellKind(field.type) === "icon" || field.slug === iconSlug);
  const titleField = fields.find((field) => cellKind(field.type) === "text" && field !== iconField);
  const iconPicker = (field: Field) => (
    <IconPicker value={typeof draft[field.slug] === "string" ? String(draft[field.slug]) : ""} type="ICON" onChange={(icon) => set(field.slug, icon || null)} />
  );

  const control = (field: Field) => {
    const value = draft[field.slug];
    const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
    if (field.slug === parent?.slug) {
      return (
        <Dropdown
          value={text}
          items={[{ value: "", label: t("dir.topLevel") }, ...parent.options]}
          onChange={(guid) => setDraft((current) => ({ ...current, [field.slug]: guid || null, [relationDataKey(field.slug)]: undefined }))}
        />
      );
    }
    if (field === iconField) return iconPicker(field);
    switch (cellKind(field.type)) {
      case "text":
      case "link": {
        const input = <Input value={text} autoFocus={field === titleField} onChange={(event) => set(field.slug, event.target.value)} />;
        return field === titleField && iconField ? (
          <div className="flex items-center gap-2">
            {iconPicker(iconField)}
            {input}
          </div>
        ) : (
          input
        );
      }
      case "icon":
        return iconPicker(field);
      case "time":
        return <TimeInput value={text.slice(0, 5)} onChange={(time) => set(field.slug, time || null)} />;
      case "color": {
        const chosen = text ? hexToChipColor(text) : null;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {CHIP_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={chosen === color}
                onClick={() => set(field.slug, CHIP_HEX[color])}
                className={`size-6 rounded-full ${CHIP_DOT[color]} transition-shadow ${
                  chosen === color ? "ring-2 ring-fg-subtle ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-border-strong"
                }`}
              />
            ))}
          </div>
        );
      }
      case "longtext":
        return (
          <textarea
            rows={3}
            value={text}
            onChange={(event) => set(field.slug, event.target.value)}
            className="w-full resize-y rounded-md border border-border-strong bg-input px-2.5 py-2 text-sm text-fg outline-none transition-colors hover:border-fg-subtle focus:border-accent"
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={text}
            onChange={(event) => set(field.slug, event.target.value === "" ? null : Number(event.target.value))}
          />
        );
      case "date":
        return <DatePicker value={text.slice(0, 10)} locale={i18n.language} onChange={(date) => set(field.slug, date || null)} />;
      default:
        return (
          <button
            type="button"
            onClick={(event) => setActive({ field, anchor: event.currentTarget.getBoundingClientRect() })}
            className="flex min-h-(--spacing-input) w-full min-w-0 items-center gap-2 rounded-md border border-border-strong bg-input px-2.5 py-1 text-left text-sm transition-colors hover:border-fg-subtle"
          >
            <span className="min-w-0 flex-1 truncate">
              <Cell field={field} row={draft} tableSlug={table} relations={byId} locale={i18n.language} language={language} />
            </span>
            <Icon as={ChevronDownIcon} size={14} className="shrink-0 text-fg-subtle" />
          </button>
        );
    }
  };

  const label = (field: Field) => (
    <span className="text-[13px] text-fg-muted">
      {localized(field.labels, language, field.label)}
      {field.required && <span className="text-danger"> *</span>}
    </span>
  );

  const shown = fields
    .filter((field) => !(field === iconField && titleField))
    .filter((field) => cellKind(field.type) !== "label" && cellKind(field.type) !== "button" && cellKind(field.type) !== "formula");

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">{title}</h2>

        <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3.5 overflow-auto px-5 pb-4">
          {(layout ? sectioned(shown, layout) : [{ title: "", fields: shown, half: undefined }]).map((section, index) => [
            section.title && (
              <h3
                key={`h-${section.title}`}
                className={`col-span-2 text-xs font-medium tracking-wide text-fg-subtle uppercase ${index ? "mt-2 border-t border-border pt-4" : ""}`}
              >
                {section.title}
              </h3>
            ),
            ...section.fields.map((field) =>
              cellKind(field.type) === "boolean" ? (
                // Флажок — подписью справа, как «Заменить существующие смены»: рамка поля ему ни к чему.
                <label key={field.slug} className="flex h-(--spacing-input) cursor-pointer items-center gap-2.5 self-end text-sm text-fg">
                  <Checkbox checked={draft[field.slug] === true} onChange={() => set(field.slug, draft[field.slug] !== true)} />
                  {localized(field.labels, language, field.label)}
                </label>
              ) : (
                <div
                  key={field.slug}
                  className={`flex flex-col gap-1.5 ${(section.half ? section.half.includes(field.slug) : HALF.has(cellKind(field.type))) ? "" : "col-span-2"}`}
                >
                  {label(field)}
                  {control(field)}
                  {showErrors && errors.has(field.slug) && (
                    <span className="text-xs text-danger">{errors.get(field.slug)!.message || t("table.fillRequired", { count: 1 })}</span>
                  )}
                </div>
              ),
            ),
          ])}
          {note && (
            <p className="col-span-2 flex items-center gap-1.5 text-[13px] text-fg-subtle">
              <Icon as={GitForkIcon} size={14} />
              {note}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {onDelete && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              <Icon as={Trash2Icon} size={14} />
              {t("action.delete")}
            </Button>
          )}
          {showErrors && errors.size > 0 && <span className="mr-auto text-xs text-danger">{t("table.fillRequired", { count: errors.size })}</span>}
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          {!readOnly && (
            <Button disabled={create.isPending || update.isPending} onClick={submit}>
              {row ? t("action.save") : t("action.create")}
            </Button>
          )}
        </div>
      </div>

      {active && (
        <ActiveCell
          key={active.field.slug}
          field={active.field}
          row={draft}
          guid={String(draft["guid"] ?? "")}
          tableSlug={table}
          anchor={active.anchor}
          relations={byId}
          locale={i18n.language}
          language={language}
          creating
          onEdit={(value) => set(active.field.slug, value)}
          onLink={(item) =>
            setDraft((current) => ({ ...current, [active.field.slug]: item?.guid ?? null, [relationDataKey(active.field.slug)]: item }))
          }
          onClose={() => setActive(null)}
        />
      )}
    </Modal>
  );
}

/** Поля по секциям раскладки; не попавшие ни в одну — в конец последней. */
function sectioned(fields: Field[], layout: { title: string; fields: string[]; half?: string[] }[]) {
  const bySlug = new Map(fields.map((field) => [field.slug, field]));
  const placed = new Set(layout.flatMap((section) => section.fields));
  const rest = fields.filter((field) => !placed.has(field.slug));
  return layout
    .map((section, index) => ({
      title: section.title,
      half: section.half,
      fields: [...section.fields.flatMap((slug) => bySlug.get(slug) ?? []), ...(index === layout.length - 1 ? rest : [])],
    }))
    .filter((section) => section.fields.length);
}
