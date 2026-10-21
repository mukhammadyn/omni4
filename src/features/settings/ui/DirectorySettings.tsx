import { useDeferredValue, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  CornerDownRightIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermission } from "@/features/auth";
import {
  BOARD_ORDER,
  Avatar,
  Cell,
  cellKind,
  MAX_LIMIT,
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
import { CHIP_DOT, Chip, hexToChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useSaveFieldOptions, type OptionDraft } from "../api/field-options";
import { DirectoryCreateDialog } from "./DirectoryCreateDialog";
import { OptionDialog } from "./OptionsSettings";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { flattenTree } from "../model/directory-tree";
import type { Directory } from "./directories";
import { LogEmpty, SectionHeader, SubHeader, Td, Th } from "./parts";

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
const NONE: ReadonlySet<string> = new Set();
/** Строка-группа (`groupBy`) и ссылка на неё — только в дереве экрана. */
const GROUP = "group:";
const GROUP_KEY = "__group";

export function DirectorySettings({
  directory,
  embedded = false,
  headless = false,
}: {
  directory: Directory;
  /** Заголовок рисует раздел снаружи — справочник во вкладке («Шаблоны» в «Файлах и документах»). */
  headless?: boolean;
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

  const titleSlug = directory.title ?? "name";

  /*
   * Группы — варианты поля `groupBy`, строками дерева: у каждой guid
   * с приставкой GROUP, у её строк — ссылка на него в GROUP_KEY.
   * Ни в базу, ни в окна они не уходят: это вид, а не данные.
   */
  const groupField = directory.groupBy ? bySlug.get(directory.groupBy) : undefined;
  const groupOptions: OptionDraft[] = useMemo(
    () =>
      [...(groupField?.options.values() ?? [])].map((one) => ({
        value: one.value,
        label: localized(one.labels, language, one.label),
        color: one.color ?? "",
      })),
    [groupField, language],
  );
  const parentKey = directory.parent ?? (groupField ? GROUP_KEY : "");
  const treeRows: Item[] = useMemo(() => {
    if (!groupField) return page.rows;
    const slug = groupField.slug;
    return [
      ...groupOptions.map((one) => ({ guid: GROUP + one.value, [titleSlug]: one.label, [GROUP_KEY]: null })),
      ...page.rows.map((row) => ({ ...row, [GROUP_KEY]: row[slug] ? GROUP + String(row[slug]) : null })),
    ];
  }, [groupField, groupOptions, page.rows, titleSlug]);
  const isGroup = (guid: string) => guid.startsWith(GROUP);
  /** Цвет точки: свой у строки, у сгруппированной — цвет её группы. */
  const colorOf = (row: Item) => {
    if (groupField) {
      const guid = String(row.guid);
      const value = isGroup(guid) ? guid.slice(GROUP.length) : String(row[groupField.slug] ?? "");
      return groupOptions.find((one) => one.value === value)?.color ?? "";
    }
    return hasColor && typeof row.color === "string" ? row.color : "";
  };
  const saveGroups = useSaveFieldOptions([directory.table], directory.groupBy ?? "", language);
  const [groupEdit, setGroupEdit] = useState<OptionDraft | null>(null);
  const flat = (list: Item[], hidden: ReadonlySet<string>) =>
    parentKey ? flattenTree(list, parentKey, hidden) : list.map((row) => ({ row, depth: 0, children: 0 }));

  // Всё дерево раскрытым: из него — потомки, уровни и список родителей в окне.
  const full = useMemo(() => flat(treeRows, NONE), [treeRows, parentKey]);

  /** Запись и все её потомки: в обходе они идут подряд, пока глубина больше. */
  const subtree = (guid: string) => {
    const at = full.findIndex((item) => item.row.guid === guid);
    const out = new Set<string>();
    if (at < 0) return out;
    for (let i = at; i < full.length && (i === at || full[i]!.depth > full[at]!.depth); i++) {
      out.add(String(full[i]!.row.guid));
    }
    return out;
  };

  const rows = useMemo(() => {
    if (!search) return flat(treeRows, closed);

    /* Поиск — по всем строковым значениям строки: название, код, ИНН.
       У дерева найденное показывается с предками, как в прототипе:
       «Backend» без «Разработки» над ним не читается. */
    const byGuid = new Map(treeRows.map((row) => [String(row.guid), row]));
    const shown = new Set<string>();
    for (const row of treeRows) {
      const hit = Object.values(row).some((value) => typeof value === "string" && value.toLowerCase().includes(search));
      for (let at: Item | undefined = hit ? row : undefined; at && !shown.has(String(at.guid)); at = byGuid.get(String(at[parentKey] ?? ""))) {
        shown.add(String(at.guid));
      }
    }
    return flat(treeRows.filter((row) => shown.has(String(row.guid))), NONE);
  }, [treeRows, search, parentKey, closed]);

  /*
   * ponytail: счётчик — по всем строкам связанной таблицы одним запросом
   * (MAX_LIMIT), считается на клиенте: ручки «count по значению поля»
   * у бэкенда нет (backend-notes, «Группировка»). Сотрудников станет
   * больше тысячи — счёт будет неполным; тогда нужна функция-агрегат.
   */
  const counted = useItems(directory.counts?.table, { limit: MAX_LIMIT, page: 1, relations: false });
  const own = useMemo(() => {
    const out = new Map<string, number>();
    const key = directory.counts?.field ?? "";
    for (const row of counted.page.rows) {
      const guid = String(row[key] ?? "");
      if (guid) out.set(guid, (out.get(guid) ?? 0) + 1);
    }
    return out;
  }, [counted.page.rows, directory.counts?.field]);
  const total = (guid: string) => [...subtree(guid)].reduce((sum, one) => sum + (own.get(one) ?? 0), 0);

  const levels = 1 + Math.max(0, ...full.map((item) => item.depth));

  const parents = useMemo(
    () =>
      parentKey ? new Set(treeRows.map((row) => row[parentKey]).filter(isGuid)) : new Set<string>(),
    [treeRows, parentKey],
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

  const remove = useDeleteItems(directory.table);
  const update = useUpdateItem(directory.table);
  const create = useCreateItem(directory.table);

  const [openGuid, setOpenGuid] = useState("");
  /** Новая запись; строка — guid родителя у «Добавить вложенный». */
  const [creating, setCreating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState("");

  const openRow = page.rows.find((row) => row.guid === openGuid);
  const rowOf = (guid: string) => treeRows.find((row) => row.guid === guid);
  const nameOf = (row: Item | undefined) => String(row?.[titleSlug] ?? "");
  const groupOf = (guid: string) => groupOptions.find((one) => GROUP + one.value === guid);
  const kidsOf = (guid: string) => treeRows.filter((row) => row[parentKey] === guid);

  /** Можно ли вложить в строку этой глубины: у дерева бывает потолок. */
  const nests = (depth: number) => Boolean(parentKey) && (!directory.depth || depth < directory.depth - 1);

  /** Родители для окна — всё дерево, кроме самой записи и её потомков. */
  const parentOptions = (guid: string) => {
    const own = guid ? subtree(guid) : NONE;
    return full
      .filter((item) => !own.has(String(item.row.guid)) && nests(item.depth))
      .map(({ row, depth }) => ({
        value: String(row.guid),
        label: `${"\u00a0\u00a0\u00a0".repeat(depth)}${depth ? "└ " : ""}${nameOf(row)}`,
      }));
  };

  /*
   * Порядок — у тех, кто сортируется по sort_order. Соседи
   * перенумеровываются заново: у заведённых руками номера пустые
   * или одинаковые, и обмен двух значений ничего бы не сдвинул.
   */
  const ordered = directory.sort?.[0] === "sort_order" && can.update;
  const move = (row: Item, step: -1 | 1) => {
    const siblings = full.map((item) => item.row).filter((one) => (one[parentKey] ?? "") === (row[parentKey] ?? ""));
    const at = siblings.indexOf(row);
    const other = siblings[at + step];
    if (!other) return;
    siblings[at] = other;
    siblings[at + step] = row;
    siblings.forEach((one, index) => {
      if (one.sort_order !== index + 1) update.mutate({ guid: String(one.guid), values: { sort_order: index + 1 } });
    });
  };

  const duplicate = (row: Item) =>
    create.mutate({
      ...Object.fromEntries(schema.fields.filter((field) => field.slug !== "guid").map((field) => [field.slug, row[field.slug]])),
      [titleSlug]: `${nameOf(row)} ${t("dir.copySuffix")}`,
    });

  /* Вложенные поднимаются на уровень выше, как в прототипе, а не
     остаются сиротами со ссылкой на удалённое. */
  const removeRow = async (guid: string) => {
    const up = rowOf(guid)?.[parentKey] ?? null;
    await Promise.all(kidsOf(guid).map((kid) => update.mutateAsync({ guid: String(kid.guid), values: { [parentKey]: up } })));
    remove.mutate([guid], {
      onSuccess: () => {
        if (openGuid === guid) setOpenGuid("");
        setDeleting("");
      },
    });
  };

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
      {headless ? null : embedded ? (
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
        {/* Одна кнопка: свёрнута хоть одна ветка — раскрыть всё,
            иначе свернуть всё. */}
        {parentKey &&
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
              setCreating("");
            }}
          >
            <Icon as={PlusIcon} size={14} />
            {t("dir.add")}
          </Button>
        )}
      </div>

      {/* `.otbl` прототипа: без рамки вокруг, только линии между строками. */}
      <div className={`overflow-auto ${embedded ? "max-h-96" : "min-h-0 flex-1"}`}>
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
                  <Th key={field.slug} className="whitespace-nowrap">{label(field)}</Th>
                ))}
                {directory.counts && <Th className="text-right whitespace-nowrap">{t(directory.counts.labelKey)}</Th>}
                {directory.counts?.totalKey && parentKey && <Th className="text-right whitespace-nowrap">{t(directory.counts.totalKey)}</Th>}
                <Th className="w-18" />
              </tr>
            </thead>

            <tbody>
              {rows.map(({ row, depth, children }) => {
                const guid = String(row.guid);
                const color = colorOf(row);
                const group = isGroup(guid);

                return (
                  <tr
                    key={guid}
                    onClick={() => (group ? setGroupEdit(groupOf(guid) ?? null) : setOpenGuid(guid))}
                    className={`group cursor-pointer transition-colors hover:bg-surface-hover ${
                      openGuid === guid ? "bg-surface-active" : ""
                    }`}
                  >
                    <Td className="w-full max-w-0">
                      {/* Отступ уровня — данными, а не классом: глубина
                          дерева не ограничена. */}
                      <span
                        className="flex min-w-0 items-center gap-2 font-medium"
                        style={{ paddingLeft: depth * 22 }}
                      >
                        {parentKey && (
                          <button
                            type="button"
                            aria-label={closed.has(guid) ? t("tree.expand") : t("tree.collapse")}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(guid);
                            }}
                            className={`grid size-5 shrink-0 cursor-pointer place-items-center rounded text-fg-subtle hover:bg-surface-active ${
                              children && !search ? "" : "invisible"
                            }`}
                          >
                            <Icon
                              as={ChevronRightIcon}
                              size={14}
                              className={`transition-transform ${closed.has(guid) ? "" : "rotate-90"}`}
                            />
                          </button>
                        )}

                        {color && !directory.tag && (
                          <span
                            className={`size-2 shrink-0 rounded-full ${CHIP_DOT[hexToChipColor(color)]}`}
                          />
                        )}

                        <span className="min-w-0 truncate">
                          {directory.tag ? (
                            <Chip color={color ? hexToChipColor(color) : "gray"}>{nameOf(row)}</Chip>
                          ) : titleField ? (
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
                        {group ? null : PEOPLE.some((slug) => field.slug.startsWith(slug)) ? (
                          <Person row={row} slug={field.slug} />
                        ) : field.slug === "hr_departments_id" ? (
                          <Dotted row={row} slug={field.slug} />
                        ) : cellKind(field.type) === "boolean" ? (
                          // `.switch` прототипа: флажок правится прямо в строке.
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row[field.slug] === true}
                            aria-label={label(field)}
                            disabled={!can.update}
                            onClick={(event) => {
                              event.stopPropagation();
                              update.mutate({ guid, values: { [field.slug]: row[field.slug] !== true } });
                            }}
                            className="group relative inline-block h-4.5 w-7.5 shrink-0 cursor-pointer rounded-full bg-border-strong align-middle transition-colors disabled:cursor-default aria-checked:bg-accent-solid"
                          >
                            <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left] group-aria-checked:left-3.5" />
                          </button>
                        ) : (
                        <Cell
                          field={field}
                          row={row}
                          tableSlug={directory.table}
                          relations={relations}
                          locale={i18n.language}
                          language={language}
                        />
                        )}
                      </Td>
                    ))}

                    {directory.counts && (
                      <Td className="text-right text-fg-muted tabular-nums">{counted.isLoading ? "—" : directory.counts.rollup ? total(guid) : (own.get(guid) ?? 0)}</Td>
                    )}
                    {directory.counts?.totalKey && parentKey && (
                      <Td className="text-right text-fg-muted tabular-nums">{counted.isLoading ? "—" : total(guid)}</Td>
                    )}

                    {/* `.ot-act` прототипа: «+» вложенного по наведению и меню строки. */}
                    <Td className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
                        {nests(depth) && can.write && (
                          <button
                            type="button"
                            aria-label={t("dir.addChild")}
                            title={t("dir.addChild")}
                            onClick={() => setCreating(guid)}
                            className={`${ROW_BUTTON} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                          >
                            <Icon as={PlusIcon} size={14} />
                          </button>
                        )}
                        <Popover
                          align="end"
                          trigger={({ toggle }) => (
                            <button type="button" aria-label={t("dir.actions")} title={t("dir.actions")} onClick={toggle} className={ROW_BUTTON}>
                              <Icon as={EllipsisIcon} size={14} />
                            </button>
                          )}
                        >
                          {(close) => {
                            const run = (action: () => void) => () => {
                              close();
                              action();
                            };
                            return (
                              <>
                                <PopoverItem
                                  icon={<Icon as={PencilIcon} />}
                                  onClick={run(() => (group ? setGroupEdit(groupOf(guid) ?? null) : setOpenGuid(guid)))}
                                >
                                  {t("dir.edit")}
                                </PopoverItem>
                                {nests(depth) && can.write && (
                                  <PopoverItem icon={<Icon as={CornerDownRightIcon} />} onClick={run(() => setCreating(guid))}>
                                    {t("dir.addChild")}
                                  </PopoverItem>
                                )}
                                {can.write && !group && (
                                  <PopoverItem icon={<Icon as={CopyIcon} />} onClick={run(() => duplicate(row))}>
                                    {t("dir.duplicate")}
                                  </PopoverItem>
                                )}
                                {ordered && !search && !group && (
                                  <>
                                    <PopoverItem icon={<Icon as={ArrowUpIcon} />} onClick={run(() => move(row, -1))}>
                                      {t("dir.moveUp")}
                                    </PopoverItem>
                                    <PopoverItem icon={<Icon as={ArrowDownIcon} />} onClick={run(() => move(row, 1))}>
                                      {t("dir.moveDown")}
                                    </PopoverItem>
                                  </>
                                )}
                                {can.delete && !group && (
                                  <>
                                    <PopoverSeparator />
                                    <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={run(() => setDeleting(guid))}>
                                      {t("action.delete")}
                                    </PopoverItem>
                                  </>
                                )}
                              </>
                            );
                          }}
                        </Popover>
                      </span>
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
          {search
            ? t("dir.found", { found: rows.length, total: page.rows.length })
            : t("dir.count", { count: page.count || page.rows.length })}
          {parentKey && ` · ${t("dir.levels", { count: levels })}`}
        </p>
      )}

      {/* Правка — то же окно, что у новой записи, с её значениями. */}
      {openRow && (
        <DirectoryCreateDialog
          key={openGuid}
          table={directory.table}
          title={`${t("dir.edit")}: ${t(directory.titleKey)}`}
          fields={drawerFields}
          relations={schema.relations}
          language={language}
          row={openRow}
          readOnly={!can.update}
          parent={directory.parent ? { slug: parentKey, options: parentOptions(openGuid) } : undefined}
          note={kidsOf(openGuid).length ? t("dir.childrenNote", { count: kidsOf(openGuid).length }) : undefined}
          onDelete={can.delete ? () => setDeleting(openGuid) : undefined}
          onClose={() => setOpenGuid("")}
        />
      )}

      {/* Новая запись — окно: правки копятся и уезжают одним запросом по кнопке. */}
      {creating !== null && (
        <DirectoryCreateDialog
          table={directory.table}
          title={
            creating
              ? t("dir.addInto", { name: nameOf(rowOf(creating)) })
              : `${t("dir.add")}: ${t(directory.titleKey)}`
          }
          fields={drawerFields}
          relations={schema.relations}
          language={language}
          // Вложенный наследует цвет родителя, как в прототипе.
          defaults={
            !creating
              ? undefined
              : groupField
                ? { [groupField.slug]: creating.slice(GROUP.length) }
                : { [parentKey]: creating, ...(hasColor ? { color: rowOf(creating)?.color } : {}) }
          }
          parent={directory.parent ? { slug: parentKey, options: parentOptions("") } : undefined}
          onClose={() => setCreating(null)}
        />
      )}

      {/* Тип — вариант поля: подпись и цвет, как в «Типах занятости». */}
      {groupEdit && (
        <OptionDialog
          option={groupEdit}
          title={`${t("dir.edit")}: ${groupEdit.label}`}
          busy={saveGroups.isPending}
          onDelete={undefined}
          onSave={(draft) =>
            saveGroups.mutate(
              groupOptions.map((one) => (one.value === groupEdit.value ? { ...one, ...draft } : one)),
              { onSuccess: () => (toast.success(t("settings.saved")), setGroupEdit(null)) },
            )
          }
          onClose={() => setGroupEdit(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("dir.deleteTitle", { name: nameOf(rowOf(deleting)) })}
          description={[
            t("dir.cannotUndo"),
            kidsOf(deleting).length ? t("dir.childrenMoved", { count: kidsOf(deleting).length }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel={t("action.delete")}
          busy={remove.isPending || update.isPending}
          onConfirm={() => void removeRow(deleting)}
          onClose={() => setDeleting("")}
        />
      )}
    </div>
  );
}

/** Связи на людей рисуются `.person` прототипа — аватар и имя, а не ссылкой. */
const PEOPLE = ["core_users_id", "hr_employees_id"];

function Person({ row, slug }: { row: Item; slug: string }) {
  const person = row[`${slug}_data`];
  if (!person || typeof person !== "object") return <span className="text-fg-subtle">—</span>;
  const { full_name, photo } = person as Item;
  const name = typeof full_name === "string" ? full_name : "";
  const src = Array.isArray(photo) ? photo[0] : photo;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-fg">
      <Avatar name={name} photo={typeof src === "string" && src ? src : undefined} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Ссылка на отдел — `NM` прототипа: точка цвета отдела и название. */
function Dotted({ row, slug }: { row: Item; slug: string }) {
  const item = row[`${slug}_data`] as Item | undefined;
  const name = typeof item?.name === "string" ? item.name : "";
  if (!name) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-fg">
      {typeof item?.color === "string" && item.color && (
        <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[hexToChipColor(item.color)]}`} />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

const ROW_BUTTON =
  "grid size-6 cursor-pointer place-items-center rounded text-fg-subtle transition-opacity hover:bg-surface-active hover:text-fg";

function isGuid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
