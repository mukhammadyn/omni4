import type { Field } from "@/features/table";
import { toList } from "./cell-value";
import { COLOR } from "./relation";
import { relationDataKey, type Item } from "./types";

/**
 * Доска: те же строки, разложенные по колонкам значения одного поля.
 *
 * Раскладка считается здесь, а не на сервере. У бэкенда для доски есть
 * своя пара ручек (POST /v2/items/{slug}/board и .../board/structure),
 * но обе не годятся: страницу они режут по ВСЕЙ доске, а не по колонке,
 * из фильтров понимают только «значение из списка», и — главное —
 * сортируют по `created_at DESC` раньше, чем по `board_order`
 * (object_builder.go:3226), то есть порядок карточек, ради которого
 * колонка `board_order` и заведена, ими не соблюдается. Обычный
 * get-list соблюдает и порядок, и фильтры, и область видимости view.
 * См. docs/backend-notes.md.
 */

/**
 * Служебная колонка порядка карточек. Её заводит бэкенд сам при создании
 * и сохранении view типа BOARD (pkg/helper/view.go:15), поэтому фронт её
 * не создаёт и в списках полей не показывает: это номер позиции, а не
 * данные записи.
 */
export const BOARD_ORDER = "board_order";

/**
 * Поле порядка в справочниках модулей (`erp.dbml`: этапы, статусы,
 * воронки — у всех `sort_order NUMBER`). Колонки доски по связи
 * встают по нему, и перетаскивание колонки пишет его же: порядок
 * этапов один на все доски, а не своя копия в настройках каждой.
 */
export const SORT_ORDER = "sort_order";

