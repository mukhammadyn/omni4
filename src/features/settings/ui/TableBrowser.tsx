import { useDeferredValue, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  Table2Icon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCreateItem, useDeleteItems, useItems, type Item } from "@/features/item";
import { localized, useTableSchema, useTables, type Field as SchemaField } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import type { SqlResult } from "../api/sql";
import { OUTLINE } from "./parts";
import { Result } from "./SqlConsole";

/**
 * Таблицы базы как есть — вкладка раздела «База данных», `#s-dev-db`
 * прототипа: список таблиц слева, строки справа, без view, без
 * подписей полей и без форматирования значений.
 *
 * Это сознательно второй вид тех же данных рядом с view. View — экран
 * для работы, со своими колонками, правами на поля и отбором по умолчанию;
 * здесь — то, что лежит в таблице на самом деле, все колонки слагами.
 * Отвечает на «что там в этой колонке» без похода в SQL-консоль.
 *
 * Читается и пишется через API строк, а не через SQL: так работают
 * права роли, автополя и события таблицы. Голый INSERT мимо них
 * оставил бы строку, которую админка потом не понимает.
 *
 * Строки рисует тот же `Result`, что и ответ SQL: вид один и тот же —
 * значение как есть, тип под заголовком.
 */
const PAGE = 50;

export function TableBrowser() {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [tableQuery, setTableQuery] = useState("");
  const tables = useTables(useDeferredValue(tableQuery));
  const [picked, setPicked] = useState("");
  const slug = picked || tables.items[0]?.slug || "";

  return (
    /* `.dx-db` прототипа: список 210px и сетка, между ними 14px.

       Строка сетки — ровно оставшаяся высота (`minmax(0,1fr)`), и
       карточки упираются в неё, а не в свои 560px: раздел целиком
       не прокручивается, и на невысоком окне карточка уходила бы
       за нижний край — до конца списка было бы не долистать. 560px
       прототипа остаются потолком на высоком экране. */
    <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3.5 pb-6">
      <div className={`flex max-h-[min(100%,560px)] min-h-0 flex-col self-start p-1.5 ${OUTLINE}`}>
        <Input
          value={tableQuery}
          onChange={(event) => setTableQuery(event.target.value)}
          placeholder={t("database.tableSearch")}
          aria-label={t("database.tableSearch")}
          className="mb-1 h-7 shrink-0 text-[13px]"
        />

        <div className="min-h-0 overflow-y-auto">
          {tables.items.map((table) => (
            <button
              key={table.slug}
              type="button"
              onClick={() => setPicked(table.slug)}
              title={localized(table.labels, language, table.label)}
              className={`flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13.5px] transition-colors ${
                table.slug === slug
                  ? "bg-accent-subtle font-medium text-accent-text"
                  : "text-fg-muted hover:bg-surface-hover"
              }`}
            >
              <Icon as={Table2Icon} size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{table.slug}</span>
            </button>
          ))}

          {!tables.isLoading && !tables.items.length && (
            <p className="px-2 py-3 text-xs text-fg-subtle">{t("menuForm.tableEmpty")}</p>
          )}

          {tables.hasMore && (
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={tables.loadMore}>
              {t("action.loadMore")}
            </Button>
          )}
        </div>
      </div>

      {/* key — поиск и страница не переезжают в соседнюю таблицу. */}
      {slug && <Rows key={slug} slug={slug} />}
    </div>
  );
}

/** Поля, которые заполняет сам бэкенд: в форме новой строки им не место. */
const AUTO_FIELDS = new Set(["guid", "created_at", "updated_at", "deleted_at"]);

/** Кнопка-иконка `.x-btn` прототипа: 24px, бледная, без рамки. */
const ICON_BUTTON =
  "grid size-6 place-items-center rounded-[5px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40";

