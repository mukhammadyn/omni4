import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "lucide-react";
import {
  ActiveCell,
  Cell,
  blankItem,
  cellKind,
  relationDataKey,
  rowErrors,
  useCreateItem,
  type Item,
} from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { DatePicker } from "@/shared/ui/date-picker";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";

/**
 * Новая запись справочника — окно, как «Создать» в графике работы:
 * подпись над полем, поле ввода, «Отмена» и «Создать» внизу.
 *
 * Простые типы — свои поля ввода. Остальное (связь, цвет, иконка,
 * время, выбор из вариантов) — кнопка в рамке поля, а по щелчку тот же
 * редактор, что у ячейки (ActiveCell): у каждого типа он уже есть,
 * и второй набор редакторов разошёлся бы с первым.
 */
export function DirectoryCreateDialog({
  table,
  title,
  fields,
  relations,
  language,
  onClose,
}: {
  table: string;
  title: string;
  fields: Field[];
  relations: Relation[];
  language: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const create = useCreateItem(table);
  const [draft, setDraft] = useState<Item>(() => blankItem(fields));
  const [showErrors, setShowErrors] = useState(false);
  const [active, setActive] = useState<{ field: Field; anchor: DOMRect } | null>(null);
  const errors = rowErrors(fields, draft);
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const set = (slug: string, value: unknown) => setDraft((current) => ({ ...current, [slug]: value }));

  const submit = () => {
    if (errors.size) return setShowErrors(true);
    create.mutate(draft, {
      onSuccess: () => {
        toast.success(t("table.rowCreated"));
        onClose();
      },
    });
  };

  const control = (field: Field) => {
    const value = draft[field.slug];
    const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
    switch (cellKind(field.type)) {
      case "text":
      case "link":
        return <Input value={text} onChange={(event) => set(field.slug, event.target.value)} />;
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

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">{title}</h2>

        <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
          {fields
            .filter((field) => cellKind(field.type) !== "label" && cellKind(field.type) !== "button" && cellKind(field.type) !== "formula")
            .map((field) =>
              cellKind(field.type) === "boolean" ? (
                // Флажок — подписью справа, как «Заменить существующие смены»: рамка поля ему ни к чему.
                <label key={field.slug} className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
                  <Checkbox checked={draft[field.slug] === true} onChange={() => set(field.slug, draft[field.slug] !== true)} />
                  {localized(field.labels, language, field.label)}
                </label>
              ) : (
                <div key={field.slug} className="flex flex-col gap-1.5">
                  {label(field)}
                  {control(field)}
                  {showErrors && errors.has(field.slug) && (
                    <span className="text-xs text-danger">{errors.get(field.slug)!.message || t("table.fillRequired", { count: 1 })}</span>
                  )}
                </div>
              ),
            )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {showErrors && errors.size > 0 && <span className="mr-auto text-xs text-danger">{t("table.fillRequired", { count: errors.size })}</span>}
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={create.isPending} onClick={submit}>
            {t("action.create")}
          </Button>
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