/** Связанная запись, приехавшая в строке (`<поле>_data`). Список — не запись. */
function relatedOf(row: Item, fieldSlug: string): Record<string, unknown> | undefined {
  const data = row[relationDataKey(fieldSlug)];
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

/**
 * Номер колонки по связи — из связанной записи.
 * `undefined` — у записи нет поля номера или оно пустое.
 */
export function sortOrderOf(row: Item, fieldSlug: string): number | undefined {
  const value = relatedOf(row, fieldSlug)?.[SORT_ORDER];
  if (value === null || value === undefined || value === "") return undefined;

  const order = Number(value);
  return Number.isFinite(order) ? order : undefined;
}

/** Есть ли у связанной записи поле номера вообще — пусть даже пустое. */
export function hasSortOrder(row: Item, fieldSlug: string): boolean {
  const data = relatedOf(row, fieldSlug);
  return data !== undefined && SORT_ORDER in data;
}

/**
 * Связанная запись колонки — для черновика новой карточки.
 *
 * Поле-связь показывается по `<поле>_data`, а не по id: черновик
 * с одним id открывает дровер с пустым полем, хотя колонка выбрана.
 * Записи у колонки свои — её строки; берём из любой. Наружу `_data`
 * не уходит: его отбрасывает useCreateItem.
 */
export function relatedEntry(field: Field, row: Item | undefined): Record<string, unknown> {
  if (!field.relationId || !row) return {};

  const data = relatedOf(row, field.slug);
  return data ? { [relationDataKey(field.slug)]: data } : {};
}

/** HEX связанной записи. Не строка или пусто — цвета нет. */
export function colorOf(row: Item, fieldSlug: string): string | undefined {
  const value = relatedOf(row, fieldSlug)?.[COLOR];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Какие записи и какими номерами переписать, чтобы колонка `moved`
 * встала на место `at` среди `rest` (колонок без неё и без «пустой»).
 *
 * Номера у всех соседей — одна запись, номер между ними, как у карточек.
 * Есть безномерные — нумеруются ВСЕ по порядку: безномерные стоят после
 * пронумерованных, и число «между соседями» их места не выражает —
 * колонка, брошенная среди них, уехала бы к пронумерованным. Один раз:
 * после этого номера есть у всех.
 */
export function columnOrderEdits(
  rest: BoardColumn[],
  moved: string,
  at: number,
): { guid: string; order: number }[] {
  if (rest.every((column) => column.order !== undefined)) {
    return [{ guid: moved, order: orderAt(rest.map((column) => column.order), at) }];
  }

  const ids = rest.map((column) => column.id);
  ids.splice(at, 0, moved);
  const current = new Map(rest.map((column) => [column.id, column.order]));

  return ids.flatMap((guid, index) =>
    current.get(guid) === index + 1 ? [] : [{ guid, order: index + 1 }],
  );
}

/** Колонка «без значения». Пустая строка — значения в поле нет вовсе. */
export const NO_GROUP = "";

export type BoardColumn = {
  /** Значение поля группировки. Пусто — колонка «без значения». */
  id: string;
  label: string;
  rows: Item[];
  /** Место колонки из данных (SORT_ORDER связанной записи). Нет — после пронумерованных. */
  order?: number | undefined;
  /** HEX колонки из данных (COLOR связанной записи). У вариантов поля цвет свой. */
  color?: string | undefined;
};

/** Готовая колонка: значение поля и его подпись. */
export type BoardTab = { id: string; label: string };

/**
 * Строки → колонки доски.
 *
 * Колонки бывают двух происхождений, и это единственное, что здесь
 * сложного:
 *
 *   варианты поля  (STATUS, PICK_LIST, MULTISELECT) приходят готовым
 *                  списком `tabs` — все, включая те, в которых сейчас
 *                  ни одной карточки: пустой столбец «Готово» это
 *                  не мусор, а место, куда карточку перетаскивают;
 *   строки связи   (LOOKUP) приходить не могут — их тысячи. Колонки
 *                  собираются из значений, которые реально встретились,
 *                  а подпись берётся из самой строки (`labelOf`):
 *                  рядом со ссылкой лежит связанная запись целиком.
 *                  Так же считала и старая админка — сервер отдавал ей
 *                  только те группы, которые есть в данных.
 *
 * Порядка колонок в настройках view нет сознательно: старая админка
 * хранила его в `attributes.tabs` отдельным списком, он расходился
 * со значениями поля, и её же экран, обнаружив расхождение длин, молча
 * откатывался к серверному порядку. Колонки по связи стоят по номеру
 * в самой связанной записи (`orderOf`, см. SORT_ORDER) — он со
 * значениями разойтись не может.
 *
 * Строка с MULTISELECT попадает сразу в несколько колонок — по одной
 * на каждое значение. Это не дубль по ошибке: у записи действительно
 * два статуса, и спрятать один из них значит соврать про доску.
 */
export function boardColumns({
  rows,
  tabs,
  slug,
  unassigned,
  labelOf,
  orderOf,
  colorOf,
}: {
  rows: Item[];
  /** Варианты поля. Пусто — колонки целиком из данных. */
  tabs: BoardTab[];
  slug: string;
  /** Подпись колонки «без значения». */
  unassigned: string;
  /**
   * Подпись колонки, которой нет среди вариантов, — по любой её строке.
   * Не задана — подписью служит само значение.
   */
  labelOf?: ((row: Item, value: string) => string) | undefined;
  /** Номер колонки из данных — по любой её строке. */
  orderOf?: ((row: Item, value: string) => number | undefined) | undefined;
  /** Цвет колонки из данных — по любой её строке. */
  colorOf?: ((row: Item, value: string) => string | undefined) | undefined;
}): BoardColumn[] {
  const byValue = new Map<string, Item[]>();

  for (const row of rows) {
    const values = toList(row[slug]);
    for (const value of values.length ? values : [NO_GROUP]) {
      const list = byValue.get(value);
      if (list) list.push(row);
      else byValue.set(value, [row]);
    }
  }

  const known = new Set(tabs.map((tab) => tab.id));
  const columns = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    rows: byValue.get(tab.id) ?? [],
  }));

  /*
   * Значение, которого среди вариантов нет: колонка по связи или
   * убранный из поля вариант, оставшийся в строках. Без этой ветки
   * карточки просто исчезли бы с доски, и человек искал бы их в базе.
   *
   * По номеру из данных, при равных и без номера — по подписи, а не
   * в порядке появления в строках: порядок строк задаёт сервер, у карточек
   * без номера позиции он между запросами гуляет — и колонки менялись бы
   * местами после каждой правки.
   */
  const extra: BoardColumn[] = [];
  for (const [value, list] of byValue) {
    if (value === NO_GROUP || known.has(value)) continue;

    const first = list[0];
    extra.push({
      id: value,
      label: (first && labelOf?.(first, value)) || value,
      rows: list,
      order: first && orderOf?.(first, value),
      color: first && colorOf?.(first, value),
    });
  }

  // Infinity − Infinity — NaN, и `||` уводит обе безномерные к подписи.
  extra.sort(
    (a, b) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) || a.label.localeCompare(b.label),
  );
  columns.push(...extra);

  /*
   * Колонка «без значения» есть всегда, даже пустая: в неё бросают
   * карточку, чтобы СНЯТЬ значение. Была бы она только при наличии
   * карточек — снять статус на доске было бы нечем.
   */
  columns.push({ id: NO_GROUP, label: unassigned, rows: byValue.get(NO_GROUP) ?? [] });

  return columns;
}

export type BoardLane = {
  /** Значение поля дорожки. Пусто — дорожка «без значения». */
  id: string;
  label: string;
  /**
   * Сколько карточек в дорожке. Считается ДО раскладки по колонкам:
   * у MULTISELECT строка попадает сразу в несколько колонок, и сумма
   * по ним сказала бы «семь» там, где карточек пять.
   */
  size: number;
  columns: BoardColumn[];
};

