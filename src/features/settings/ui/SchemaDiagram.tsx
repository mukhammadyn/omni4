import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CopyIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  LinkIcon,
  Maximize2Icon,
  MaximizeIcon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  NetworkIcon,
  SearchIcon,
  SplineIcon,
  Table2Icon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/shared/lib/i18n";
import { errorMessage, toast } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Tabs } from "@/shared/ui/tabs";
import { ToolButton } from "@/shared/ui/tool-button";
import { useSchemaMap } from "../api/schema-map";
import {
  BOX_WIDTH,
  HEAD_HEIGHT,
  PRIMARY_KEY,
  ROW_HEIGHT,
  SCHEMA_GROUPS,
  anchorY,
  layoutSchema,
  matchesTable,
  pickSchema,
  toDbml,
  type Box,
  type SchemaGroup,
  type SchemaMap,
  type SchemaTable,
} from "../model/schema-map";
import { OUTLINE } from "./parts";

/**
 * Схема базы картинкой — вкладка раздела «База данных»: таблицы
 * карточками, связи линиями от поля-ссылки к ключу.
 *
 * Живая: схема перечитывается после любой правки (api/schema-map),
 * и холст перерисовывается, не теряя ни масштаба, ни сдвинутых карточек.
 *
 * Таблицы разложены по группам — модулям omni4, платформе и «Другим»,
 * заведённым пользователем (model/schema-map, groupOf). Холст
 * двигается и масштабируется, карточку можно перетащить за шапку,
 * наведение подсвечивает связанные таблицы.
 *
 * Перетаскивание — только на этом экране: положение карточек нигде
 * не хранится. Заводить связи и поля — дело конструктора таблицы;
 * второй редактор схемы рядом с ним расходился бы с первым на каждой
 * правке. Нужна схема в другом инструменте — DBML копируется.
 */
export function SchemaDiagram() {
  const { t } = useTranslation();
  const { map, isLoading, error } = useSchemaMap();

  if (isLoading) return <p className="p-4 text-sm text-fg-subtle">{t("common.loading")}</p>;

  if (error || !map) {
    return (
      <p role="alert" className="m-4 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
        {errorMessage(error, "database.schemaFailed") ?? t("database.schemaFailed")}
      </p>
    );
  }

  /* Пусто здесь двусмысленно так же, как в консоли: ошибку SQL шлюз
     выбрасывает (api/sql.ts). Таблиц в проекте ноль не бывает —
     платформенные есть всегда, — так что пустота значит «не прочлось». */
  if (!map.tables.length) {
    return <p className="p-4 text-sm text-fg-muted">{t("database.schemaBlank")}</p>;
  }

  return <Diagram map={map} />;
}

type Mode = "both" | "tables" | "links";

const MODES: [Mode, LucideIcon, TranslationKey][] = [
  ["both", NetworkIcon, "database.modeBoth"],
  ["tables", Table2Icon, "database.modeTables"],
  ["links", SplineIcon, "database.modeLinks"],
];

const ALL = "all";
/** Подвкладка таблиц без подгруппы. Своя метка: папка меню может называться как угодно. */
const DIRECTORIES = "\u0000directories";
const sectionKey = (table: SchemaTable) => table.section ?? DIRECTORIES;

/** Полоса группы: шапка карточки и миникарта. Цвета модулей — те же, что у плиток модулей. */
const GROUP_STYLE: Record<SchemaGroup, { label: TranslationKey; bg: string; fill: string }> = {
  platform: { label: "database.groupPlatform", bg: "bg-chart-other", fill: "fill-chart-other" },
  core: { label: "database.groupCore", bg: "bg-module-org", fill: "fill-module-org" },
  crm: { label: "database.groupCrm", bg: "bg-module-crm", fill: "fill-module-crm" },
  pm: { label: "database.groupPm", bg: "bg-module-pm", fill: "fill-module-pm" },
  hr: { label: "database.groupHr", bg: "bg-module-hrms", fill: "fill-module-hrms" },
  integrations: { label: "database.groupIntegrations", bg: "bg-chart-7", fill: "fill-chart-7" },
  other: { label: "database.groupOther", bg: "bg-chart-4", fill: "fill-chart-4" },
};

