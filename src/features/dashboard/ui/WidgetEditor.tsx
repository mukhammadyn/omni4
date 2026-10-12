import { useState } from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, ChartSetup, chartTitle, useItems } from "@/features/item";
import { localized, useTables, useTableSchema } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { SelectMenu } from "@/shared/ui/select-menu";
import { SAMPLE, type Widget } from "../model/dashboard";

const noop = () => {};

/**
 * Редактор виджета — диалог с предпросмотром, как «Добавить виджет»
 * в professio (ADR-0013): слева таблица и настройки, справа тот же
 * график, что встанет на дашборд. Ничего не пишется до «Сохранить».
 */
export function WidgetEditor({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: Widget;
  isNew: boolean;
  onSave: (widget: Widget) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [draft, setDraft] = useState(initial);
  const slug = draft.tableSlug || undefined;
  const { schema } = useTableSchema(slug);
  const items = useItems(slug, { limit: SAMPLE, page: 1 });
  const change = (patch: Partial<Widget>) => setDraft((current) => ({ ...current, ...patch }));

  /*
   * Название, как в professio: стоит в поле готовым («Отделы · Количество»)
   * и идёт за настройками, пока его не правили руками. Стёрли — снова
   * собирается само. Сохраняется то, что видно.
   */
  const derived = chartTitle(draft, schema.fields, language, t);
  const [custom, setCustom] = useState(() => Boolean(initial.title));
  const title = custom ? draft.title : derived;

  return (
    /* Окно прижато к верху: раскрытый список полей растит его вниз,
       а не дёргает вверх-вниз, как окно по центру. */
    <Modal onClose={onClose} className="flex items-start justify-center px-4 pt-[8vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")}
        className="flex max-h-[88vh] w-[1000px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal"
      >
        <header className="flex shrink-0 items-start gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{t(isNew ? "dashboard.addWidget" : "dashboard.editWidget")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t("dashboard.editorHint")}</p>
          </div>
          <button
            type="button"
            aria-label={t("action.close")}
            onClick={onClose}
            className="-mt-1 -mr-2 grid size-8 cursor-pointer place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Icon as={XIcon} size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 pb-1 md:grid-cols-[340px_1fr]">
          {/* Настройки — сверху вниз в порядке вопроса: откуда, что, как. */}
          <div className="flex flex-col gap-4 pb-1">
            <TablePicker
              value={draft.tableSlug}
              // Поля прежней таблицы в новой не значат ничего.
              onPick={(tableSlug) => change({ tableSlug, groupSlug: "", splitSlug: "", valueSlug: "" })}
            />
            {slug ? (
              <ChartSetup config={draft} columns={schema.fields} language={language} onChange={change} stacked />
            ) : (
              <p className="text-sm text-fg-subtle">{t("dashboard.pickTableFirst")}</p>
            )}
            <Field label={t("dashboard.widgetTitle")}>
              <Input
                value={title}
                placeholder={t("dashboard.widgetTitleHint")}
                onChange={(event) => {
                  setCustom(Boolean(event.target.value.trim()));
                  change({ title: event.target.value });
                }}
              />
            </Field>
          </div>

          {/* Предпросмотр — одной панелью: подпись, заголовок, график.
              Липнет к верху, пока прокручивается длинная форма. */}
          <div className="flex h-[460px] min-w-0 flex-col gap-1 self-start rounded-xl border border-border p-5 md:sticky md:top-0">
            <span className="text-sm text-fg-muted">{t("dashboard.preview")}</span>
            <ChartCard
              config={{ ...draft, title, width: 12 }}
              columns={schema.fields}
              relations={schema.relations}
              rows={items.page.rows}
              language={language}
              editing={false}
              dragged={false}
              over={false}
              onDragStart={noop}
              onDragEnd={noop}
              onDragOver={noop}
              onDrop={noop}
              onMove={noop}
              onChange={noop}
              onRemove={noop}
              plain
            />
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 px-6 pt-4 pb-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="button" disabled={!slug} onClick={() => onSave({ ...draft, title: title.trim() })}>
            {t(isNew ? "dashboard.addWidget" : "action.save")}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}

function TablePicker({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { current: language } = useDataLanguages();
  const tables = useTables(search);
  const picked = tables.items.find((table) => table.slug === value);

  return (
    <SelectMenu
      label={t("menuForm.table")}
      placeholder={picked ? localized(picked.labels, language, picked.label) : value || t("menuForm.tablePick")}
      searchPlaceholder={t("menuForm.tableSearch")}
      emptyText={t("menuForm.tableEmpty")}
      items={tables.items.map((table) => ({
        value: table.slug,
        label: localized(table.labels, language, table.label),
        icon: table.icon,
      }))}
      selected={new Set(value ? [value] : [])}
      search={search}
      loading={tables.isLoading}
      hasMore={tables.hasMore}
      onSearch={setSearch}
      onLoadMore={tables.loadMore}
      onPick={onPick}
    />
  );
}