/**
 * Второй уровень раскладки: те же колонки, разрезанные на дорожки.
 *
 * Дорожка отвечает на вопрос «чьё это»: колонки — стадии («в работе»,
 * «готово»), дорожки — исполнители или проекты. Без второго уровня
 * доска на сорок карточек читается как список, а не как доска.
 *
 * Считается тем же `boardColumns`, только другим полем: правило
 * «сначала варианты поля, потом встретившиеся значения по алфавиту,
 * пустая — последней» у строк и у дорожек одно и то же, и второй копии
 * этого правила быть не должно.
 *
 * Поля дорожки нет — одна безымянная дорожка со всеми колонками.
 * Так у доски без настройки остаётся ровно прежний вид, а у экрана —
 * одна ветка отрисовки вместо двух.
 */
export function boardLanes({
  rows,
  lane,
  laneTabs = [],
  laneLabelOf,
  unassigned,
  ...columns
}: {
  rows: Item[];
  /** Поле дорожек: слаг. Пусто — дорожка одна. */
  lane: string;
  laneTabs?: BoardTab[];
  laneLabelOf?: ((row: Item, value: string) => string) | undefined;
  tabs: BoardTab[];
  slug: string;
  unassigned: string;
  labelOf?: ((row: Item, value: string) => string) | undefined;
  orderOf?: ((row: Item, value: string) => number | undefined) | undefined;
  colorOf?: ((row: Item, value: string) => string | undefined) | undefined;
}): BoardLane[] {
  if (!lane) {
    return [
      {
        id: NO_GROUP,
        label: "",
        size: rows.length,
        columns: boardColumns({ rows, unassigned, ...columns }),
      },
    ];
  }

  return boardColumns({
    rows,
    tabs: laneTabs,
    slug: lane,
    unassigned,
    ...(laneLabelOf ? { labelOf: laneLabelOf } : {}),
  }).map((group) => ({
    id: group.id,
    label: group.label,
    size: group.rows.length,
    columns: boardColumns({ rows: group.rows, unassigned, ...columns }),
  }));
}

/**
 * Что записать в поле группировки, когда карточку бросили в колонку.
 *
 * У MULTISELECT в колонке лежит список, поэтому значение уезжает списком
 * из одного — так же, как это делает старая админка (BoardColumn.jsx).
 * Прежние значения при этом теряются: карточка была в двух колонках,
 * а после переноса окажется в одной. Это осознанно — перетаскивание
 * отвечает на вопрос «где карточка теперь», а не «добавь ещё одну
 * колонку»; несколько значений ставятся в карточке записи.
 */
export function groupValue(field: Field, columnId: string): unknown {
  if (!columnId) return null;

  return field.type === "MULTISELECT" ? [columnId] : columnId;
}

/**
 * Новый номер позиции для карточки, вставленной на место `at`
 * в колонку `rows` — уже БЕЗ неё самой.
 *
 * Число между соседями, а не «позиция + 1», как в старой админке:
 * с целыми номерами карточка, брошенная на второе место, получает
 * номер, который уже занят её новым соседом, и порядок двух одинаковых
 * решает сервер — карточка на глазах прыгает обратно. Дробное число
 * между соседями уникально, поэтому список после ответа сервера
 * выглядит ровно так, как его оставила мышь. Уезжает при этом один PUT
 * на одну карточку, а не перенумерация всей колонки.
 *
 * У карточек, которых мышью ещё не двигали, номера нет вовсе: тогда
 * за него принимается видимое место — так новый номер попадает между
 * теми же соседями, между которыми карточку и бросили.
 */
export function boardOrderAt(rows: Item[], at: number): number {
  return orderAt(
    rows.map((row) => row[BOARD_ORDER]),
    at,
  );
}

/**
 * То же правило для любого списка номеров: колонки доски двигаются им же
 * (номера — SORT_ORDER связанных записей, без самой перетаскиваемой).
 */
export function orderAt(orders: unknown[], at: number): number {
  const orderOf = (index: number) => {
    const value = Number(orders[index]);
    return Number.isFinite(value) ? value : index + 1;
  };

  const before = at > 0 ? orderOf(at - 1) : undefined;
  const after = at < orders.length ? orderOf(at) : undefined;

  if (before === undefined) return after === undefined ? 1 : after - 1;
  if (after === undefined) return before + 1;

  const middle = before + (after - before) / 2;
  // Соседи с одинаковым номером — наследство целых позиций: втискиваемся
  // сразу за первым, иначе новый номер снова совпал бы с чужим.
  return middle > before ? middle : before + 0.5;
}