function Rows({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { schema, isLoading: schemaLoading } = useTableSchema(slug);
  const items = useItems(slug, { limit: PAGE, page, search: useDeferredValue(search) });
  const remove = useDeleteItems(slug);
  const pages = Math.max(1, Math.ceil(items.page.count / PAGE));

  const result: SqlResult = {
    columns: schema.fields.map((field) => field.slug),
    types: Object.fromEntries(schema.fields.map((field) => [field.slug, field.type])),
    rows: items.page.rows,
    rowsAffected: 0,
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* `.dx-bar` прототипа: действие слева, поиск, справа — где мы. */}
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Icon as={PlusIcon} size={14} />
          {t("database.addRow")}
        </Button>

        {/* `.f-search` — пилюля 26px с лупой. */}
        <label className="flex h-6.5 w-55 min-w-0 shrink items-center gap-1.5 rounded-full bg-input px-2.25 shadow-[inset_0_0_0_1px_var(--color-border)] transition-shadow has-[input:focus]:shadow-[inset_0_0_0_1px_var(--color-accent),0_0_0_3px_var(--color-accent-subtle)]">
          <Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("database.rowSearch")}
            aria-label={t("database.rowSearch")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
          />
        </label>

        <span className="flex-1" />

        {items.isFetching && (
          <Icon as={LoaderCircleIcon} size={14} className="animate-spin text-fg-subtle" />
        )}

        <span className="shrink-0 text-[13px] whitespace-nowrap text-fg-subtle tabular-nums">
          {t("database.pageInfo", { count: items.page.count, page, pages })}
        </span>

        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          aria-label={t("table.prevPage")}
          className={ICON_BUTTON}
        >
          <Icon as={ChevronLeftIcon} size={14} />
        </button>
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          aria-label={t("table.nextPage")}
          className={ICON_BUTTON}
        >
          <Icon as={ChevronRightIcon} size={14} />
        </button>
      </div>

      {items.error && (
        <p role="alert" className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          {items.error}
        </p>
      )}

      {/* `.dx-scroll` прототипа: обведённая карточка со своей прокруткой. */}
      <div className={`flex max-h-140 min-h-0 flex-col overflow-hidden ${OUTLINE}`}>
        {schemaLoading || items.isLoading ? (
          <p className="p-7 text-center text-[13.5px] text-fg-subtle">{t("common.loading")}</p>
        ) : (
          <Result
            result={result}
            rowAction={(row) => (
              <button
                type="button"
                onClick={() => setDeleting(String(row["guid"] ?? ""))}
                disabled={!row["guid"]}
                aria-label={t("action.delete")}
                title={t("action.delete")}
                className={`${ICON_BUTTON} opacity-0 group-hover/row:opacity-100 hover:text-danger focus-visible:opacity-100`}
              >
                <Icon as={Trash2Icon} size={15} />
              </button>
            )}
          />
        )}
      </div>

      {adding && (
        <AddRowDialog
          slug={slug}
          fields={schema.fields.filter((field) => !AUTO_FIELDS.has(field.slug))}
          onClose={() => setAdding(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("database.deleteRowTitle")}
          description={t("database.deleteRowDescription", { id: deleting })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate([deleting], { onSuccess: () => setDeleting(null) })}
        />
      )}
    </div>
  );
}

/** Значение из поля ввода — в тип колонки, а не строкой во всё подряд. */
const NUMBER_TYPES = new Set(["NUMBER", "FLOAT", "MONEY"]);
const BOOLEAN_TYPES = new Set(["SWITCH", "CHECKBOX"]);

/**
 * Новая строка — по полю ввода на колонку, слагами, как в таблице
 * рядом. Это не карточка записи: редакторов по типам здесь нет, есть
 * значение как его кладут в базу. Пустое поле не отправляется вовсе —
 * колонка получит то, что поставит бэкенд.
 */
function AddRowDialog({
  slug,
  fields,
  onClose,
}: {
  slug: string;
  fields: SchemaField[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateItem(slug);
  const [values, setValues] = useState<Record<string, string>>({});

  const toItem = (): Item =>
    Object.fromEntries(
      fields.flatMap((field): [string, unknown][] => {
        const raw = values[field.slug]?.trim() ?? "";
        if (!raw) return [];
        if (NUMBER_TYPES.has(field.type)) return [[field.slug, Number(raw)]];
        if (BOOLEAN_TYPES.has(field.type)) return [[field.slug, raw === "true"]];
        return [[field.slug, raw]];
      }),
    );

  return (
    <Modal onClose={onClose}>
      <form
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(toItem(), { onSuccess: onClose });
        }}
      >
        <div>
          <h2 className="text-base font-semibold">{t("database.addRowTitle", { table: slug })}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t("database.addRowHint")}</p>
        </div>

        <div className="grid min-h-0 gap-3 overflow-y-auto sm:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.slug} label={`${field.slug} · ${field.type}`}>
              <Input
                value={values[field.slug] ?? ""}
                type={NUMBER_TYPES.has(field.type) ? "number" : "text"}
                placeholder={BOOLEAN_TYPES.has(field.type) ? "true / false" : ""}
                onChange={(event) => setValues({ ...values, [field.slug]: event.target.value })}
                className="font-mono text-xs"
              />
            </Field>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Icon as={LoaderCircleIcon} size={14} className="animate-spin" />}
            {t("action.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
