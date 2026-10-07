import { useDeferredValue, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermission } from "@/features/auth";
import {
  BOARD_ORDER,
  Cell,
  ItemDrawer,
  blankItem,
  relationDataKey,
  rowErrors,
  useCreateItem,
  useDeleteItems,
  useItems,
  useUpdateItem,
  type Item,
} from "@/features/item";
import { collapseLanguages, localized, useTableSchema, type Field } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, hexToChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { flattenTree } from "../model/directory-tree";
import type { Directory } from "./directories";
import { LogEmpty, OUTLINE, SectionHeader, SubHeader, Td, Th } from "./parts";

/**
 * Справочник модуля — `.ot` прототипа: заголовок, поиск, «Добавить»,
 * список или дерево, запись открывается карточкой сбоку.
 *
 * Один экран на все справочники (см. directories.ts): различаются они
 * таблицей и колонками, а не поведением.
 *
 * Карточка — та же, что у таблиц модулей (ItemDrawer): у поля один
 * способ правки, где бы его ни открыли. Раскладки у справочника нет —
 * его пункт меню лежит в скрытой папке, — поэтому в карточке все поля
 * таблицы в порядке схемы, а права на поля не сужаются: настройки
 * открывает тот, кому их можно править.
 */

/*
 * ponytail: справочник читается целиком, одним запросом. В них десятки
 * строк, а дереву нужны все предки — разрезанные страницей, дети стали
 * бы сиротами. Дорастёт справочник до сотен — нужны страницы и поиск
 * на сервере (у ручки он идёт только по полям, отмеченным в настройках
 * таблицы, — отсюда поиск по загруженному).
 */
const LIMIT = 500;

