import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PanelRightOpenIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { localized, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { cellKind, editorKind } from "../model/cell-kind";
import { blankItem } from "../model/cell-value";
import { columnWindow, type ColumnWindow } from "../model/column-window";
import { groupEntries, visibleEntries } from "../model/group";
import type { TreeMeta } from "../model/tree";
import type { Sort, SortDirection } from "../model/query";
import { relationDataKey, type Item } from "../model/types";
import { rowErrors, type CellError } from "../model/validate";
import { ActiveCell } from "./CellEditor";
import { Cell } from "./Cell";
import { ColumnMenu, type ColumnActions } from "./ColumnMenu";
import { fieldIcon } from "./field-icon";

/**
 * Таблица строк.
 *
 * Настоящий <table>, а не сетка из div'ов: липкая шапка, фиксированные
 * ширины колонок и доступность с клавиатуры достаются даром.
 *
 * Виртуализация — на строках: в DOM живут только видимые плюс запас,
 * остальное занимают две распорки сверху и снизу. Ширины при этом
 * остаются на <colgroup>, поэтому колонки не разъезжаются, когда
 * в видимой части оказались короткие значения.
 *
 * На широкой таблице так же виртуализируются колонки — тем же приёмом
 * и в ту же сторону, см. VIRTUAL_FROM и model/column-window.
 */

/** Ширины по умолчанию. Первая колонка шире: в ней обычно имя записи. */
const FIRST_WIDTH = 240;
const WIDTH = 180;
const PIN_WIDTH = 40;
/** Колонка флажков — `td.sel` прототипа: 32px, флажок с отступом 6px. */
const SELECT_WIDTH = 32;
/**
 * Поле прокрутки слева и справа — `.page.full` прототипа (px-6).
 *
 * Липкие колонки отсчитываются от него с минусом: Chrome держит sticky
 * внутри padding контейнера прокрутки, и `left: 0` прилипал бы в 24px
 * от края — а в этой щели проезжали бы прокрученные ячейки.
 */
const GUTTER = 24;
/** Уже — и в колонке не остаётся места ни под подпись, ни под значок. */
const MIN_WIDTH = 80;

/**
 * За сколько строк до конца заказывать следующий кусок. Столько же
 * держит в запасе виртуализатор — то есть заказ уходит ровно тогда,
 * когда первая незагруженная строка вот-вот понадобится.
 */
const END_GAP = 10;

/**
 * Высота строки. Дублирует токен --spacing-row (класс h-row): виртуализатор
 * считает смещения в JS и прочитать CSS-переменную не может. Значения
 * обязаны совпадать — иначе строки поедут относительно прокрутки.
 * Сверяет app/styles.test.ts.
 */
const ROW_HEIGHT = 34;

/**
 * С какого числа колонок они виртуализируются.
 *
 * Ниже порога строка живёт в DOM целиком, и это не лень: последней
 * колонке ширина не задаётся, она забирает свободное место, и таблица
 * из трёх полей занимает экран, а не жмётся полосой у левого края.
 * Распорка же требует известной ширины у каждой колонки — иначе она
 * не знает, что именно заменяет.
 *
 * Порог стоит там, где растягивать уже нечего: два десятка колонок
 * не влезают ни в один экран, и последняя ведёт себя как остальные.
 */
const VIRTUAL_FROM = 20;

/*
 * overflow-hidden обязателен: table-fixed задаёт ширину колонки, но
 * длинное значение всё равно вылезает поверх соседей — ссылка на файл
 * растягивала строку на весь экран.
 */
const cellBase = "h-row overflow-hidden border-b border-border text-sm";
const cell = `${cellBase} px-2`;

/* Закреплённые колонки узкие: их содержимое центрируется, а не отступает. */
const pinCell = `${cellBase} p-0`;

/*
 * Закреплённые крайние колонки. Фон непрозрачный: под ними проезжают
 * ячейки, и без него текст накладывается на текст.
 *
 * Граница нарисована тенью, а не border: у sticky-ячейки собственная
 * граница уезжает вместе с прокруткой на пиксель и мерцает.
 */
/*
 * Колонка флажков линии справа не держит — как `td.sel` прототипа:
 * флажок прижат к имени записи, а не отгорожен от него.
 */
const selectCol = "sticky -left-6 z-10 bg-surface";
const pinRight = "sticky -right-6 z-10 bg-surface shadow-[-1px_0_0_0_var(--color-border)]";

/** Общий пустой набор: без него у DataGrid на каждый рендер новый Set. */
const EMPTY_PINS: ReadonlySet<string> = new Set<string>();

/** Постоянная ссылка: литерал в значении по умолчанию — новый массив на рендер. */
const EMPTY_GROUPS: Field[] = [];

/**
 * Колонка, которой нет в схеме: значение считает фича по другим
 * таблицам — воронка вакансии по её кандидатам (features/hrms).
 * Только читается: сортировать, фильтровать и править её бэкенду
 * нечем. Стоит после колонок view, ширина постоянная.
 */
export type ExtraColumn = {
  id: string;
  label: string;
  width: number;
  /** Число — по правому краю, как остальные числовые колонки. */
  numeric?: boolean;
  render: (row: Item) => ReactNode;
};

/** Постоянная ссылка: см. EMPTY_GROUPS. */
const NO_EXTRA: ExtraColumn[] = [];

/** Какая ячейка раскрыта. Одна на таблицу: двух курсоров не бывает. */
type Active = { index: number; slug: string; anchor: DOMRect };

/**
 * Индекс черновика новой строки. Отрицательный, потому что в `rows` его
 * нет: строка ещё не существует, а раскрытая ячейка адресуется индексом.
 */
const DRAFT = -1;

/** Пустой набор ошибок: без него у грида без черновика новая Map на рендер. */
const NO_ERRORS: ReadonlyMap<string, CellError> = new Map();

/** Постоянная ссылка: у дерева сортировки нет, а новый массив — новый рендер. */
const NO_SORTS: Sort[] = [];

/** Виды, чьи значения стоят по правому краю — как `td.num` прототипа. */
const NUMERIC = new Set(["number", "formula"]);

/** Открытое меню колонки. Тоже одно: оно всплывает поверх таблицы. */
type Menu = { slug: string; anchor: DOMRect };

/**
 * Закреплённые колонки: сдвигаются влево и остаются на месте при
 * прокрутке вбок.
 *
 * Ключевое — «сдвигаются». Липкой можно сделать только колонку, левее
 * которой ничего не прокручивается, поэтому закреплённые собираются
 * в начало ряда, а не подсвечиваются на своих местах. Их взаимный
 * порядок при этом остаётся порядком view: закрепление — не сортировка.
 *
 * Смещения считаются здесь же: sticky нужен точный left в пикселях,
 * а он складывается из ширины колонки с флажками и ширин всех
 * закреплённых слева.
 */
function pinLayout(
  columns: Field[],
  pinned: ReadonlySet<string>,
  widthOf: (column: Field, index: number) => number,
) {
  if (!pinned.size) return { ordered: columns, lefts: new Map<string, number>(), count: 0 };

  const front = columns.filter((column) => pinned.has(column.id));
  const rest = columns.filter((column) => !pinned.has(column.id));
  const ordered = [...front, ...rest];

  const lefts = new Map<string, number>();
  // Минус поле: см. GUTTER.
  let left = SELECT_WIDTH - GUTTER;

  ordered.slice(0, front.length).forEach((column, index) => {
    lefts.set(column.id, left);
    left += widthOf(column, index);
  });

  return { ordered, lefts, count: front.length };
}

export function DataGrid({
  tableSlug,
  columns,
  extra = NO_EXTRA,
  pinned,
  widths,
  onWidth,
  rows,
  groups = EMPTY_GROUPS,
  tree,
  relations,
  locale,
  language,
  selected,
  onSelect,
  sorts = NO_SORTS,
  onSort,
  onAddField,
  columnActions,
  onOpenRow,
  onDeleteRow,
  count,
  onEdit,
  onCreate,
  onAddRow,
  creating,
  onEndReached,
  newRowDefaults,
}: {
  /** Слаг таблицы: ячейка-связь пишет не только в свою строку. */
  tableSlug: string;
  columns: Field[];
  /** Вычисляемые колонки после колонок view — см. ExtraColumn. */
  extra?: ExtraColumn[] | undefined;
  /**
   * Чем заполнена новая строка сверх настроек полей — «свой» по связи,
   * помеченной подстановкой (см. features/item/model/relation).
   * Считает это страница: ей видно и схему, и сеанс.
   */
  newRowDefaults?: Item | undefined;
  /**
   * Докрутили до конца загруженного — пора просить следующий кусок.
   * Не задан — таблица показывает ровно то, что ей дали.
   */
  onEndReached?: (() => void) | undefined;
  /** id закреплённых колонок. Пусто — обычная таблица. */
  pinned?: ReadonlySet<string>;
  /**
   * Ширины колонок, заданные человеком: id поля → пиксели. Чего здесь
   * нет — то по умолчанию.
   */
  widths?: Record<string, number> | undefined;
  /**
   * Новая ширина колонки. Ноль — вернуть исходную (двойной щелчок
   * по ручке). Не задан — колонки не тянутся.
   */
  onWidth?: ((fieldId: string, width: number) => void) | undefined;
  rows: Item[];
  /**
   * Колонки группировки в порядке уровней. Строки уже приходят
   * отсортированными по ним (это забота запроса), таблица лишь вставляет
   * заголовок на каждой смене значения и умеет сворачивать группу.
   * Пусто — плоский список.
   */
  groups?: Field[] | undefined;
  /**
   * Дерево: строки уже разложены в порядке обхода (см. model/tree),
   * таблица рисует отступ по глубине и шеврон у узлов с детьми.
   * Взаимоисключающе с group — TREE view группировку не настраивает.
   */
  tree?:
    | {
        meta: ReadonlyMap<string, TreeMeta>;
        expanded: ReadonlySet<string>;
        onToggle: (guid: string) => void;
        /** Завести дочернюю строку. Нет — кнопки у строк нет. */
        onAddChild?: ((guid: string) => void) | undefined;
      }
    | undefined;
  relations: Relation[];
  /** Локаль интерфейса: форматы дат и чисел. */
  locale: string;
  /** Язык данных: подписи полей и вариантов. */
  language: string;
  /** guid отмеченных строк. */
  selected: ReadonlySet<string>;
  onSelect: (next: Set<string>) => void;
  sorts?: Sort[];
  /**
   * Без направления — клик по заголовку: вверх, вниз, никак.
   *
   * Необязателен: у дерева свой порядок — обход иерархии, — и ручка
   * /tree сортировки не читает вовсе. Без обработчика заголовок
   * перестаёт быть кнопкой, а меню колонки не предлагает сортировку:
   * рабочий на вид пункт, который ничего не делает, хуже отсутствующего.
   */
  onSort?: ((field: string, direction?: SortDirection) => void) | undefined;
  /** Кнопка «+» в шапке. Панель нового поля всплывает под ней — отсюда якорь. */
  onAddField?: (anchor: DOMRect) => void;
  /** Действия над колонкой. Нет — меню в шапке не появляется. */
  columnActions?: ColumnActions;
  /** Раскрыть строку целиком. Нет — кнопка в строке не появляется. */
  onOpenRow?: (guid: string) => void;
  /**
   * Удалить одну строку — урна у правого края. Подтверждение спрашивает
   * вызывающий. Нет — кнопки нет: у роли без права она отвечала бы 403.
   */
  onDeleteRow?: ((guid: string) => void) | undefined;
  /**
   * Сколько строк всего — «Кол-во» в подвале таблицы (`tfoot` прототипа).
   * Всего, а не загружено: страница показывает двадцать из тысячи.
   * Не задан — подвала нет.
   */
  count?: number | undefined;
  /**
   * Своё действие вместо строки-черновика: админ мог задать view адрес
   * собственной формы создания (attributes.url_object). Не задан —
   * строка заводится на месте.
   */
  onAddRow?: (() => void) | undefined;
  /** Без обработчика таблица только читается: ячейка раскрывается, но не правится. */
  onEdit?: (guid: string, slug: string, value: unknown) => void;
  /**
   * Создать строку. `done` закрывает черновик — зовётся только после
   * ответа сервера: строка, исчезнувшая с экрана до того, как её приняли,
   * при отказе уносит с собой всё набранное.
   *
   * Нет обработчика — нет и строки «новая запись».
   */
  onCreate?: (values: Item, done: () => void) => void;
  /** Запрос создания в пути: второе нажатие завело бы вторую строку. */
  creating?: boolean;
}) {
  const { t } = useTranslation();

  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  /**
   * Черновик новой строки — та же строка таблицы, только её ещё нет
   * в базе. Правится теми же редакторами (ActiveCell), поэтому и хранится
   * в той же форме: у поля один способ правки, где бы его ни открыли.
   *
   * guid придумывает клиент, а не сервер (см. api/relations): редакторы
   * без первичного ключа не открываются, а ждать его от вставки — значит
   * не дать заполнить строку до её создания.
   */
  const [draft, setDraft] = useState<Item | null>(null);
  /**
   * Показывать ли ошибки. Не с первого нажатия: у новой строки пусты
   * все обязательные поля сразу, и красный ряд в ответ на «создать
   * запись» — это выговор за то, чего человек ещё не делал.
   */
  const [showErrors, setShowErrors] = useState(false);

  const errors = draft ? rowErrors(columns, draft) : NO_ERRORS;

  /** Сообщение админа важнее нашего: он писал его про конкретное поле. */
  const errorText = (error: CellError) =>
    error.message || t(error.kind === "required" ? "cell.required" : "cell.invalid");

  const patchDraft = (values: Item) =>
    setDraft((current) => (current ? { ...current, ...values } : current));

  const startDraft = () => {
    setDraft(blankItem(columns, newRowDefaults));
    setShowErrors(false);
  };

  const cancelDraft = () => {
    setDraft(null);
    setActive(null);
  };

  /**
   * Отправка черновика. Не прошло проверку — не отправляем и говорим
   * чем именно: незаполненная колонка бывает уехавшей за край экрана,
   * и красной рамки, которой не видно, недостаточно.
   */
  const submitDraft = () => {
    if (!draft || !onCreate || creating) return;

    const [first] = [...errors];
    if (first) {
      const [slug, error] = first;
      const field = columns.find((column) => column.slug === slug);
      const label = field ? localized(field.labels, language, field.label) : slug;

      setShowErrors(true);
      toast.error(`${label}: ${errorText(error)}`);
      return;
    }

    setActive(null);
    // `<слаг>_data` из черновика отбрасывает useCreateItem: таких колонок нет.
    onCreate(draft, () => setDraft(null));
  };

  // Связи ищутся по id на каждой ячейке-ссылке — держим индексом.
  const byId = new Map(relations.map((relation) => [relation.id, relation]));

  /** Элементы <col>: во время перетаскивания ширина пишется прямо в них. */
  const cols = useRef(new Map<string, HTMLTableColElement>());

  /*
   * Ширина колонки: заданная человеком, иначе по умолчанию. Первая
   * шире — в ней обычно имя записи.
   */
  const widthOf = (column: Field, index: number) =>
    widths?.[column.id] ?? (index === 0 ? FIRST_WIDTH : WIDTH);

  const { ordered, lefts, count: pinnedCount } = pinLayout(columns, pinned ?? EMPTY_PINS, widthOf);

  /*
   * Во время перетаскивания ширина пишется прямо в <col>, а наружу
   * уходит один раз, на отпускании: она персистится, и запись на каждое
   * движение мыши — это запись шестьдесят раз в секунду. Заодно грид
   * не перерисовывается на каждый пиксель.
   */
  const startResize = (event: ReactPointerEvent, column: Field, index: number) => {
    if (!onWidth || event.button !== 0) return;
    event.preventDefault();

    const col = cols.current.get(column.id);
    if (!col) return;

    const startX = event.clientX;
    const startWidth = widthOf(column, index);
    const widthAt = (clientX: number) => Math.max(MIN_WIDTH, Math.round(startWidth + clientX - startX));

    const onMove = (move: PointerEvent) => {
      col.style.width = `${widthAt(move.clientX)}px`;
    };
    const onUp = (up: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.body.style.cursor = "";
      onWidth(column.id, widthAt(up.clientX));
    };

    document.body.style.cursor = "col-resize";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const ids = rows.map(rowKey);
  const checked = ids.filter((id) => selected.has(id));
  const allChecked = ids.length > 0 && checked.length === ids.length;

  /*
   * Свёрнутые группы. Живут в таблице, а не в адресе: свёрнутость — как
   * прокрутка, состояние взгляда, а не экрана, который пересылают ссылкой.
   */
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  /** Записи на экране: строки вперемешку с заголовками групп.
      useMemo не для красоты: виртуализатор рендерит на каждый кадр
      прокрутки, а это O(строк). */
  const groupSlugs = groups.map((field) => field.slug).join("|");
  const entries = useMemo(
    () =>
      groupSlugs
        ? visibleEntries(groupEntries(rows, groupSlugs.split("|")), folded)
        : null,
    [rows, groupSlugs, folded],
  );

  /*
   * Колонки виртуализируются только на широкой таблице — см. VIRTUAL_FROM.
   * Ширины берутся оттуда же, откуда их берёт <colgroup>, поэтому окно
   * считается по тем же пикселям, что видит человек.
   *
   * Отсчёт у виртуализатора идёт от левого края прокрутки, а поле 24px
   * и колонка с флажками сдвигают содержимое на 56 — этот сдвиг
   * покрывает запас: колонка уже 80 пикселей не бывает.
   */
  const virtualColumns = ordered.length >= VIRTUAL_FROM;
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: ordered.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => widthOf(ordered[index]!, index),
    overscan: 2,
    enabled: virtualColumns,
  });

  const shown = columnWindow(
    ordered.length,
    pinnedCount,
    columnVirtualizer.getVirtualItems().map((item) => item.index),
  );

  const virtualizer = useVirtualizer({
    count: entries ? entries.length : rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    // Запас сверху и снизу: без него при быстрой прокрутке видно пустоту
    // раньше, чем React успевает дорисовать строки.
    overscan: 10,
  });

  const visible = virtualizer.getVirtualItems();
  const first = visible[0];
  const last = visible[visible.length - 1];
  const before = first ? first.start : 0;
  const after = last ? virtualizer.getTotalSize() - last.end : 0;

  /*
   * Следующий кусок строк заказывается, когда до конца загруженного
   * осталось меньше запаса виртуализатора: к моменту, когда человек
   * докрутит, строки уже здесь, и прокрутка не спотыкается о пустоту.
   *
   * Эффект, а не обработчик прокрутки: виртуализатор и так пересчитывает
   * видимое окно, а второй слушатель scroll стоил бы кадров на каждой
   * строке. Повторные вызовы безопасны — сам loadMore не делает ничего,
   * пока предыдущий запрос не вернулся.
   */
  const lastIndex = last?.index ?? -1;
  const total = entries ? entries.length : rows.length;
  useEffect(() => {
    if (onEndReached && lastIndex >= total - END_GAP) onEndReached();
  }, [onEndReached, lastIndex, total]);

  /** Столбцов в строке — для распорок, у которых своих ячеек нет. */
  const span = columns.length + extra.length + 2;

  /**
   * «Выделить всё» — только про загруженную страницу. Отметить строки,
   * которых на экране нет, значит удалить их вслепую.
   */
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onSelect(next);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    onSelect(next);
  };

  /**
   * Клик по ячейке. Флажок переключается на месте — ради двух состояний
   * открывать меню незачем; остальное раскрывается поверх таблицы.
   */
  const open = (index: number, field: Field, element: HTMLElement) => {
    const row = index === DRAFT ? draft : rows[index];
    const guid = row?.guid;
    const boolean = editorKind(field) === "boolean";

    if (index === DRAFT) {
      if (boolean) return patchDraft({ [field.slug]: !row?.[field.slug] });
    } else if (row && guid && onEdit && boolean) {
      onEdit(guid, field.slug, !row[field.slug]);
      return;
    }

    setActive({ index, slug: field.slug, anchor: element.getBoundingClientRect() });
  };

  const activeField = active ? columns.find((column) => column.slug === active.slug) : undefined;
  const menuField = menu ? columns.find((column) => column.slug === menu.slug) : undefined;
  const activeDraft = active?.index === DRAFT;
  const activeRow = active ? (activeDraft ? draft : rows[active.index]) : undefined;
  // Черновик правится всегда: его guid для того и придуман заранее.
  const activeGuid = activeDraft || onEdit ? activeRow?.guid : undefined;

  /*
   * Новая страница, другой фильтр, другая сортировка — таблица
   * возвращается наверх. Без этого прокрутка остаётся на прежнем месте,
   * и вторая страница открывается с середины. Обновление тех же строк
   * (после правки ячейки) первую строку не меняет и прокрутку не трогает.
   */
  const topId = ids[0];
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [topId]);

  /*
   * Enter отправляет черновик, Escape закрывает его — но только когда
   * поверх него ничего нет: у открытого редактора свой Enter («применить»)
   * и свой Escape («отменить правку»), и одно нажатие не должно делать
   * оба действия сразу.
   *
   * Без списка зависимостей намеренно: обработчик держит в себе черновик
   * целиком, и перечислять то, из чего он собран, — способ однажды
   * отправить позавчерашнее значение.
   */
  useEffect(() => {
    if (!draft || active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") submitDraft();
      if (event.key === "Escape") cancelDraft();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    /*
     * Поля 24px по бокам — `.page.full` прототипа: таблица отступает от
     * сайдбара так же, как строка вкладок над ней. Полем, а не отступом
     * таблицы: прокручивается вся ширина, и закреплённые колонки
     * прилипают к краю окна, доехав до него.
     */
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-6">
      {/*
        w-full растягивает таблицу на всю ширину, min-w-max не даёт ей
        сжаться уже содержимого. Слабину забирает ПОСЛЕДНЯЯ колонка —
        ей одной не задана ширина, и table-fixed отдаёт ей всё, что
        осталось. Раньше слабину забирала отдельная колонка-распорка,
        и на экране она читалась как лишний пустой столбец в конце
        таблицы — с рамками, но без заголовка и без содержимого.
      */}
      <table className="w-full min-w-max table-fixed border-separate border-spacing-0">
        <colgroup>
          <col style={{ width: SELECT_WIDTH }} />
          {ordered.map((column, index) => (
            /*
             * Последней колонке ширина не задаётся: она растягивается
             * на всё свободное место, и таблица из двух полей занимает
             * экран целиком, а не жмётся узкой полосой у левого края.
             *
             * Когда колонок больше, чем влезает, растягивать нечего —
             * min-w-max держит их естественную ширину, и последняя
             * ведёт себя как остальные.
             */
            <col
              key={column.id}
              ref={(element) => {
                if (element) cols.current.set(column.id, element);
                else cols.current.delete(column.id);
              }}
              /*
               * Последней колонке ширина не задаётся, пока её не задали
               * руками: без неё она растягивается на свободное место,
               * с ней — слушается человека. На широкой таблице ширина
               * есть у всех: по ней считается окно и распорки.
               */
              {...(index === ordered.length - 1 &&
              !virtualColumns &&
              !extra.length &&
              widths?.[column.id] === undefined
                ? {}
                : { style: { width: widthOf(column, index) } })}
            />
          ))}

          {/* Последняя вычисляемая забирает свободное место — как
              последняя колонка view, когда вычисляемых нет. */}
          {extra.map((column, index) => (
            <col
              key={column.id}
              {...(index === extra.length - 1 && !virtualColumns
                ? {}
                : { style: { width: column.width } })}
            />
          ))}

          <col style={{ width: PIN_WIDTH }} />
        </colgroup>

        {/* Шапка липкая: колонки нужны и на тысячной строке. */}
        <thead className="sticky top-0 z-20 bg-surface">
          <tr className="group/headrow">
            {/* «Выделить всё» — по наведению на шапку, как в прототипе.
                Пока что-то отмечено, флажок виден всегда: он показывает
                состояние. */}
            <th className={`${pinCell} ${selectCol} z-30`}>
              <span
                className={`flex h-full items-center pl-1.5 transition-opacity focus-within:opacity-100 ${
                  checked.length ? "" : "opacity-0 group-hover/headrow:opacity-100"
                }`}
              >
                <Checkbox
                  checked={allChecked}
                  indeterminate={checked.length > 0 && !allChecked}
                  onChange={toggleAll}
                  aria-label={t("table.selectAll")}
                  disabled={!ids.length}
                />
              </span>
            </th>

            {columnCells(ordered, shown, (column, index) => (
              <HeaderCell
                key={column.id}
                column={column}
                language={language}
                sorts={sorts}
                left={lefts.get(column.id)}
                lastPinned={index === pinnedCount - 1}
                last={!virtualColumns && !extra.length && index === ordered.length - 1}
                {...(onWidth
                  ? {
                      onResize: (event: ReactPointerEvent) => startResize(event, column, index),
                      onResetWidth: () => onWidth(column.id, 0),
                    }
                  : {})}
                onSort={onSort}
                onMenu={
                  columnActions
                    ? (element) =>
                        setMenu({ slug: column.slug, anchor: element.getBoundingClientRect() })
                    : undefined
                }
              />
            ))}

            {extra.map((column, index) => (
              <th
                key={column.id}
                className={`${cell} border-r font-normal text-fg-muted ${
                  column.numeric ? "text-right" : "text-left"
                }`}
              >
                {/* Пол последней — как у HeaderCell (`last`): без ширины
                    в colgroup она иначе сжимается в ноль на широкой таблице. */}
                <span
                  className="block truncate"
                  style={index === extra.length - 1 ? { minWidth: column.width - 16 } : undefined}
                >
                  {column.label}
                </span>
              </th>
            ))}

            <th className={`${pinCell} ${pinRight} z-30`}>
              <span className="grid h-full place-items-center">
                <button
                  type="button"
                  onClick={(event) => onAddField?.(event.currentTarget.getBoundingClientRect())}
                  disabled={!onAddField}
                  aria-label={t("table.addField")}
                  title={t("table.addField")}
                  className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon as={PlusIcon} />
                </button>
              </span>
            </th>
          </tr>
        </thead>

        {/* Пустое значение в строке таблицы — пустая ячейка, как
            в прототипе; прочерк остаётся карточке и редакторам. */}
        <tbody className="[&_[data-empty]]:invisible">
          {/* Распорки вместо невидимых строк: одна ячейка нужной высоты
              дешевле тысячи <tr> и не ломает ни ширины, ни прокрутку. */}
          {before > 0 && <Spacer height={before} span={span} />}

          {visible.map((virtual) => {
            const entry = entries?.[virtual.index];

            /*
             * Заголовок группы — строка на всю ширину. Значение рисует
             * та же ячейка, что и в теле таблицы: у статуса это цветная
             * плашка, у связи — подпись по полям показа, и рисовать их
             * вторым способом значило бы однажды разойтись с колонкой.
             */
            if (entry && entry.kind === "header" && groups[entry.level]) {
              const group = groups[entry.level]!;
              const headerRow = rows[entry.row]!;
              const value = headerRow[group.slug];
              const empty =
                value === null ||
                value === undefined ||
                value === "" ||
                (Array.isArray(value) && !value.length);
              const isFolded = folded.has(entry.key);

              return (
                <tr key={virtual.key} className="bg-surface-hover">
                  <td colSpan={span} className={`${cellBase} p-0`}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(entry.key)}
                      aria-expanded={!isFolded}
                      /* Липнет к левому краю: у таблицы шире экрана
                         заголовок иначе уезжает вместе с прокруткой вбок.
                         Отступ — по уровню: вложенная группа читается
                         только по нему. */
                      style={{ paddingLeft: 8 + entry.level * 16 }}
                      className="sticky left-0 flex h-row max-w-full items-center gap-1.5 pr-2 text-sm"
                    >
                      <Icon
                        as={isFolded ? ChevronRightIcon : ChevronDownIcon}
                        size={14}
                        className="shrink-0 text-fg-muted"
                      />

                      <span className="flex min-w-0 items-center font-medium">
                        {empty ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <Cell
                            field={group}
                            row={headerRow}
                            tableSlug={tableSlug}
                            relations={byId}
                            locale={locale}
                            language={language}
                          />
                        )}
                      </span>

                      {/* Счёт загруженного, а не всей группы: остальная
                          её часть ещё на сервере. */}
                      <span className="shrink-0 text-xs text-fg-subtle">{entry.count}</span>
                    </button>
                  </td>
                </tr>
              );
            }

            const index = entry ? entry.row : virtual.index;
            const row = rows[index]!;
            const id = ids[index]!;
            const isSelected = selected.has(id);

            /*
             * Раскрытое поддерево подкрашивается: без фона не видно,
             * где кончаются дети раскрытого узла и начинаются соседние
             * корни, — отступ первой колонки уезжает за край экрана
             * вместе с прокруткой вбок.
             */
            const info = tree?.meta.get(id);
            const inSubtree = Boolean(tree && info && (info.depth > 0 || tree.expanded.has(id)));

            /*
             * Фон отмеченной строки задаётся и на закреплённых ячейках:
             * у них собственный непрозрачный фон, и подсветка строки
             * из-под них не видна. Подсветка кладётся tint-*, а не
             * фоном: она полупрозрачная, и под ней проезжали бы
             * соседние колонки.
             */
            const pinBg = isSelected
              ? "bg-surface tint-accent-subtle"
              : inSubtree
                ? "bg-surface tint-surface-hover"
                : // Наведение — тоже: иначе липкая ячейка выпадает из подсветки строки.
                  "bg-surface group-hover/row:tint-surface-hover";

            return (
              <tr
                /*
                 * Ключ — место в окне виртуализатора, а не guid строки.
                 * guid обязан быть уникальным, но бэкенд отдаёт страницы
                 * внахлёст (см. docs/backend-notes.md), и одна и та же
                 * строка приезжает дважды. Два одинаковых ключа React
                 * не сверяет — старые <tr> зависают в DOM поверх окна,
                 * а на их месте появляются пустые полосы.
                 */
                key={virtual.key}
                className={`group/row ${
                  isSelected
                    ? "bg-accent-subtle"
                    : inSubtree
                      ? "bg-surface-hover"
                      : "hover:bg-surface-hover"
                }`}
              >
                {/* Флажок — по наведению; у отмеченной и пока отмечена
                    хоть одна — всегда: он показывает выделение. */}
                <td className={`${pinCell} ${selectCol} ${pinBg}`}>
                  <span
                    className={`flex h-full items-center pl-1.5 transition-opacity focus-within:opacity-100 ${
                      checked.length ? "" : "opacity-0 group-hover/row:opacity-100"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleRow(id)}
                      aria-label={t("table.selectRow")}
                    />
                  </span>
                </td>

                {columnCells(ordered, shown, (column, columnIndex) => {
                  const isActive = active?.index === index && active.slug === column.slug;
                  const left = lefts.get(column.id);

                  return (
                    <td
                      key={column.id}
                      onClick={(event) => open(index, column, event.currentTarget)}
                      /* Раскрытая ячейка подсвечивается: карточка редактора
                         накрывает её не целиком, когда та шире колонки.

                         У закреплённой фон обязателен и здесь: под ней
                         проезжают чужие ячейки, и прозрачная показала бы
                         текст поверх текста. */
                      style={left === undefined ? undefined : { left }}
                      className={`${cell} cursor-default border-r ${
                        columnIndex === 0 ? "font-medium" : ""
                      } ${isActive && left === undefined ? "bg-accent-subtle" : ""} ${
                        left === undefined
                          ? ""
                          : `sticky z-10 ${isActive ? "bg-surface tint-accent-subtle" : pinBg} ${
                              columnIndex === pinnedCount - 1
                                ? "shadow-[1px_0_0_0_var(--color-border)]"
                                : ""
                            }`
                      }`}
                    >
                      <span
                        className={`relative flex h-full min-w-0 items-center ${
                          NUMERIC.has(cellKind(column.type)) ? "justify-end" : ""
                        }`}
                      >
                        {/* Дерево живёт в первой колонке: отступ по глубине
                            и шеврон у узла с детьми. Узел без детей получает
                            распорку той же ширины — значения одной глубины
                            стоят в столбик, а не лесенкой. */}
                        {tree && columnIndex === 0 && (
                          <TreeHandle guid={id} tree={tree} />
                        )}
                        <Cell
                          field={column}
                          row={row}
                          tableSlug={tableSlug}
                          relations={byId}
                          locale={locale}
                          language={language}
                        />

                        {/* «Открыть» — в первой колонке по наведению, поверх
                            конца значения, как `.open-btn` прототипа:
                            плашка с тенью, подпись капсом. */}
                        {onOpenRow && columnIndex === 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              // Только раскрытие: ячейка под кнопкой не открывается.
                              event.stopPropagation();
                              onOpenRow(id);
                            }}
                            className="absolute top-1/2 right-0 hidden h-5.5 -translate-y-1/2 items-center gap-1 rounded-[4px] bg-surface px-1.5 text-[11.5px] font-semibold tracking-[.3px] text-fg-muted uppercase shadow-raised transition-colors group-hover/row:inline-flex hover:text-fg"
                          >
                            <Icon as={PanelRightOpenIcon} size={12} />
                            {t("cell.open")}
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}

                {extra.map((column) => (
                  <td key={column.id} className={`${cell} border-r`}>
                    <span
                      className={`flex h-full min-w-0 items-center ${
                        column.numeric ? "justify-end tabular-nums" : ""
                      }`}
                    >
                      {column.render(row)}
                    </span>
                  </td>
                ))}

                {/* Правый край строки: урна удаляет эту строку. В дереве
                    вместо неё «+» дочерней записи, а урна показывается
                    у отмеченной флажком. Раскрытие строки живёт в первой
                    колонке — здесь его больше нет. */}
                <td className={`${pinCell} ${pinRight} ${pinBg}`}>
                  <span className="flex h-full items-center justify-center gap-0.5">
                    {tree?.onAddChild && !isSelected && (
                      <button
                        type="button"
                        onClick={() => tree.onAddChild?.(id)}
                        aria-label={t("tree.addChild")}
                        title={t("tree.addChild")}
                        className="hidden size-6 place-items-center rounded-md text-fg-subtle transition-colors group-hover/row:grid hover:bg-surface-active hover:text-fg"
                      >
                        <Icon as={PlusIcon} size={14} />
                      </button>
                    )}

                    {onDeleteRow && (!tree || isSelected) && (
                      <button
                        type="button"
                        onClick={() => onDeleteRow(id)}
                        aria-label={t("table.deleteRow")}
                        title={t("table.deleteRow")}
                        className={`${
                          tree && isSelected ? "grid" : "hidden group-hover/row:grid"
                        } size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger`}
                      >
                        <Icon as={Trash2Icon} size={14} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}

          {after > 0 && <Spacer height={after} span={span} />}

          {/*
            Черновик новой строки — последней, там же, где её создали.
            Он вне виртуализации: строка одна, и уезжать за пределы окна
            прокрутки вместе с данными она не должна.
          */}
          {draft && (
            <tr className="bg-surface">
              <td className={`${pinCell} ${selectCol}`}>
                <span className="flex h-full items-center">
                  <button
                    type="button"
                    onClick={cancelDraft}
                    aria-label={t("action.cancel")}
                    title={t("action.cancel")}
                    className="grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                  >
                    <Icon as={XIcon} size={14} />
                  </button>
                </span>
              </td>

              {columnCells(ordered, shown, (column, columnIndex) => {
                const isActive = activeDraft && active?.slug === column.slug;
                const left = lefts.get(column.id);
                const problem = showErrors ? errors.get(column.slug) : undefined;

                return (
                  <td
                    key={column.id}
                    onClick={(event) => open(DRAFT, column, event.currentTarget)}
                    /* Полный текст подсказкой: в углу ячейки шириной
                       180 пикселей длинное сообщение админа обрезано. */
                    title={problem ? errorText(problem) : undefined}
                    style={left === undefined ? undefined : { left }}
                    /* Рамка внутрь (-outline-offset), а не border: своя
                       граница у ячейки уже занята сеткой таблицы, а
                       outline рисуется поверх неё и ничего не сдвигает. */
                    className={`${cell} relative cursor-default border-r ${
                      problem ? "outline-1 -outline-offset-1 outline-danger" : ""
                    } ${isActive ? "bg-accent-subtle" : ""} ${
                      left === undefined
                        ? ""
                        : `sticky z-10 ${isActive ? "" : "bg-surface"} ${
                            columnIndex === pinnedCount - 1
                              ? "shadow-[1px_0_0_0_var(--color-border)]"
                              : ""
                          }`
                    }`}
                  >
                    <span className="flex h-full min-w-0 items-center">
                      <Cell
                        field={column}
                        row={draft}
                        tableSlug={tableSlug}
                        relations={byId}
                        locale={locale}
                        language={language}
                      />
                    </span>

                    {/* Что именно не так — в углу самой ячейки: строка
                        высотой 36px не даёт места под подпись снизу, а
                        значение под текстом ошибки прикрыто фоном. */}
                    {problem && (
                      <span className="pointer-events-none absolute right-0 bottom-0 max-w-full truncate bg-surface px-1 text-2xs leading-tight text-danger">
                        {errorText(problem)}
                      </span>
                    )}
                  </td>
                );
              })}

              {/* Считать вычисляемым пока не по чему: строки ещё нет. */}
              {extra.map((column) => (
                <td key={column.id} className={`${cell} border-r`} />
              ))}

              <td className={`${pinCell} ${pinRight}`}>
                <span className="grid h-full place-items-center">
                  <button
                    type="button"
                    onClick={submitDraft}
                    disabled={creating}
                    aria-label={t("table.saveRow")}
                    title={t("table.saveRow")}
                    className="grid size-6 place-items-center rounded-md text-accent-text transition-colors hover:bg-accent-subtle disabled:opacity-40"
                  >
                    <Icon as={CheckIcon} size={14} />
                  </button>
                </span>
              </td>
            </tr>
          )}

          {/* Кнопка новой строки — под последней, а не в шапке: строку
              дописывают в конец списка, туда же и смотрят. */}
          {onCreate && !draft && (
            <tr className="group/add hover:bg-surface-hover">
              <td colSpan={span} className="border-b border-border p-0">
                <button
                  type="button"
                  onClick={onAddRow ?? startDraft}
                  /* Кнопка липнет к левому краю: у таблицы шире экрана
                     она иначе уезжает из виду вместе с первой колонкой. */
                  className="sticky left-0 flex h-row items-center gap-1.5 px-2 text-sm text-fg-subtle transition-colors group-hover/add:text-fg"
                >
                  <Icon as={PlusIcon} size={16} />
                  {t("table.addRow")}
                </button>
              </td>
            </tr>
          )}
        </tbody>

        {/*
          Подвал — `tfoot` прототипа: липнет к низу, «Кол-во» под первой
          колонкой. Одна ячейка во всю ширину, а не по ячейке на колонку:
          итогов по колонкам нет — бэкенд не считает сумм, а сумма
          по загруженной странице выдавала бы часть за целое.

          Вбок подпись уезжает вместе с первой колонкой, как в прототипе.
          Липкой её не сделать: sticky внутри липкого tfoot Chrome
          не держит, и она уезжала бы всё равно — только криво.
        */}
        {count !== undefined && (
          <tfoot className="sticky bottom-0 z-20 bg-surface">
            <tr>
              <td colSpan={span} className="h-row border-t border-border p-0">
                <span
                  style={{ paddingLeft: SELECT_WIDTH + 8 }}
                  className="flex h-row items-center text-2xs text-fg-subtle"
                >
                  {t("table.count")}
                  <b className="ml-1 text-xs font-medium text-fg-muted tabular-nums">{count}</b>
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {menu && menuField && columnActions && (
        <ColumnMenu
          key={menu.slug}
          field={menuField}
          language={language}
          anchor={menu.anchor}
          actions={columnActions}
          onSort={onSort}
          onClose={() => setMenu(null)}
        />
      )}

      {active && activeField && activeRow && (
        <ActiveCell
          // Ключ по строке и полю: перенос на соседнюю ячейку — это
          // другой редактор с другим черновиком, а не тот же самый.
          key={`${active.index}:${active.slug}`}
          field={activeField}
          row={activeRow}
          guid={activeGuid}
          tableSlug={tableSlug}
          anchor={active.anchor}
          relations={byId}
          locale={locale}
          language={language}
          /* У черновика «только чтение» не действует: настройка про
             правку заведённой строки, а не про её заполнение. */
          creating={activeDraft}
          // «Настроить поле» прямо из раскрытой ячейки: варианты
          // статуса правят, глядя на список, а не на схему таблицы.
          onSettings={columnActions?.settings}
          onEdit={(value) => {
            if (activeDraft) patchDraft({ [active.slug]: value });
            else if (activeGuid) onEdit?.(activeGuid, active.slug, value);
          }}
          /*
           * У черновика связь не уезжает запросом: строки в базе ещё нет.
           * Выбранная запись ложится рядом со ссылкой (`<слаг>_data`) —
           * из неё ячейка и берёт, что показать вместо uuid.
           */
          onLink={
            activeDraft
              ? (item) =>
                  patchDraft({
                    [active.slug]: item?.guid ?? null,
                    [relationDataKey(active.slug)]: item,
                  })
              : undefined
          }
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/**
 * Ячейки одного ряда: закреплённые, распорка, видимые, распорка.
 *
 * Распорка — одна ячейка на весь пропущенный кусок (colSpan). Ширины
 * колонок лежат в <colgroup>, поэтому пропущенные всё равно занимают
 * своё место, и видимые не съезжают влево на пустоту.
 *
 * Общая для шапки, строк и черновика: ряды разные, а раскладка одна,
 * и разъехаться им друг с другом нельзя.
 */
function columnCells(
  ordered: Field[],
  shown: ColumnWindow,
  render: (column: Field, index: number) => ReactNode,
) {
  return (
    <>
      {ordered.slice(0, shown.pinned).map((column, index) => render(column, index))}
      {shown.before > 0 && <ColSpacer span={shown.before} />}
      {ordered
        .slice(shown.from, shown.to)
        .map((column, index) => render(column, shown.from + index))}
      {shown.after > 0 && <ColSpacer span={shown.after} />}
    </>
  );
}

/**
 * Распорка вместо колонок за краем экрана. Границей снизу — как
 * у обычной ячейки: иначе линия строки прерывалась бы на её месте.
 */
function ColSpacer({ span }: { span: number }) {
  return <td aria-hidden colSpan={span} className={`${cellBase} p-0`} />;
}

function Spacer({ height, span }: { height: number; span: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={span} className="p-0" style={{ height }} />
    </tr>
  );
}

/** Отступ и шеврон узла дерева — в первой колонке строки. */
function TreeHandle({
  guid,
  tree,
}: {
  guid: string;
  tree: {
    meta: ReadonlyMap<string, TreeMeta>;
    expanded: ReadonlySet<string>;
    onToggle: (guid: string) => void;
  };
}) {
  const { t } = useTranslation();
  const info = tree.meta.get(guid);
  const open = tree.expanded.has(guid);

  return (
    <>
      {info && info.depth > 0 && (
        <span aria-hidden className="shrink-0" style={{ width: info.depth * 16 }} />
      )}

      {info?.hasChild ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={t(open ? "tree.collapse" : "tree.expand")}
          title={t(open ? "tree.collapse" : "tree.expand")}
          onClick={(event) => {
            // Шеврон раскрывает узел, а не ячейку под ним.
            event.stopPropagation();
            tree.onToggle(guid);
          }}
          className="mr-0.5 grid size-5 shrink-0 place-items-center rounded text-fg-muted transition-colors hover:bg-surface-active hover:text-fg"
        >
          <Icon as={open ? ChevronDownIcon : ChevronRightIcon} size={14} />
        </button>
      ) : (
        /* Распорка вместо шеврона: значения одной глубины — в столбик. */
        <span aria-hidden className="mr-0.5 size-5 shrink-0" />
      )}
    </>
  );
}

/**
 * Скелетон таблицы.
 *
 * Геометрия та же, что у настоящей: те же ширины колонок, та же высота
 * строки, та же липкая шапка. Поэтому в момент, когда приедут данные,
 * ничего не прыгает — плашки просто заменяются текстом.
 *
 * Слово «Загрузка…» посреди пустого экрана не говорит ни сколько ждать,
 * ни что появится; полосы говорят и то, и другое.
 */
export function GridSkeleton({ columns = 5, rows = 14 }: { columns?: number; rows?: number }) {
  // Разная длина плашек: одинаковые читаются как разметка, а не как текст.
  const widths = [70, 45, 60, 85, 55, 75];

  return (
    <div className="min-h-0 flex-1 overflow-hidden px-6" aria-hidden>
      <table className="w-full min-w-max table-fixed border-separate border-spacing-0">
        <colgroup>
          <col style={{ width: SELECT_WIDTH }} />
          {Array.from({ length: columns }, (_, index) => (
            <col key={index} style={{ width: index === 0 ? FIRST_WIDTH : WIDTH }} />
          ))}
          <col />
          <col style={{ width: PIN_WIDTH }} />
        </colgroup>

        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th className={`${pinCell} ${selectCol} z-30`} />
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} className={cell}>
                <SkeletonBar width={widths[index % widths.length]! - 15} />
              </th>
            ))}
            <th className={cell} />
            <th className={`${pinCell} ${pinRight} z-30`} />
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              <td className={`${pinCell} ${selectCol}`} />
              {Array.from({ length: columns }, (_, index) => (
                <td key={index} className={cell}>
                  <SkeletonBar width={widths[(row + index) % widths.length]!} />
                </td>
              ))}
              <td className={cell} />
              <td className={`${pinCell} ${pinRight} bg-surface`} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonBar({ width }: { width: number }) {
  return <div className="h-3 rounded-sm bg-surface-active" style={{ width: `${width}%` }} />;
}

function HeaderCell({
  column,
  language,
  sorts,
  left,
  lastPinned,
  last,
  onResize,
  onResetWidth,
  onSort,
  onMenu,
}: {
  column: Field;
  language: string;
  sorts: Sort[];
  /** Отступ слева у закреплённой колонки. undefined — колонка обычная. */
  left?: number | undefined;
  /** Последняя закреплённая: только у неё рисуется граница-тень. */
  lastPinned?: boolean;
  /**
   * Последняя колонка таблицы: ей одной не задана ширина, и она
   * забирает свободное место. Пола нет — при узкой таблице она стала бы
   * шириной по своей подписи, то есть уже соседей.
   */
  last?: boolean;
  /** Начать перетаскивание правого края. Не задан — колонка не тянется. */
  onResize?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
  /** Вернуть исходную ширину: двойной щелчок по ручке. */
  onResetWidth?: (() => void) | undefined;
  /** Сортировать по колонке — клик, когда меню колонки нет. */
  onSort?: ((field: string) => void) | undefined;
  /** Меню колонки. Есть — клик по заголовку открывает его. */
  onMenu?: ((element: HTMLElement) => void) | undefined;
}) {
  const { t } = useTranslation();
  const active = sorts.find((sort) => sort.field === column.slug);

  /*
   * Заголовок целиком — кнопка меню, как `th` прототипа: сортировка,
   * фильтр и настройка поля в одном месте, без отдельной «…» по
   * наведению. Меню нет (таблица только читается) — клик сортирует;
   * нет и сортировки (дерево) — заголовок просто подпись.
   */
  const action = onMenu
    ? (element: HTMLElement) => onMenu(element)
    : onSort
      ? () => onSort(column.slug)
      : undefined;

  const title = (
    <>
      <Icon as={fieldIcon(column.type)} size={14} className="text-fg-subtle" />
      {/* Подсказка — слаг: подпись и так написана в заголовке, а слаг
          это то имя, которым поле зовут в API, фильтрах и формулах. */}
      <Tooltip label={column.slug}>
        <span className="truncate">{localized(column.labels, language, column.label)}</span>
      </Tooltip>

      {/* Стрелка только у сортированной колонки, у правого края, как
          `.sort-ind`: значок «можно сортировать» на каждом заголовке —
          шум в плотной шапке. */}
      {active && (
        <Icon
          as={active.direction === "asc" ? ArrowUpIcon : ArrowDownIcon}
          size={14}
          className="ml-auto text-accent-text"
        />
      )}
    </>
  );

  return (
    <th
      style={left === undefined ? undefined : { left }}
      /* z-30, а не 20: шапка целиком липкая сверху, и закреплённая
         ячейка обязана оказаться выше проезжающих под ней соседей. */
      className={`${cell} group/head relative border-r text-left font-normal ${
        action ? "transition-colors hover:bg-surface-hover" : ""
      } ${
        left === undefined
          ? ""
          : `sticky z-30 bg-surface ${lastPinned ? "shadow-[1px_0_0_0_var(--color-border)]" : ""}`
      }`}
    >
      {/*
        Пол последней колонки задаётся здесь, а не в colgroup: у таблицы
        с table-fixed ширина колонки от содержимого не зависит, но
        min-w-max самой таблицы считает как раз по содержимому — и
        распорка в заголовке до него доходит.
      */}
      <span className={`flex h-full items-center ${last ? "min-w-[164px]" : "min-w-0"}`}>
        {action ? (
          <button
            type="button"
            onClick={(event) => action(event.currentTarget)}
            {...(onMenu ? { "aria-haspopup": "menu" as const } : {})}
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-fg-muted"
          >
            {title}
          </button>
        ) : (
          <span className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-fg-muted">
            {title}
          </span>
        )}
      </span>

      {/* Ручка ширины — на правом краю заголовка, видна по наведению:
          полоса во всю высоту читается как граница колонки и спорит
          с разделителями таблицы. */}
      {onResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("column.resize")}
          onPointerDown={onResize}
          onDoubleClick={onResetWidth}
          className="group/resize absolute top-0 right-0 z-10 flex h-full w-1.5 cursor-col-resize items-center justify-center"
        >
          <span className="h-4 w-1 rounded-full bg-border-strong opacity-0 transition-opacity group-hover/head:opacity-60 group-hover/resize:opacity-100" />
        </div>
      )}
    </th>
  );
}

/** Первичный ключ в ucode — guid. Индекс только на случай его отсутствия. */
function rowKey(row: Item, index = 0): string {
  return typeof row.guid === "string" && row.guid ? row.guid : String(index);
}
