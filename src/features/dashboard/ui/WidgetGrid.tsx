import { useState } from "react";
import { ChartColumnIcon, CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, newChart, useItems } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { moveBefore } from "@/shared/lib/order";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { SAMPLE, type Widget } from "../model/dashboard";
import { WidgetEditor } from "./WidgetEditor";

/**
 * Сетка виджетов дашборда: карточки CHART, у каждой своя таблица.
 * Порядок и размер — как у CHART: 12 колонок, перестановка броском.
 * Сам виджет настраивается в диалоге (WidgetEditor), не в карточке.
 */
export function WidgetGrid({
  widgets,
  editing,
  editable,
  onWidgets,
}: {
  widgets: Widget[];
  editing: boolean;
  /** Можно ли менять дашборд вообще — тогда пустой экран зовёт добавить. */
  editable: boolean;
  onWidgets: (next: Widget[]) => void;
}) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** Открытый редактор: виджет и новый ли он. */
  const [editor, setEditor] = useState<{ widget: Widget; isNew: boolean } | null>(null);

  const reorder = (ids: string[]) =>
    onWidgets(ids.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => Boolean(w)));

  const move = (id: string, delta: number) => {
    const ids = widgets.map((w) => w.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    reorder(ids);
  };

  const drop = (target: string) => {
    if (dragged && dragged !== target) reorder(moveBefore(widgets.map((w) => w.id), dragged, target));
    setDragged(null);
    setOver(null);
  };

  const add = () => setEditor({ widget: { ...newChart(), tableSlug: "" }, isNew: true });

  const save = (widget: Widget) => {
    onWidgets(
      widgets.some((w) => w.id === widget.id)
        ? widgets.map((w) => (w.id === widget.id ? widget : w))
        : [...widgets, widget],
    );
    setEditor(null);
  };

  const dialog = editor && (
    <WidgetEditor
      key={editor.widget.id}
      initial={editor.widget}
      isNew={editor.isNew}
      onSave={save}
      onClose={() => setEditor(null)}
    />
  );

  if (!widgets.length) {
    /* Пустой дашборд — как «Моя аналитика» professio: зовёт собрать. */
    return (
      <>
        <div className="grid place-items-center rounded-lg border border-dashed border-border px-8 py-20 text-center">
          <div className="flex max-w-md flex-col items-center gap-2">
            <span className="mb-1 grid size-12 place-items-center rounded-xl bg-accent-subtle text-accent-text">
              <Icon as={ChartColumnIcon} size={22} />
            </span>
            <h3 className="text-base font-semibold text-fg">{t("dashboard.emptyTitle")}</h3>
            <p className="text-sm text-fg-muted">{t("dashboard.emptyDescription")}</p>
            {editable && (
              <Button type="button" size="sm" className="mt-2" onClick={add}>
                <Icon as={PlusIcon} size={14} />
                {t("dashboard.addFirstWidget")}
              </Button>
            )}
          </div>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-12">
      {widgets.map((widget) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          editing={editing}
          dragged={dragged === widget.id}
          over={over === widget.id && Boolean(dragged)}
          onDragStart={() => setDragged(widget.id)}
          onDragEnd={() => {
            setDragged(null);
            setOver(null);
          }}
          onDragOver={() => setOver(widget.id)}
          onDrop={() => drop(widget.id)}
          onMove={(delta) => move(widget.id, delta)}
          onChange={(patch) => onWidgets(widgets.map((w) => (w.id === widget.id ? { ...w, ...patch } : w)))}
          onRemove={() => onWidgets(widgets.filter((w) => w.id !== widget.id))}
          onEdit={() => setEditor({ widget, isNew: false })}
          onDuplicate={() => {
            const at = widgets.indexOf(widget) + 1;
            const copy = { ...widget, id: crypto.randomUUID(), title: widget.title && `${widget.title} (${t("dashboard.copy")})` };
            onWidgets([...widgets.slice(0, at), copy, ...widgets.slice(at)]);
          }}
        />
      ))}

      {/* Место под следующий виджет — в самой сетке, размером с новый:
          видно, куда он встанет. */}
      {editing && (
        <button
          type="button"
          onClick={add}
          className="flex h-[260px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-fg-muted transition-colors hover:border-accent hover:bg-accent-subtle hover:text-accent-text lg:col-span-6"
        >
          <Icon as={PlusIcon} size={20} />
          {t("dashboard.addWidget")}
        </button>
      )}
      {dialog}
    </div>
  );
}

/**
 * Карточка CHART со своей таблицей. Строки — тем же get-list, что
 * у таблиц, поэтому права роли на записи соблюдены. Виджеты одной
 * таблицы делят запрос: ключ кэша — тело запроса.
 *
 * ponytail: связи разворачиваются (без `relations: false`), чтобы
 * подписи ссылок были без догрузки по guid; общих фильтров, прав
 * на поля и валют пока нет — шаги 4–5 ADR-0013.
 */
function WidgetCard({
  widget,
  editing,
  onChange,
  onEdit,
  onDuplicate,
  ...card
}: {
  widget: Widget;
  editing: boolean;
  dragged: boolean;
  over: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onMove: (delta: number) => void;
  onChange: (patch: Partial<Widget>) => void;
  onRemove: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const slug = widget.tableSlug || undefined;
  const { schema } = useTableSchema(slug);
  const items = useItems(slug, { limit: SAMPLE, page: 1 });
  const { rows, count } = items.page;

  const action = (label: string, icon: typeof PencilIcon, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <Icon as={icon} size={14} />
    </button>
  );

  return (
    <ChartCard
      {...card}
      config={widget}
      columns={schema.fields}
      relations={schema.relations}
      rows={rows}
      language={language}
      editing={editing}
      onChange={onChange}
      inlineSetup={false}
      headerActions={
        <>
          {action(t("dashboard.duplicate"), CopyIcon, onDuplicate)}
          {action(t("dashboard.editWidget"), PencilIcon, onEdit)}
        </>
      }
      aside={
        !slug ? (
          /* Виджет без таблицы — недонастроенный: говорим, что делать. */
          <p className="text-2xs text-fg-subtle">{t("dashboard.unconfigured")}</p>
        ) : items.error ? (
          <p className="text-2xs text-danger">{items.error}</p>
        ) : (
          rows.length < count && (
            <p className="text-2xs text-fg-subtle">{t("dashboard.sampled", { shown: rows.length, total: count })}</p>
          )
        )
      }
    />
  );
}
