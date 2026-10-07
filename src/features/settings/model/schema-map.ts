/**
 * Схема базы для диаграммы: таблицы, их поля и связи между ними —
 * и раскладка этого на холсте.
 *
 * Связи берутся из метаданных ucode (`relation` и поля с `relation_id`),
 * а не из внешних ключей базы: ucode их не создаёт, колонка
 * `<таблица>_id` — просто uuid без REFERENCES. Диаграмма по
 * `information_schema` показала бы таблицы без единой стрелки.
 */

export type SchemaField = { slug: string; type: string; required: boolean; unique: boolean };

/**
 * Группа таблицы на диаграмме — вкладка над холстом.
 *
 * Модуль omni4 узнаётся по префиксу слага (`crm_`, `hr_`, `pm_`, `int_`),
 * остальные его таблицы — «Ядро». Не по меню: справочники модулей лежат
 * в папке «Настройки модулей», а «Проекты» временно не модуль
 * (docs/STATUS.md), и папка-предок назвала бы группу неверно.
 *
 * Таблица, которую завёл пользователь, — «other»: её отличает то, что
 * она не [[Protected]]. Модуль у неё не угадывается и по префиксу:
 * `crm_notes` пользователя — всё равно его таблица, а не CRM.
 */
export const SCHEMA_GROUPS = ["platform", "core", "crm", "pm", "hr", "integrations", "other"] as const;
export type SchemaGroup = (typeof SCHEMA_GROUPS)[number];

const PREFIX_GROUPS: [string, SchemaGroup][] = [
  ["crm_", "crm"],
  ["pm_", "pm"],
  ["hr_", "hr"],
  ["int_", "integrations"],
];

export function groupOf(slug: string, isSystem: boolean, isProtected: boolean): SchemaGroup {
  if (isSystem) return "platform";
  if (!isProtected) return "other";
  return PREFIX_GROUPS.find(([prefix]) => slug.startsWith(prefix))?.[1] ?? "core";
}

export type SchemaTable = {
  slug: string;
  label: string;
  group: SchemaGroup;
  /**
   * Подгруппа внутри группы — подвкладка над холстом. Папка меню,
   * лежащая прямо в модуле (`CRM / Продажи`, `HRMS / Время`), или
   * унаследованная по ссылке (inheritSections). null — своей папки нет
   * и сослаться не на кого: справочник.
   */
  section: string | null;
  fields: SchemaField[];
  /**
   * Строк в таблице — ОЦЕНКА postgres (`pg_class.reltuples`), а не
   * `count(*)`: точный счёт сотни таблиц ради подписи в шапке карточки
   * стоил бы сотни проходов по данным. null — оценки нет (таблицу ещё
   * не анализировали).
   */
  rows: number | null;
};

export type SchemaLink = {
  /** Таблица, в которой лежит ссылка. */
  from: string;
  /** Поле-ссылка в `from`. Может не найтись среди полей — тогда стрелка идёт от шапки. */
  field: string;
  to: string;
  /** `Many2One`, `Many2Many`, `Recursive`… — как в enum `relation_type`. */
  type: string;
};

export type SchemaMap = { tables: SchemaTable[]; links: SchemaLink[] };

/** Поле-идентификатор строки: в него упираются все ссылки. */
export const PRIMARY_KEY = "guid";

/**
 * Строки двух запросов → схема. Поля таблицы приезжают json-массивом
 * в колонке: `json_agg` шлюз отдаёт уже разобранным, но строка тоже
 * бывает — разбираем оба вида.
 *
 * Связи без второй стороны (`Many2Dynamic` — таблица выбирается
 * в строке) и связи с таблицами, которых в выборке нет, отбрасываются:
 * стрелке некуда упереться.
 */
export function toSchemaMap(
  tableRows: Record<string, unknown>[],
  linkRows: Record<string, unknown>[],
): SchemaMap {
  const tables = tableRows
    .map((row) => ({
      slug: String(row["slug"] ?? ""),
      label: String(row["label"] ?? ""),
      group: groupOf(String(row["slug"] ?? ""), row["is_system"] === true, row["protected"] === true),
      section: typeof row["section"] === "string" && row["section"] ? row["section"] : null,
      fields: parseFields(row["fields"]),
      rows: toRows(row["rows"]),
    }))
    .filter((table) => table.slug);

  const known = new Set(tables.map((table) => table.slug));

  const links = linkRows
    .map((row) => ({
      from: String(row["table_from"] ?? ""),
      field: String(row["field_from"] ?? ""),
      to: String(row["table_to"] ?? ""),
      type: String(row["type"] ?? ""),
    }))
    .filter((link) => known.has(link.from) && known.has(link.to));

  inheritSections(tables, links);
  return { tables, links };
}