function Diagram({ map }: { map: SchemaMap }) {
  const { t } = useTranslation();
  const [group, setGroup] = useState<typeof ALL | SchemaGroup>(ALL);
  const [pickedSection, setSection] = useState(ALL);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("both");
  /* Подсказка — раз на открытие вкладки, а не на каждый новый холст. */
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(timer);
  }, []);
  const needle = query.trim().toLowerCase();
  /*
   * На весь экран — та же диаграмма в модалке, а не вторая: вкладка,
   * поиск и режим остаются, холст пересоздаётся и вписывается
   * в новый размер. Escape слушаем сами: Modal его не ловит.
   */
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const counts = useMemo(() => {
    const out = new Map<SchemaGroup, number>();
    for (const table of map.tables) out.set(table.group, (out.get(table.group) ?? 0) + 1);
    return out;
  }, [map]);

  /*
   * Подгруппы открытой группы со счётом: по алфавиту, справочники
   * в конце. Одна подгруппа на всю группу — не выбор, полосы нет.
   */
  const sections = useMemo(() => {
    if (group === ALL) return [];
    const out = new Map<string, number>();
    for (const table of map.tables) {
      if (table.group === group) out.set(sectionKey(table), (out.get(sectionKey(table)) ?? 0) + 1);
    }
    const list = [...out].sort(([a], [b]) =>
      a === DIRECTORIES ? 1 : b === DIRECTORIES ? -1 : a.localeCompare(b),
    );
    return list.length > 1 ? list : [];
  }, [map, group]);

  /* Подгруппа могла исчезнуть с перечитанной схемой — тогда вся группа. */
  const section = sections.some(([key]) => key === pickedSection) ? pickedSection : ALL;

  const shown = useMemo(
    () =>
      pickSchema(
        map,
        (table) =>
          (group === ALL || table.group === group) &&
          (section === ALL || sectionKey(table) === section) &&
          (!needle || matchesTable(table, needle)),
      ),
    [map, group, section, needle],
  );

  const dbml = useMemo(() => toDbml(map), [map]);

  /*
   * Управление — плавающими панелями поверх холста, как в редакторах
   * схем: холсту остаётся вся высота. Панели — соседи холста, а не его
   * дети: холст пересоздаётся на каждую группу и каждый символ поиска,
   * и поле поиска внутри него теряло бы фокус. Заодно колесо над
   * панелью не масштабирует холст, а нажатие не двигает его.
   */
  const body = (
    <div className={`relative flex min-h-105 flex-1 overflow-hidden ${OUTLINE} ${full ? "" : "mb-6"}`}>
      {shown.tables.length ? (
        /* Новая группа или поиск — новый холст: раскладка своя, и он
           вписывается заново. Перечитанная схема холст не пересоздаёт. */
        <Canvas
          key={`${group}\u0000${section}\u0000${needle}`}
          map={shown}
          mode={mode}
          needle={needle}
          hint={hint}
          top={sections.length ? SECTIONS_INSET : TABS_INSET}
        />
      ) : (
        <p className="m-auto text-sm text-fg-muted">{t("database.nothingFound")}</p>
      )}

      {/* В одну строку: вкладкам не хватает места — они прокручиваются
          вбок, а не переносятся третьим ярусом поверх карточек. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className={`pointer-events-auto flex min-w-0 flex-col ${PANEL}`}>
          {/* Группа без единой таблицы не показывается: пустая вкладка — обещание. */}
          {/* Высота ряда — PANEL_ROW, как у панели справа: вкладки
              растягиваются по ней, черта активной ложится на низ ряда. */}
          <div className={`flex px-1.5 ${PANEL_ROW}`}>
            <Tabs
              tabs={[
                { id: ALL, label: `${t("database.groupAll")} · ${map.tables.length}` },
                ...SCHEMA_GROUPS.filter((id) => counts.get(id)).map((id) => ({
                  id,
                  label: `${t(GROUP_STYLE[id].label)} · ${counts.get(id)}`,
                })),
              ]}
              activeId={group}
              onSelect={(id) => {
                setGroup(id as typeof ALL | SchemaGroup);
                setSection(ALL);
              }}
            />
          </div>

          {sections.length > 0 && (
            <div className="border-t border-border p-1.5">
              <Tabs
                variant="segment"
                tabs={[
                  { id: ALL, label: `${t("database.groupAll")} · ${counts.get(group as SchemaGroup)}` },
                  ...sections.map(([key, count]) => ({
                    id: key,
                    label: `${key === DIRECTORIES ? t("database.sectionDirectories") : key} · ${count}`,
                  })),
                ]}
                activeId={section}
                onSelect={setSection}
              />
            </div>
          )}
        </div>

        <div className={`pointer-events-auto flex shrink-0 items-center gap-0.5 px-1.5 ${PANEL_ROW} ${PANEL}`}>
          <div className="relative mr-1 w-44">
            <Icon
              as={SearchIcon}
              size={14}
              className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("database.schemaSearch")}
              aria-label={t("database.schemaSearch")}
              className="h-7 pl-7 text-sm"
            />
          </div>

          {/* Режимы — значками с подсказкой: подписью они не помещались
              в одну строку со вкладками. Выбранный — с подложкой. */}
          {MODES.map(([id, icon, label]) => (
            <ToolButton key={id} icon={icon} label={t(label)} open={mode === id} onClick={() => setMode(id)} />
          ))}
          <span className="mx-1 h-4 w-px bg-border" />

          <ToolButton
            icon={CopyIcon}
            label={t("database.copyDbml")}
            onClick={() => {
              void navigator.clipboard.writeText(dbml);
              toast.success(t("database.dbmlCopied"));
            }}
          />
          <ToolButton
            icon={full ? Minimize2Icon : Maximize2Icon}
            label={t(full ? "database.exitFullscreen" : "database.fullscreen")}
            onClick={() => setFull(!full)}
          />
        </div>
      </div>
    </div>
  );

  if (!full) return body;

  return (
    <Modal onClose={() => setFull(false)} className="flex p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("database.tabDiagram")}
        className="flex min-w-0 flex-1 flex-col rounded-xl bg-surface shadow-modal"
      >
        {body}
      </div>
    </Modal>
  );
}

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type View = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const FIT_PAD = 40;
/** Отступ сверху под панель вкладок: без подвкладок и с ними. */
const TABS_INSET = 72;
const SECTIONS_INSET = 112;

