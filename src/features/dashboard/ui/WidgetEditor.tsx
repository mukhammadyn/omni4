import { useState } from "react";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChartCard, ChartSetup, FilterBar, chartTitle, filterKind, useItems } from "@/features/item";
import { localized, useTables, useTableSchema, type Field as TableField, type Relation } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { SelectMenu } from "@/shared/ui/select-menu";
import { SAMPLE, type Widget } from "../model/dashboard";
import { filterKey, type Answer, type DashFilter } from "../model/filters";

const noop = () => {};

/**
 * Редактор виджета — диалог с предпросмотром, как «Добавить виджет»
 * в professio (ADR-0013): слева таблица и настройки, справа тот же
 * график, что встанет на дашборд. Ничего не пишется до «Сохранить».
 */
export function WidgetEditor({
  initial,
  isNew,
  filters,
  onSave,
  onClose,
}: {
  initial: Widget;
  /** Общие фильтры дашборда — виджет выбирает, каким полем на них отвечать. */
  filters: DashFilter[];
  isNew: boolean;
  onSave: (widget: Widget) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [draft, setDraft] = useState(initial);
  const slug = draft.tableSlug || undefined;
  const { schema } = useTableSchema(slug);
  const items = useItems(slug, { limit: SAMPLE, page: 1, filters: draft.filters });
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
              onPick={(tableSlug) =>
                change({ tableSlug, groupSlug: "", splitSlug: "", valueSlug: "", filters: {}, answers: {} })
              }
            />
            {slug ? (
              <>
                <ChartSetup config={draft} columns={schema.fields} language={language} onChange={change} stacked />
                {filters.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-fg">{t("dashboard.answers")}</span>
                    {filters.map((filter) => {
                      const key = filterKey(filter);
                      return (
                        <AnswerPicker
                          key={key}
                          filter={filter}
                          fields={schema.fields}
                          relations={schema.relations}
                          language={language}
                          value={draft.answers[key]}
                          onChange={(answer) => {
                            const answers = { ...draft.answers };
                            if (answer) answers[key] = answer;
                            else delete answers[key];
                            change({ answers });
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-fg">{t("dashboard.ownFilter")}</span>
                  {/* Подшапка таблицы рассчитана на всю ширину view — здесь без её полей. */}
                  <div className="rounded-md border border-border [&>div]:mx-0 [&>div]:border-b-0 [&>div]:px-2">
                    <FilterBar
                      columns={schema.fields}
                      relations={schema.relations}
                      language={language}
                      filters={draft.filters}
                      sorts={[]}
                      onFilters={(own) => change({ filters: own })}
                      onSorts={noop}
                    />
                  </div>
                </div>
              </>
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

/**
 * Каким полем виджет отвечает на общий фильтр: датой на «Период»,
 * ссылкой на «Запись таблицы» — прямой или через справочник
 * («Филиал» для сделок: сотрудник → его филиал).
 */
function AnswerPicker({
  filter,
  fields,
  relations,
  language,
  value,
  onChange,
}: {
  filter: DashFilter;
  fields: TableField[];
  relations: Relation[];
  language: string;
  value: Answer | undefined;
  onChange: (answer: Answer | undefined) => void;
}) {
  const { t } = useTranslation();
  const target = (field: TableField) => relations.find((item) => item.id === field.relationId)?.toSlug ?? "";
  const options = fields.filter((field) =>
    filter.kind === "period" ? filterKind(field) === "range" : filterKind(field) === "relation" && target(field),
  );
  const chosen = fields.find((field) => field.slug === value?.field);
  const through = filter.kind === "record" && chosen && target(chosen) !== filter.table ? target(chosen) : "";
  const label = (field: TableField) => localized(field.labels, language, field.label);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{filter.label || t("dashboard.period")}</span>
      <Dropdown
        value={value?.field ?? ""}
        size="sm"
        items={[
          { value: "", label: t("dashboard.answerNone") },
          ...options.map((field) => ({ value: field.slug, label: label(field) })),
        ]}
        onChange={(field) => onChange(field ? { field } : undefined)}
      />
      {through && value && (
        <ViaPicker
          table={through}
          target={filter.kind === "record" ? filter.table : ""}
          language={language}
          value={value.via ?? ""}
          onChange={(via) => onChange(via ? { field: value.field, via } : { field: value.field })}
        />
      )}
    </div>
  );
}

/** Поле справочника `table`, которое ссылается на таблицу фильтра. */
function ViaPicker({
  table,
  target,
  language,
  value,
  onChange,
}: {
  table: string;
  target: string;
  language: string;
  value: string;
  onChange: (via: string) => void;
}) {
  const { t } = useTranslation();
  const { schema } = useTableSchema(table);
  const options = schema.fields.filter(
    (field) =>
      filterKind(field) === "relation" &&
      schema.relations.find((item) => item.id === field.relationId)?.toSlug === target,
  );

  return (
    <Dropdown
      value={value}
      size="sm"
      placeholder={options.length ? t("dashboard.via") : t("dashboard.noLinks")}
      disabled={!options.length}
      items={options.map((field) => ({
        value: field.slug,
        label: `${t("dashboard.via")}: ${localized(field.labels, language, field.label)}`,
      }))}
      onChange={onChange}
    />
  );
}

export function TablePicker({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
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