/**
 * Подгруппа для таблиц без своей папки в модуле — от тех, на кого они
 * ссылаются. Дочерние таблицы лежат в меню в «Служебных», но по смыслу
 * принадлежат родителю: `hr_training_participants` → `hr_trainings` →
 * «Обучение». Ссылка на таблицу без подгруппы не считается, но та может
 * получить её на этом же проходе — поэтому до неподвижной точки:
 * участник маршрута → маршрут → … наследует по цепочке.
 *
 * Голосуют только таблицы той же группы: `hr_job_history` ссылается
 * и на `employees`, но «Люди» в Ядре — не подгруппа HR. Поровну —
 * по алфавиту, чтобы раскладка не зависела от порядка связей.
 *
 * Не на кого сослаться — остаётся null: таблицу никто не трогает
 * изнутри модуля, на неё ссылаются сами. Это и есть справочник.
 */
function inheritSections(tables: SchemaTable[], links: SchemaLink[]) {
  const bySlug = new Map(tables.map((table) => [table.slug, table]));
  let changed = true;

  while (changed) {
    changed = false;
    for (const table of tables) {
      if (table.section) continue;

      const votes = new Map<string, number>();
      for (const link of links) {
        const target = link.from === table.slug && link.to !== table.slug ? bySlug.get(link.to) : undefined;
        if (target?.section && target.group === table.group) {
          votes.set(target.section, (votes.get(target.section) ?? 0) + 1);
        }
      }

      const best = [...votes].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0];
      if (best) {
        table.section = best[0];
        changed = true;
      }
    }
  }
}

/** reltuples = -1 — «не анализировали», это не ноль строк. */
function toRows(value: unknown): number | null {
  const rows = Number(value);
  return value === null || value === undefined || Number.isNaN(rows) || rows < 0 ? null : rows;
}

function parseFields(value: unknown): SchemaField[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(list)) return [];

  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { slug, type, required, unique } = item as Record<string, unknown>;
    return typeof slug === "string" && slug
      ? [{ slug, type: typeof type === "string" ? type : "", required: required === true, unique: unique === true }]
      : [];
  });
}

/**
 * Часть схемы: таблицы, которые прошли `keep`, и связи только между ними —
 * стрелке в спрятанную таблицу некуда упереться.
 */
export function pickSchema(map: SchemaMap, keep: (table: SchemaTable) => boolean): SchemaMap {
  const tables = map.tables.filter(keep);
  const slugs = new Set(tables.map((table) => table.slug));
  return { tables, links: map.links.filter((link) => slugs.has(link.from) && slugs.has(link.to)) };
}

/**
 * Совпадение поиска: слаг или подпись таблицы, либо слаг любого поля.
 * Строка поиска — уже в нижнем регистре.
 */
export function matchesTable(table: SchemaTable, query: string): boolean {
  return (
    table.slug.toLowerCase().includes(query) ||
    table.label.toLowerCase().includes(query) ||
    table.fields.some((field) => field.slug.toLowerCase().includes(query))
  );
}

/** Карточка таблицы — `.dx-ent` прототипа, шире на флажки NN/UQ: шапка 28, строка 22. */
export const BOX_WIDTH = 240;
export const HEAD_HEIGHT = 28;
export const ROW_HEIGHT = 22;
const GAP_X = 80;
const GAP_Y = 32;
const PAD = 24;
/**
 * Столбец выше этого режется на соседние. Иначе в проекте с полусотней
 * справочников первый столбец уходит на десятки экранов вниз, а справа
 * остаётся пустота.
 */
const PER_COLUMN = 6;

export type Box = { slug: string; x: number; y: number; height: number };

export type Layout = { boxes: Map<string, Box>; width: number; height: number };