/** Плавающая панель над холстом. */
const PANEL = "rounded-lg bg-surface shadow-raised ring-1 ring-border";
/** Верхние панели — одной высоты: ряд вкладок и строка поиска стоят рядом. */
const PANEL_ROW = "h-10";

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Масштаб с неподвижной точкой (x, y) экрана — под курсором или в центре. */
function zoomAt(view: View, factor: number, x: number, y: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: x - (x - view.x) * k, y: y - (y - view.y) * k };
}

function boundsOf(boxes: Iterable<Box>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + BOX_WIDTH);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return minX === Infinity ? { x: 0, y: 0, w: 1, h: 1 } : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Всё в кадре, но не крупнее 100%: три таблицы во весь экран читаются
 * хуже. `top` — отступ под панель вкладок, чтобы она не закрывала карточки.
 */
function fitView(boxes: Iterable<Box>, size: Size, top: number): View {
  const bounds = boundsOf(boxes);
  const zoom = clampZoom(
    Math.min((size.w - FIT_PAD * 2) / bounds.w, (size.h - top - FIT_PAD) / bounds.h, 1),
  );
  return {
    zoom,
    x: (size.w - bounds.w * zoom) / 2 - bounds.x * zoom,
    y: top - bounds.y * zoom,
  };
}

/**
 * Линия от поля-ссылки к ключу. Карточки, далёкие по горизонтали,
 * соединяются между ближними краями; стоящие друг над другом и ссылка
 * таблицы на саму себя — петлёй справа, иначе линия прошла бы сквозь
 * карточки.
 */
function linkPath(from: Box, fromY: number, to: Box, toY: number) {
  if (Math.abs(from.x - to.x) < BOX_WIDTH) {
    const x1 = from.x + BOX_WIDTH;
    const x2 = to.x + BOX_WIDTH;
    const bend = Math.max(x1, x2) + 40;
    return `M${x1} ${fromY} C${bend} ${fromY} ${bend} ${toY} ${x2} ${toY}`;
  }

  const right = to.x > from.x;
  const x1 = right ? from.x + BOX_WIDTH : from.x;
  const x2 = right ? to.x : to.x + BOX_WIDTH;
  const bend = Math.max(36, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);

  return `M${x1} ${fromY} C${x1 + bend} ${fromY} ${x2 - bend} ${toY} ${x2} ${toY}`;
}

type Gesture =
  | { kind: "pan"; from: Point; start: View }
  | { kind: "drag"; slug: string; from: Point; start: Point; zoom: number };

