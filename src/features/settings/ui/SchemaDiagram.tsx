import { useMemo } from "react";
import { CodeXmlIcon, CopyIcon, LinkIcon, LockIcon, Table2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage, toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useSchemaMap } from "../api/schema-map";
import {
  BOX_WIDTH,
  HEAD_HEIGHT,
  PRIMARY_KEY,
  ROW_HEIGHT,
  anchorY,
  layoutSchema,
  toDbml,
  type Box,
  type SchemaMap,
} from "../model/schema-map";
import { CodeCard, OUTLINE } from "./parts";

/**
 * Схема базы картинкой и текстом — вкладка раздела «База данных»,
 * как в прототипе: слева DBML только для чтения, справа таблицы
 * карточками и связи линиями от поля-ссылки к ключу.
 *
 * Только смотреть. Двигать карточки и заводить связи — дело
 * конструктора таблицы; второй редактор схемы рядом с ним
 * расходился бы с первым на каждой правке. Нужно двигать — DBML
 * копируется и открывается в dbdiagram.io.
 */
export function SchemaDiagram() {
  const { t } = useTranslation();
  const { map, isLoading, error } = useSchemaMap();
  const dbml = useMemo(() => (map ? toDbml(map) : ""), [map]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-6">
      {/* `.dx-bar` прототипа: синие плашки со счётом, справа — копирование. */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <Chip color="blue">
          <span className="flex items-center gap-1">
            <Icon as={Table2Icon} size={13} />
            {t("database.tables", { count: map.tables.length })}
          </span>
        </Chip>
        <Chip color="blue">
          <span className="flex items-center gap-1">
            <Icon as={LinkIcon} size={13} />
            {t("database.links", { count: map.links.length })}
          </span>
        </Chip>

        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          onClick={() => {
            void navigator.clipboard.writeText(dbml);
            toast.success(t("database.dbmlCopied"));
          }}
        >
          <Icon as={CopyIcon} size={14} />
          {t("database.copyDbml")}
        </Button>
      </div>

      {/* `.dx-dia`: DBML 320px слева, холст справа, между ними 14px. */}
      {/* Высота — оставшаяся у раздела, потолки прототипа (600 и 640px)
          поверх: раздел не прокручивается, см. TableBrowser. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3.5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CodeCard
          className="hidden max-h-[min(100%,600px)] self-start lg:flex"
          title={
            <>
              <Icon as={CodeXmlIcon} size={14} />
              DBML
              <span className="font-mono font-medium tracking-normal normal-case">schema.dbml</span>
            </>
          }
          actions={
            <span className="flex items-center gap-1 text-[11.5px] font-medium tracking-normal text-fg-subtle normal-case">
              <Icon as={LockIcon} size={12} />
              {t("database.readOnly")}
            </span>
          }
          code={dbml}
        />

        <Canvas map={map} />
      </div>
    </div>
  );
}

function Canvas({ map }: { map: SchemaMap }) {
  const { i18n } = useTranslation();
  const layout = useMemo(() => layoutSchema(map), [map]);
  const bySlug = useMemo(() => new Map(map.tables.map((table) => [table.slug, table])), [map]);
  const linked = useMemo(() => new Set(map.links.map((link) => `${link.from}.${link.field}`)), [map]);

  /**
   * Линия от поля-ссылки к ключу. Карточки разных столбцов соединяются
   * между ближними краями; в одном столбце и ссылка таблицы на саму
   * себя — петлёй справа, иначе линия прошла бы сквозь карточки.
   */
  const path = (from: Box, fromY: number, to: Box, toY: number) => {
    if (from.x === to.x) {
      const x = from.x + BOX_WIDTH;
      return `M${x} ${fromY} C${x + 40} ${fromY} ${x + 40} ${toY} ${x} ${toY}`;
    }

    const right = to.x > from.x;
    const x1 = right ? from.x + BOX_WIDTH : from.x;
    const x2 = right ? to.x : to.x + BOX_WIDTH;
    const bend = Math.max(36, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);

    return `M${x1} ${fromY} C${x1 + bend} ${fromY} ${x2 - bend} ${toY} ${x2} ${toY}`;
  };

  return (
    /* `.dx-canvas`: мягкая подложка в точку, 640px высотой. Точки — тот
       же токен, что у рамок полей: видны, но не спорят с карточками. */
    <div
      className={`h-[min(100%,640px)] min-h-0 overflow-auto bg-surface-soft bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[18px_18px] ${OUTLINE}`}
    >
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0" aria-hidden>
          {map.links.map((link, index) => {
            const from = layout.boxes.get(link.from);
            const to = layout.boxes.get(link.to);
            const fromTable = bySlug.get(link.from);
            const toTable = bySlug.get(link.to);
            if (!from || !to || !fromTable || !toTable) return null;

            return (
              <path
                key={index}
                d={path(from, anchorY(from, fromTable, link.field), to, anchorY(to, toTable, PRIMARY_KEY))}
                /* Пунктир акцентом, как у прототипа: связь — не граница. */
                className="fill-none stroke-accent opacity-70"
                strokeWidth={1.3}
                strokeDasharray="4 3"
              />
            );
          })}
        </svg>

        {map.tables.map((table) => {
          const box = layout.boxes.get(table.slug);
          if (!box) return null;

          return (
            /* `.dx-ent`: белая карточка с синей шапкой. */
            <div
              key={table.slug}
              className="absolute overflow-hidden rounded-[7px] bg-surface text-xs shadow-raised ring-1 ring-border"
              style={{ left: box.x, top: box.y, width: BOX_WIDTH, height: box.height }}
            >
              <div
                className="flex items-center justify-between gap-2 bg-accent-solid px-2.25 text-[12.5px] font-semibold text-accent-fg"
                style={{ height: HEAD_HEIGHT }}
                title={table.label}
              >
                <span className="truncate">{table.slug}</span>
                {table.rows !== null && (
                  <small className="shrink-0 text-[11px] font-medium opacity-85">
                    {table.rows.toLocaleString(i18n.language)}
                  </small>
                )}
              </div>

              {table.fields.map((field) => {
                const key = field.slug === PRIMARY_KEY;
                const ref = linked.has(`${table.slug}.${field.slug}`);

                return (
                  <div
                    key={field.slug}
                    className="flex items-center justify-between gap-2 border-t border-border px-2.25"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span
                      className={`min-w-0 truncate ${key ? "font-semibold text-fg" : ref ? "text-accent-text" : "text-fg"}`}
                    >
                      {field.slug}
                    </span>
                    <i className="shrink-0 font-mono text-[10.5px] text-fg-subtle not-italic">
                      {key ? "pk · " : ref ? "fk · " : ""}
                      {field.type.toLowerCase()}
                    </i>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
