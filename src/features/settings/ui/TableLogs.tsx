import { useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Cell, useItems, type Item } from "@/features/item";
import { localized, useTableSchema, type Field } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import type { TranslationKey } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import type { ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import { relativeTime } from "../model/time";
import {
  CAPS_LABEL,
  CodeCard,
  LogEmpty,
  LogLayout,
  Pager,
  StatusPill,
  formatDateTime,
} from "./parts";

/**
 * Журналы из таблиц папки «Интеграции» проекта: входящие вебхуки
 * (`int_webhook_events`) и вызовы инструментов AI-ассистента
 * (`int_ai_audit`). Это не настройки, а то, что случилось, — поэтому
 * они в «Логах» рядом с изменениями и функциями, а не своим разделом.
 *
 * Пишут их функции и сервисы, не люди: здесь только чтение. Строка —
 * как у журнала изменений: метка, что произошло, давно ли, чем
 * кончилось; раскрытая — поля записи и сырой JSON вкладками.
 *
 * Отбора нет, кроме вида журнала: строк единицы и десятки, а фильтр
 * по дате у get-list — свой формат условий ($gte/$lte), который
 * заводить ради двух журналов рано. ponytail: понадобится — Period
 * из parts и `filters` у useItems.
 */
type Outcome = { ok: boolean; tone: ChipColor; label: string };

export type TableLogConfig = {
  table: string;
  hintKey: TranslationKey;
  /** Поле-метка слева: источник вебхука. Нет — без метки. */
  badge?: string;
  /** Что произошло — текст строки. */
  title: (row: Item) => string;
  /** Чем кончилось — пилюля справа. Нет — без пилюли. */
  outcome: (row: Item, t: (key: TranslationKey) => string) => Outcome | null;
  /** Поля вкладки «Общее», по порядку. */
  facts: string[];
  /** JSON-поля — каждое своей вкладкой. */
  json: string[];
};

const WEBHOOK_TONES: Record<string, ChipColor> = {
  processed: "green",
  failed: "red",
  ignored: "yellow",
  received: "gray",
};

export const WEBHOOK_LOG: TableLogConfig = {
  table: "int_webhook_events",
  hintKey: "logs.webhooksHint",
  badge: "source",
  title: (row) => text(row.dedup_key),
  outcome: (row, t) => {
    const status = first(row.status);
    if (!status) return null;
    const key = `logs.webhook.${status}` as TranslationKey;
    return {
      ok: status !== "failed",
      tone: WEBHOOK_TONES[status] ?? "gray",
      label: WEBHOOK_TONES[status] ? t(key) : status,
    };
  },
  facts: ["source", "status", "processed_at", "error"],
  json: ["payload"],
};

export const AI_LOG: TableLogConfig = {
  table: "int_ai_audit",
  hintKey: "logs.aiHint",
  title: (row) => [text(row.tool_name), text(row.summary)].filter(Boolean).join(" · "),
  /* Исход — по трём флажкам: ошибка, выполнено, только предложено.
     Предложенное и не выполненное — не провал: человек не подтвердил. */
  outcome: (row, t) =>
    text(row.error) || (row.ok === false && row.executed === true)
      ? { ok: false, tone: "red", label: t("logs.ai.failed") }
      : row.executed === true
        ? { ok: true, tone: "green", label: t("logs.ai.executed") }
        : row.proposed === true
          ? { ok: true, tone: "gray", label: t("logs.ai.proposed") }
          : null,
  facts: [
    "employees_id",
    "int_ai_conversations_id",
    "risk",
    "proposed",
    "executed",
    "ok",
    "summary",
    "error",
  ],
  json: ["input"],
};

const PAGE = 20;

export function TableLog({ config, kindField }: { config: TableLogConfig; kindField: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { current: language } = useDataLanguages();
  const { schema } = useTableSchema(config.table);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE);
  /*
   * Без сортировки — и это и есть «новые сверху»: get-list по умолчанию
   * сортирует `created_at DESC` (object_builder.go:836). Явный
   * `order: {created_at: -1}` роняет запрос — см. docs/backend-notes.md.
   */
  const { page: rows, isLoading, error } = useItems(config.table, { limit, page });

  const [opened, setOpened] = useState("");

  const bySlug = useMemo(
    () => new Map(schema.fields.map((field) => [field.slug, field])),
    [schema.fields],
  );
  const relations = useMemo(
    () => new Map(schema.relations.map((relation) => [relation.id, relation])),
    [schema.relations],
  );
  const badge = config.badge ? bySlug.get(config.badge) : undefined;

  const cell = (field: Field, row: Item) => (
    <Cell
      field={field}
      row={row}
      tableSlug={config.table}
      relations={relations}
      locale={i18n.language}
      language={language}
      wrap
    />
  );

  return (
    <LogLayout hint={t(config.hintKey)} filters={kindField}>
      <div className="min-h-0 flex-1 divide-y divide-border overflow-auto">
        {isLoading && <LogEmpty text={t("common.loading")} />}
        {!isLoading && !rows.rows.length && <LogEmpty text={error ?? t("activity.empty")} />}

        {rows.rows.map((row) => {
          const guid = String(row.guid);
          const open = opened === guid;
          const outcome = config.outcome(row, t);
          const at = text(row.created_at);

          return (
            <div key={guid}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpened(open ? "" : guid)}
                className={`flex w-full cursor-pointer items-center gap-3.5 px-4.5 py-3 text-left transition-colors hover:bg-surface-hover ${
                  open ? "bg-surface-hover" : ""
                }`}
              >
                {badge && <span className="shrink-0">{cell(badge, row)}</span>}

                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                  {config.title(row) || "—"}
                </span>

                <span
                  className="hidden shrink-0 text-[13px] whitespace-nowrap text-fg-subtle sm:inline"
                  title={formatDateTime(at, i18n.language)}
                >
                  {relativeTime(at, i18n.language)}
                </span>

                {outcome && (
                  <StatusPill ok={outcome.ok} tone={outcome.tone}>
                    {outcome.label}
                  </StatusPill>
                )}

                <Icon
                  as={ChevronDownIcon}
                  size={16}
                  className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="animate-page border-t border-border bg-surface-soft">
                  <Details
                    row={row}
                    facts={config.facts.flatMap((slug) => bySlug.get(slug) ?? [])}
                    json={config.json.flatMap((slug) => bySlug.get(slug) ?? [])}
                    label={(field) => localized(field.labels, language, field.label)}
                    cell={cell}
                    at={formatDateTime(at, i18n.language)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Pager
        page={page}
        total={rows.count}
        limit={limit}
        onPage={setPage}
        onLimit={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />
    </LogLayout>
  );
}

/** Раскрытая запись: «Общее» сеткой фактов и JSON-поля вкладками. */
function Details({
  row,
  facts,
  json,
  label,
  cell,
  at,
}: {
  row: Item;
  facts: Field[];
  json: Field[];
  label: (field: Field) => string;
  cell: (field: Field, row: Item) => ReactNode;
  at: string;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("general");
  const raw = json.find((field) => field.slug === tab);
  const code = raw ? pretty(row[raw.slug]) : "";

  return (
    <>
      <div className="flex h-10 border-b border-border px-4">
        <Tabs
          tabs={[
            { id: "general", label: t("activity.general") },
            ...json.map((field) => ({ id: field.slug, label: label(field) })),
          ]}
          activeId={tab}
          onSelect={setTab}
        />
      </div>

      {tab === "general" && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 pt-4.5 pb-5 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className={`mb-1.5 ${CAPS_LABEL}`}>{t("activity.time")}</dt>
            <dd className="text-sm text-fg">{at || "—"}</dd>
          </div>

          {facts.map((field) => (
            <div key={field.slug} className="min-w-0">
              <dt className={`mb-1.5 ${CAPS_LABEL}`}>{label(field)}</dt>
              <dd className="text-sm break-words text-fg">{cell(field, row)}</dd>
            </div>
          ))}
        </dl>
      )}

      {raw && (
        <div className="p-4.5">
          {code ? (
            <CodeCard
              title={label(raw)}
              code={code}
              className="max-h-105 bg-surface"
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(code);
                    toast.success(t("cell.copied"));
                  }}
                >
                  <Icon as={CopyIcon} size={13} />
                  {t("cell.copy")}
                </Button>
              }
            />
          ) : (
            <p className="text-sm text-fg-subtle">{t("activity.noPayload")}</p>
          )}
        </div>
      )}
    </>
  );
}

/** JSON-поле строкой с отступами. Строка внутри — тоже JSON, если разбирается. */
function pretty(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** PICK_LIST приходит массивом из одного значения. */
function first(value: unknown): string {
  return Array.isArray(value) ? text(value[0]) : text(value);
}