function Canvas({
  map,
  mode,
  needle,
  hint,
  top,
}: {
  map: SchemaMap;
  mode: Mode;
  needle: string;
  hint: boolean;
  top: number;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const fitted = useRef(false);

  const layout = useMemo(() => layoutSchema(map), [map]);
  /** Перетащенные карточки. Остальные стоят, где их поставила раскладка. */
  const [moved, setMoved] = useState<ReadonlyMap<string, Point>>(new Map());
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);

  const boxes = useMemo(() => {
    const out = new Map<string, Box>();
    for (const [slug, box] of layout.boxes) {
      const at = moved.get(slug);
      out.set(slug, at ? { ...box, ...at } : box);
    }
    return out;
  }, [layout, moved]);

  const bySlug = useMemo(() => new Map(map.tables.map((table) => [table.slug, table])), [map]);

  /** Поля-ссылки по таблицам: один Set на таблицу, чтобы карточка не перерисовывалась зря. */
  const refFields = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const link of map.links) {
      const set = out.get(link.from) ?? new Set<string>();
      set.add(link.field);
      out.set(link.from, set);
    }
    return out;
  }, [map]);

  /** Таблица под курсором и все, с кем она связана. */
  const focus = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const link of map.links) {
      if (link.from === hover || link.to === hover) {
        set.add(link.from);
        set.add(link.to);
      }
    }
    return set;
  }, [hover, map]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /* Вписать один раз, как только известен размер. Перечитанная схема
     кадр не сбрасывает: человек смотрит туда, куда смотрел. */
  useLayoutEffect(() => {
    if (fitted.current || !size.w) return;
    fitted.current = true;
    setView(fitView(layout.boxes.values(), size, top));
  }, [size, layout]);

  /* Колесо — масштаб под курсором. Слушатель свой, не React: у React
     он пассивный, и preventDefault не остановил бы прокрутку страницы. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((current) => zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const from = { x: event.clientX, y: event.clientY };
    const head = (event.target as HTMLElement).closest<HTMLElement>("[data-drag]");
    const box = head?.dataset["drag"] ? boxes.get(head.dataset["drag"]) : undefined;

    gesture.current = box
      ? { kind: "drag", slug: box.slug, from, start: { x: box.x, y: box.y }, zoom: view.zoom }
      : { kind: "pan", from, start: view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.from.x;
    const dy = event.clientY - current.from.y;

    if (current.kind === "pan") {
      setView({ ...current.start, x: current.start.x + dx, y: current.start.y + dy });
    } else {
      setMoved((prev) =>
        new Map(prev).set(current.slug, {
          x: current.start.x + dx / current.zoom,
          y: current.start.y + dy / current.zoom,
        }),
      );
    }
  };

  const endGesture = () => {
    gesture.current = null;
  };

  const zoomCenter = (factor: number) => setView((current) => zoomAt(current, factor, size.w / 2, size.h / 2));

  const bounds = boundsOf(boxes.values());

  return (
    <div
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      /* `.dx-canvas`: мягкая подложка в точку. Точки — тот же токен, что
         у рамок полей: видны, но не спорят с карточками. */
      className="relative flex-1 cursor-grab touch-none overflow-hidden bg-surface-soft bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[18px_18px] select-none active:cursor-grabbing"
      style={{ backgroundPosition: `${view.x}px ${view.y}px` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {mode !== "tables" && (
          <svg
            width={bounds.x + bounds.w + 80}
            height={bounds.y + bounds.h + 80}
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            aria-hidden
          >
            <defs>
              <marker
                id="schema-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
              </marker>
            </defs>

            {map.links.map((link, index) => {
              const from = boxes.get(link.from);
              const to = boxes.get(link.to);
              const fromTable = bySlug.get(link.from);
              const toTable = bySlug.get(link.to);
              if (!from || !to || !fromTable || !toTable) return null;

              const lit = mode === "links" || (focus !== null && (link.from === hover || link.to === hover));
              const faded = focus !== null && !lit;

              return (
                <path
                  key={index}
                  d={linkPath(from, anchorY(from, fromTable, link.field), to, anchorY(to, toTable, PRIMARY_KEY))}
                  markerEnd="url(#schema-arrow)"
                  /* Пунктир акцентом, как у прототипа: связь — не граница.
                     Подсвеченная — сплошная. */
                  className={`fill-none stroke-accent ${lit ? "opacity-100" : faded ? "opacity-10" : "opacity-60"}`}
                  strokeWidth={lit ? 2 : 1.3}
                  strokeDasharray={lit ? undefined : "4 3"}
                />
              );
            })}
          </svg>
        )}

        {map.tables.map((table) => {
          const box = boxes.get(table.slug);
          if (!box) return null;
          const tone = focus ? (focus.has(table.slug) ? "on" : "dim") : mode === "links" ? "dim" : undefined;

          return (
            <TableCard
              key={table.slug}
              table={table}
              x={box.x}
              y={box.y}
              tone={tone}
              refs={refFields.get(table.slug)}
              needle={needle}
              onHover={setHover}
            />
          );
        })}
      </div>

      {hint && (
        <p className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-xs text-fg-muted shadow-raised ring-1 ring-border">
          {t("database.canvasHint")}
        </p>
      )}

      <Minimap
        map={map}
        boxes={boxes}
        view={view}
        size={size}
        hover={hover}
        onJump={(point) =>
          setView((current) => ({
            ...current,
            x: size.w / 2 - point.x * current.zoom,
            y: size.h / 2 - point.y * current.zoom,
          }))
        }
      />

      {/* `onPointerDown` не всплывает к холсту: нажатие на кнопку — не панорама. */}
      <div
        onPointerDown={(event) => event.stopPropagation()}
        className={`absolute right-3 bottom-3 flex items-center gap-0.5 p-1 ${PANEL}`}
      >
        <span className="hidden border-r border-border pr-2 pl-1.5 text-xs whitespace-nowrap text-fg-muted sm:inline">
          {t("database.tables", { count: map.tables.length })} · {t("database.links", { count: map.links.length })}
        </span>
        <ToolButton label={t("database.zoomOut")} icon={MinusIcon} onClick={() => zoomCenter(1 / 1.2)} />
        <span className="min-w-12 text-center text-xs text-fg tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <ToolButton label={t("database.zoomIn")} icon={PlusIcon} onClick={() => zoomCenter(1.2)} />
        <ToolButton
          label={t("database.zoomReset")}
          icon={RotateCcwIcon}
          onClick={() => setView({ zoom: 1, x: FIT_PAD - bounds.x, y: top - bounds.y })}
        />
        <ToolButton
          label={t("database.zoomFit")}
          icon={MaximizeIcon}
          onClick={() => setView(fitView(boxes.values(), size, top))}
        />
        <ToolButton
          label={t("database.autoLayout")}
          icon={LayoutGridIcon}
          onClick={() => {
            setMoved(new Map());
            setView(fitView(layout.boxes.values(), size, top));
          }}
        />
      </div>
    </div>
  );
}