export function DirectorySettings({
  directory,
  embedded = false,
}: {
  directory: Directory;
  /**
   * Справочник — блок чужого раздела («Курсы валют» в «Локализации»):
   * заголовок блока вместо заголовка раздела и список своей высоты,
   * а не до низа экрана — раздел над ним прокручивается целиком.
   */
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { current: language, languages } = useDataLanguages();
  const { schema, error: schemaError } = useTableSchema(directory.table);
  const can = useTablePermission(directory.table);

  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());

  const sorts = useMemo(
    () =>
      directory.sort?.map((key) =>
        key.startsWith("-")
          ? { field: key.slice(1), direction: "desc" as const }
          : { field: key, direction: "asc" as const },
      ),
    [directory.sort],
  );
  const { page, isLoading, error, refetch } = useItems(directory.table, {
    limit: LIMIT,
    page: 1,
    sorts,
  });

  const bySlug = useMemo(
    () => new Map(schema.fields.map((field) => [field.slug, field])),
    [schema.fields],
  );
  const relations = useMemo(
    () => new Map(schema.relations.map((relation) => [relation.id, relation])),
    [schema.relations],
  );

  const titleField = bySlug.get(directory.title ?? "name");
  const columns = directory.columns.flatMap((slug) => bySlug.get(slug) ?? []);
  const hasColor = bySlug.has("color");

  // Свёрнутые узлы дерева. Пусто — раскрыто всё, как в прототипе.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(() => {
    /* Поиск — по всем строковым значениям строки: название, код, ИНН.
       Найденное показывается списком — дерево из обрывков не читается. */
    if (search) {
      return page.rows
        .filter((row) =>
          Object.values(row).some(
            (value) => typeof value === "string" && value.toLowerCase().includes(search),
          ),
        )
        .map((row) => ({ row, depth: 0, children: 0 }));
    }

    return directory.parent
      ? flattenTree(page.rows, directory.parent, closed)
      : page.rows.map((row) => ({ row, depth: 0, children: 0 }));
  }, [page.rows, search, directory.parent, closed]);

  const parents = useMemo(
    () =>
      directory.parent
        ? new Set(page.rows.map((row) => row[directory.parent ?? ""]).filter(isGuid))
        : new Set<string>(),
    [page.rows, directory.parent],
  );

  /*
   * Карточке — все поля таблицы, кроме служебных, сведённые к языку
   * данных. Первыми — название и колонки списка, в том же порядке:
   * схема отдаёт поля последним заведённым вперёд, и «Название»
   * оказывалось в самом низу формы.
   */
  const drawerFields = useMemo(() => {
    const first = [directory.title ?? "name", ...directory.columns];
    const rank = (field: Field) => {
      const at = first.indexOf(field.slug);
      return at < 0 ? first.length : at;
    };

    return collapseLanguages(
      schema.fields
        .filter((field) => field.slug !== "guid" && field.slug !== BOARD_ORDER)
        .sort((a, b) => rank(a) - rank(b)),
      languages.map((item) => item.code),
      language,
    );
  }, [schema.fields, directory.title, directory.columns, languages, language]);

  const update = useUpdateItem(directory.table);
  const create = useCreateItem(directory.table);
  const remove = useDeleteItems(directory.table);

  const [openGuid, setOpenGuid] = useState("");
  const [draft, setDraft] = useState<Item | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [deleting, setDeleting] = useState("");

  const openRow = page.rows.find((row) => row.guid === openGuid);
  const draftErrors = draft ? rowErrors(drawerFields, draft) : new Map();

  const label = (field: Field) => localized(field.labels, language, field.label);
  const toggle = (guid: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });

  const failure = schemaError ?? error;

  return (
    <div className={embedded ? "mt-7" : "flex min-h-0 min-w-0 flex-1 flex-col pb-6"}>
      {embedded ? (
        <SubHeader title={t(directory.titleKey)} hint={t(directory.hintKey)} />
      ) : (
        <SectionHeader title={t(directory.titleKey)} hint={t(directory.hintKey)} />
      )}

      {/* `.ot-bar` прототипа: поиск во всю ширину, справа кнопки. */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            as={SearchIcon}
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("table.search")}
            aria-label={t("table.search")}
            className="pl-8"
          />
        </div>

        {/* Одна кнопка: свёрнута хоть одна ветка — раскрыть всё,
            иначе свернуть всё. */}
        {directory.parent &&
          (closed.size ? (
            <Button variant="secondary" onClick={() => setClosed(new Set())}>
              <Icon as={ChevronsUpDownIcon} size={14} />
              {t("dir.expandAll")}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setClosed(new Set(parents))}>
              <Icon as={ChevronsDownUpIcon} size={14} />
              {t("dir.collapseAll")}
            </Button>
          ))}

        {can.write && (
          <Button
            onClick={() => {
              setOpenGuid("");
              setShowErrors(false);
              setDraft(blankItem(drawerFields));
            }}
          >
            <Icon as={PlusIcon} size={14} />
            {t("dir.add")}
          </Button>
        )}
      </div>

      <div className={`overflow-auto ${embedded ? "max-h-96" : "min-h-0 flex-1"} ${OUTLINE}`}>
        {failure ? (
          <div className="flex flex-col items-center gap-2 p-7">
            <p className="text-sm text-fg-muted">{String(failure)}</p>
            <Button variant="secondary" onClick={refetch}>
              {t("action.retry")}
            </Button>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>{titleField ? label(titleField) : t("dir.name")}</Th>
                {columns.map((field) => (
                  <Th key={field.slug}>{label(field)}</Th>
                ))}
                <Th className="w-10" />
              </tr>
            </thead>

            <tbody>
              {rows.map(({ row, depth, children }) => {
                const guid = String(row.guid);
                const color = hasColor && typeof row.color === "string" ? row.color : "";

                return (
                  <tr
                    key={guid}
                    onClick={() => {
                      setDraft(null);
                      setOpenGuid(guid);
                    }}
                    className={`group cursor-pointer transition-colors hover:bg-surface-hover ${
                      openGuid === guid ? "bg-surface-active" : ""
                    }`}
                  >
                    <Td>
                      {/* Отступ уровня — данными, а не классом: глубина
                          дерева не ограничена. */}
                      <span
                        className="flex min-w-0 items-center gap-2 font-medium"
                        style={{ paddingLeft: depth * 22 }}
                      >
                        {directory.parent && !search && (
                          <button
                            type="button"
                            aria-label={closed.has(guid) ? t("tree.expand") : t("tree.collapse")}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(guid);
                            }}
                            className={`grid size-5 shrink-0 cursor-pointer place-items-center rounded text-fg-subtle hover:bg-surface-active ${
                              children ? "" : "invisible"
                            }`}
                          >
                            <Icon
                              as={ChevronRightIcon}
                              size={14}
                              className={`transition-transform ${closed.has(guid) ? "" : "rotate-90"}`}
                            />
                          </button>
                        )}

                        {color && (
                          <span
                            className={`size-2 shrink-0 rounded-full ${CHIP_DOT[hexToChipColor(color)]}`}
                          />
                        )}

                        <span className="min-w-0 truncate">
                          {titleField ? (
                            <Cell
                              field={titleField}
                              row={row}
                              tableSlug={directory.table}
                              relations={relations}
                              locale={i18n.language}
                              language={language}
                            />
                          ) : (
                            guid
                          )}
                        </span>

                        {children > 0 && (
                          <span className="shrink-0 rounded bg-surface-hover px-1.5 text-xs text-fg-muted tabular-nums">
                            {children}
                          </span>
                        )}
                      </span>
                    </Td>

                    {columns.map((field) => (
                      <Td key={field.slug} className="max-w-60 truncate text-fg-muted">
                        <Cell
                          field={field}
                          row={row}
                          tableSlug={directory.table}
                          relations={relations}
                          locale={i18n.language}
                          language={language}
                        />
                      </Td>
                    ))}

                    <Td className="text-right">
                      {can.delete && (
                        <button
                          type="button"
                          aria-label={t("table.deleteRow")}
                          title={t("table.deleteRow")}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleting(guid);
                          }}
                          className="grid size-6 cursor-pointer place-items-center rounded text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-active hover:text-danger focus-visible:opacity-100"
                        >
                          <Icon as={Trash2Icon} size={14} />
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!failure && isLoading && <LogEmpty text={t("common.loading")} />}
        {!failure && !isLoading && !rows.length && (
          <LogEmpty text={search ? t("dir.notFound") : t("dir.empty")} />
        )}
      </div>

      {!isLoading && page.rows.length > 0 && (
        <p className="mt-2 shrink-0 text-xs text-fg-subtle tabular-nums">
          {t("dir.count", { count: page.count || page.rows.length })}
        </p>
      )}

      {openRow && (
        <ItemDrawer
          tableSlug={directory.table}
          columns={drawerFields}
          row={openRow}
          relations={schema.relations}
          locale={i18n.language}
          language={language}
          languages={languages}
          sections={NO_SECTIONS}
          heading={titleField?.slug ?? ""}
          {...(can.update
            ? {
                onEdit: (guid: string, slug: string, value: unknown) =>
                  update.mutate({ guid, values: { [slug]: value } }),
              }
            : {})}
          onClose={() => setOpenGuid("")}
        />
      )}

      {/* Новая запись — черновик: правки копятся и уезжают одним
          запросом по кнопке, как у таблиц модулей. */}
      {draft && (
        <ItemDrawer
          tableSlug={directory.table}
          columns={drawerFields}
          row={draft}
          relations={schema.relations}
          locale={i18n.language}
          language={language}
          languages={languages}
          sections={NO_SECTIONS}
          heading=""
          creating
          titlePlaceholder={t("table.addRow")}
          onEdit={(_guid, slug, value) =>
            setDraft((current) => (current ? { ...current, [slug]: value } : current))
          }
          onLink={(slug, item) =>
            setDraft((current) =>
              current
                ? { ...current, [slug]: item?.guid ?? null, [relationDataKey(slug)]: item }
                : current,
            )
          }
          footer={
            <>
              {showErrors && draftErrors.size > 0 && (
                <span className="mr-auto text-xs text-danger">
                  {t("table.fillRequired", { count: draftErrors.size })}
                </span>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("action.cancel")}
              </Button>
              <Button
                disabled={create.isPending}
                onClick={() => {
                  if (draftErrors.size) {
                    setShowErrors(true);
                    return;
                  }
                  create.mutate(draft, {
                    onSuccess: () => {
                      setDraft(null);
                      toast.success(t("table.rowCreated"));
                    },
                  });
                }}
              >
                {t("action.create")}
              </Button>
            </>
          }
          onClose={() => setDraft(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("table.deleteTitle")}
          description={t("table.deleteDescription", { count: 1 })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate([deleting], {
              onSuccess: () => {
                if (openGuid === deleting) setOpenGuid("");
                setDeleting("");
              },
            })
          }
          onClose={() => setDeleting("")}
        />
      )}
    </div>
  );
}

const NO_SECTIONS: { label: string; slugs: string[] }[] = [];

function isGuid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