/**
 * Раскладка столбцами по глубине ссылок: на кого ссылаются — левее,
 * кто ссылается — правее. Так стрелки идут в одну сторону, справа
 * налево, а не крест-накрест. Ранг таблицы — самый длинный путь
 * по её ссылкам; ссылка, замыкающая круг, в ранге не участвует.
 *
 * Таблицы без единой связи — отдельным хвостом в конце: в первом
 * столбце они смешались бы со справочниками, на которые ссылаются все.
 *
 * Внутри столбца — по алфавиту: порядок должен быть одинаковым
 * при каждом открытии, иначе таблицу не найти там, где она была вчера.
 */
export function layoutSchema(map: SchemaMap): Layout {
  const out = new Map<string, string[]>();
  const linked = new Set<string>();
  for (const link of map.links) {
    if (link.from === link.to) continue;
    out.set(link.from, [...(out.get(link.from) ?? []), link.to]);
    linked.add(link.from);
    linked.add(link.to);
  }

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (slug: string): number => {
    const done = rank.get(slug);
    if (done !== undefined) return done;
    // Круг: эта ссылка ведёт назад, её глубину не считаем.
    if (visiting.has(slug)) return -1;

    visiting.add(slug);
    const value = Math.max(-1, ...(out.get(slug) ?? []).map(rankOf)) + 1;
    visiting.delete(slug);
    rank.set(slug, value);
    return value;
  };

  const layers: string[][] = [];
  const loose: string[] = [];
  for (const table of [...map.tables].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!linked.has(table.slug)) {
      loose.push(table.slug);
      continue;
    }
    const value = rankOf(table.slug);
    (layers[value] ??= []).push(table.slug);
  }
  if (loose.length) layers.push(loose);

  const heightOf = new Map(
    map.tables.map((table) => [table.slug, HEAD_HEIGHT + table.fields.length * ROW_HEIGHT]),
  );

  const columns = layers
    .filter(Boolean)
    .flatMap((layer) =>
      Array.from({ length: Math.ceil(layer.length / PER_COLUMN) }, (_, index) =>
        layer.slice(index * PER_COLUMN, (index + 1) * PER_COLUMN),
      ),
    );

  const boxes = new Map<string, Box>();
  let height = 0;
  columns.forEach((column, index) => {
    let y = PAD;
    for (const slug of column) {
      const boxHeight = heightOf.get(slug) ?? HEAD_HEIGHT;
      boxes.set(slug, { slug, x: PAD + index * (BOX_WIDTH + GAP_X), y, height: boxHeight });
      y += boxHeight + GAP_Y;
    }
    height = Math.max(height, y - GAP_Y + PAD);
  });

  return {
    boxes,
    width: columns.length ? PAD * 2 + columns.length * BOX_WIDTH + (columns.length - 1) * GAP_X : 0,
    height,
  };
}

/**
 * Высота строки поля внутри карточки — куда упирается стрелка. Поля
 * нет среди показанных — стрелка идёт к шапке таблицы.
 */
export function anchorY(box: Box, table: SchemaTable, field: string): number {
  const index = table.fields.findIndex((item) => item.slug === field);
  return index < 0 ? box.y + HEAD_HEIGHT / 2 : box.y + HEAD_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/**
 * Схема текстом в DBML — его понимают dbdiagram.io и dbdocs: скопировал,
 * вставил, получил ту же картину в инструменте, где её можно двигать.
 *
 * Типы — ucode, а не postgres (`SINGLE_LINE`, `LOOKUP`): по ним видно,
 * что за поле в админке, а тип колонки для этого скажет меньше.
 */
export function toDbml(map: SchemaMap): string {
  const quote = (text: string) => text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const tables = map.tables.map((table) => {
    const note = table.label && table.label !== table.slug ? ` [note: '${quote(table.label)}']` : "";
    const fields = table.fields.map(
      (field) =>
        `  ${field.slug} ${field.type || "unknown"}${field.slug === PRIMARY_KEY ? " [pk]" : ""}`,
    );
    return [`Table ${table.slug}${note} {`, ...fields, "}"].join("\n");
  });

  const refs = map.links
    .filter((link) => link.field)
    .map((link) => `Ref: ${link.from}.${link.field} > ${link.to}.${PRIMARY_KEY}`);

  return [...tables, ...(refs.length ? [refs.join("\n")] : [])].join("\n\n");
}