/**
 * Цвет типа поля — по семейству, а не по каждому из полусотни типов
 * ucode: ссылка, число, дата, текст, флажок. Остальное — приглушённым.
 */
const TYPE_TONES: [RegExp, string][] = [
  [/LOOKUP|UUID/, "text-accent-text"],
  [/NUMBER|FLOAT|MONEY|INCREMENT|FORMULA|PERCENT/, "text-code-number"],
  [/DATE|TIME/, "text-code-keyword"],
  [/LINE|TEXT|EMAIL|PHONE|PASSWORD/, "text-code-string"],
  [/CHECKBOX|SWITCH/, "text-code-comment"],
];

const typeTone = (type: string) =>
  TYPE_TONES.find(([pattern]) => pattern.test(type.toUpperCase()))?.[1] ?? "text-fg-subtle";

/**
 * Карточка таблицы. memo — ради перетаскивания и панорамы: на каждый
 * сдвиг мыши перерисовывается только та карточка, что двигается.
 */
const TableCard = memo(function TableCard({
  table,
  x,
  y,
  tone,
  refs,
  needle,
  onHover,
}: {
  table: SchemaTable;
  x: number;
  y: number;
  tone: "on" | "dim" | undefined;
  refs: Set<string> | undefined;
  needle: string;
  onHover: (slug: string | null) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div
      onPointerEnter={() => onHover(table.slug)}
      onPointerLeave={() => onHover(null)}
      className={`absolute overflow-hidden rounded-[7px] bg-surface text-xs shadow-raised transition-opacity ${
        tone === "on" ? "ring-2 ring-accent" : "ring-1 ring-border"
      } ${tone === "dim" ? "opacity-25" : ""}`}
      style={{ left: x, top: y, width: BOX_WIDTH }}
    >
      <div
        data-drag={table.slug}
        className="relative flex cursor-move items-center gap-2 bg-surface-soft pr-2.25 pl-3 font-semibold text-fg"
        style={{ height: HEAD_HEIGHT }}
        title={table.label}
      >
        <span className={`absolute inset-y-0 left-0 w-0.75 ${GROUP_STYLE[table.group].bg}`} />
        <span className="truncate text-[12.5px]">{table.slug}</span>
        {table.rows !== null && (
          <small className="ml-auto shrink-0 rounded bg-surface-hover px-1.5 text-[10.5px] font-medium text-fg-subtle">
            {table.rows.toLocaleString(i18n.language)}
          </small>
        )}
      </div>

      {table.fields.map((field) => {
        const key = field.slug === PRIMARY_KEY;
        const ref = refs?.has(field.slug) ?? false;
        const hit = needle !== "" && field.slug.toLowerCase().includes(needle);

        return (
          <div
            key={field.slug}
            className={`flex items-center gap-1.5 border-t border-border px-2.25 ${hit ? "bg-accent-subtle" : ""}`}
            style={{ height: ROW_HEIGHT }}
          >
            <span className="grid w-3 shrink-0 place-items-center">
              {key ? (
                <Icon as={KeyRoundIcon} size={11} className="text-warning" />
              ) : ref ? (
                <Icon as={LinkIcon} size={11} className="text-accent-text" />
              ) : null}
            </span>
            <span
              title={field.slug}
              className={`min-w-0 flex-1 truncate ${key ? "font-semibold text-fg" : ref ? "text-accent-text" : "text-fg"}`}
            >
              {field.slug}
            </span>
            {!key && field.required && (
              <span
                title={t("database.flagRequired")}
                className="shrink-0 rounded-sm bg-danger-subtle px-1 text-[9px] font-semibold text-danger"
              >
                NN
              </span>
            )}
            {!key && field.unique && (
              <span
                title={t("database.flagUnique")}
                className="shrink-0 rounded-sm bg-chip-purple-bg px-1 text-[9px] font-semibold text-chip-purple-fg"
              >
                UQ
              </span>
            )}
            <i className={`shrink-0 font-mono text-[10.5px] not-italic ${typeTone(field.type)}`}>
              {field.type.toLowerCase()}
            </i>
          </div>
        );
      })}
    </div>
  );
});

