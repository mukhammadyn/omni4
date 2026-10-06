import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTablePermission } from "@/features/auth";
import {
  ActiveCell,
  Cell,
  editorKind,
  useCreateItem,
  useItems,
  useUpdateItem,
} from "@/features/item";
import { localized, useTableSchema } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import type { RecordSection } from "./directories";
import { SectionHeader, SettingRow } from "./parts";

/** Раздел целиком: заголовок и строки одной записи («Налоги и нормы»). */
export function RecordSettings({ section }: { section: RecordSection }) {
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader title={t(section.titleKey)} hint={t(section.hintKey)} />
      <RecordFields table={section.table} fields={section.fields} pick={section.pick} />
    </>
  );
}

/**
 * Поля одной строки таблицы Ядра строками «подпись — значение», как
 * `.srow` прототипа. Без заголовка: «Профиль компании» и «Локализация»
 * собирают их вперемешку с настройками проекта и личными.
 *
 * Значение показывает и правит то же, что ячейку таблицы и поле
 * карточки (Cell и ActiveCell): у поля один способ правки, где бы его
 * ни открыли, и варианты списков берутся из настроек поля, а не
 * зашиваются здесь. Правка уезжает сразу, как в карточке, — кнопки
 * «Сохранить» нет: она обещала бы, что без неё ничего не сохранилось.
 *
 * Какая строка — решает `pick`: у `org_settings` она одна, у юрлиц —
 * помеченная «Основное». Строки нет — предлагается её завести.
 */
export function RecordFields({
  table,
  fields: slugs,
  pick,
}: {
  table: string;
  /** Поля по порядку показа, слагами. Чего нет в схеме — не рисуется. */
  fields: string[];
  /** Флажок, которым помечена нужная строка. Нет — первая строка. */
  pick?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { current: language } = useDataLanguages();
  const { schema } = useTableSchema(table);
  const can = useTablePermission(table);

  /* Строк здесь единицы (юрлиц — несколько), поэтому вся таблица одним
     запросом, а нужная выбирается ниже. Тот же ключ кэша у соседнего
     блока той же таблицы — второй запрос не уходит. */
  const { page, isLoading } = useItems(table, { limit: 50, page: 1 });
  const row = page.rows.find((item) => !pick || item[pick] === true);

  const update = useUpdateItem(table);
  const create = useCreateItem(table);

  const relations = useMemo(
    () => new Map(schema.relations.map((relation) => [relation.id, relation])),
    [schema.relations],
  );
  const fields = slugs.flatMap((slug) => schema.fields.find((field) => field.slug === slug) ?? []);

  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  const activeField = fields.find((field) => field.slug === active?.slug);

  const guid = row && typeof row.guid === "string" ? row.guid : undefined;
  const editable = Boolean(guid && can.update);

  const save = (slug: string, value: unknown) => {
    if (guid) update.mutate({ guid, values: { [slug]: value } });
  };

  if (isLoading) return <p className="py-3 text-sm text-fg-subtle">{t("common.loading")}</p>;

  if (!row) {
    return (
      <div className="flex flex-col items-start gap-3 py-3">
        <p className="text-sm text-fg-muted">{t("record.missing")}</p>
        {can.write && (
          <Button
            disabled={create.isPending}
            onClick={() => create.mutate(pick ? { [pick]: true } : {})}
          >
            {t("record.create")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      {fields.map((field) => (
        <SettingRow key={field.slug} label={localized(field.labels, language, field.label)}>
          {/* Значение — кнопкой: по ней открывается тот же редактор,
              что у ячейки. Флажок переключается на месте. */}
          <button
            type="button"
            disabled={!editable || !field.editable}
            onClick={(event) => {
              if (editorKind(field, false) === "boolean") {
                save(field.slug, !row[field.slug]);
                return;
              }
              setActive({ slug: field.slug, anchor: event.currentTarget.getBoundingClientRect() });
            }}
            className="flex h-(--spacing-input) w-full min-w-0 cursor-pointer items-center rounded-md border border-border-strong bg-input px-2.5 text-left text-sm text-fg transition-colors hover:border-fg-subtle disabled:cursor-default disabled:hover:border-border-strong"
          >
            <span className="min-w-0 flex-1 truncate">
              <Cell
                field={field}
                row={row}
                tableSlug={table}
                relations={relations}
                locale={i18n.language}
                language={language}
              />
            </span>
          </button>
        </SettingRow>
      ))}

      {active && activeField && (
        <ActiveCell
          key={active.slug}
          field={activeField}
          row={row}
          guid={guid}
          tableSlug={table}
          anchor={active.anchor}
          relations={relations}
          locale={i18n.language}
          language={language}
          onEdit={(value) => save(active.slug, value)}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