const MINIMAP_W = 180;
const MINIMAP_H = 120;

/** Миникарта: все карточки цветом группы и рамка того, что сейчас в кадре. Нажатие — перейти туда. */
function Minimap({
  map,
  boxes,
  view,
  size,
  hover,
  onJump,
}: {
  map: SchemaMap;
  boxes: Map<string, Box>;
  view: View;
  size: Size;
  hover: string | null;
  onJump: (point: Point) => void;
}) {
  /* Кадр — тоже коробка: границы миникарты охватывают и его, иначе
     рамка уезжает за край, стоит отодвинуть холст от таблиц. */
  const frame = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const content = boundsOf(boxes.values());
  const left = Math.min(content.x, frame.x);
  const top = Math.min(content.y, frame.y);
  const bounds = {
    x: left,
    y: top,
    w: Math.max(content.x + content.w, frame.x + frame.w) - left,
    h: Math.max(content.y + content.h, frame.y + frame.h) - top,
  };
  const scale = Math.min(MINIMAP_W / bounds.w, MINIMAP_H / bounds.h);

  return (
    <svg
      width={MINIMAP_W}
      height={MINIMAP_H}
      onPointerDown={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onJump({
          x: bounds.x + (event.clientX - rect.left) / scale,
          y: bounds.y + (event.clientY - rect.top) / scale,
        });
      }}
      className="absolute bottom-3 left-3 hidden cursor-pointer rounded-lg bg-surface shadow-raised ring-1 ring-border md:block"
      aria-hidden
    >
      {map.tables.map((table) => {
        const box = boxes.get(table.slug);
        if (!box) return null;
        return (
          <rect
            key={table.slug}
            x={(box.x - bounds.x) * scale}
            y={(box.y - bounds.y) * scale}
            width={BOX_WIDTH * scale}
            height={box.height * scale}
            rx={1}
            className={hover === table.slug ? "fill-accent" : GROUP_STYLE[table.group].fill}
            opacity={hover === table.slug ? 0.9 : 0.4}
          />
        );
      })}
      <rect
        x={(frame.x - bounds.x) * scale}
        y={(frame.y - bounds.y) * scale}
        width={frame.w * scale}
        height={frame.h * scale}
        rx={2}
        className="fill-accent-subtle stroke-accent"
        strokeWidth={1}
      />
    </svg>
  );
}
