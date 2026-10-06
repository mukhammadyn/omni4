import { useDeferredValue, useState, type ReactNode } from "react";
import { BotIcon, ChevronDownIcon, CopyIcon, DownloadIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Tabs } from "@/shared/ui/tabs";
import {
  ACTIVITY_PAGE,
  NO_FILTERS,
  useActivity,
  useActivityEntry,
  useExportActivity,
  type ActivityEntry,
  type ActivityFilters,
} from "../api/activity";
import { diffEntry, unwrapEntry, type EntryChange } from "../model/activity";
import { relativeTime } from "../model/time";
import { FunctionLogs } from "./FunctionLogs";
import {
  ActionBadge,
  CAPS_LABEL,
  CodeCard,
  LogEmpty,
  LogField,
  LogLayout,
  MethodBadge,
  Pager,
  Period,
  StatusCode,
  formatDateTime,
} from "./parts";
import { TableFilter } from "./TableFilter";
import { AI_LOG, TableLog, WEBHOOK_LOG } from "./TableLogs";
import { Usage } from "./Usage";

/**
 * Логи: кто, когда и что поменял — `#s-logs` прототипа.
 *
 * Запись хранит «было» и «стало», поэтому открытая строка отвечает
 * не только «кто трогал таблицу», но и «что именно в ней стало другим»
 * — ради этого журнал и читают.
 *
 * Отбор по подстроке, а не выбором из списка, как в прототипе: типов
 * действий в базе четыре десятка (`CREATE ITEM`, `UPDATE FIELD`,
 * `DELETE MENU`…), список растёт вместе с ручками бэкенда, и зашитый
 * в код перечень устарел бы молча — так же, как он устарел в старой
 * админке. Сервер и сам сравнивает их через ILIKE.
 *
 * Вид журнала — первое поле отбора («Тип лога»), а не вкладки над
 * заголовком: у выполнения функций (FunctionLogs), расхода лимита
 * (Usage), вебхуков и AI-ассистента (TableLogs) предмет и колонки
 * другие, но рамка та же.
 */
export type LogKind = "changes" | "functions" | "usage" | "webhooks" | "ai";

export function ActivityLog() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<LogKind>("changes");

  const kindField = (
    <LogField label={t("activity.type")}>
      <Dropdown
        value={kind}
        items={[
          { value: "changes", label: t("activity.tabChanges") },
          { value: "functions", label: t("activity.tabFunctions") },
          { value: "usage", label: t("activity.tabUsage") },
          { value: "webhooks", label: t("activity.tabWebhooks") },
          { value: "ai", label: t("activity.tabAi") },
        ]}
        ariaLabel={t("activity.type")}
        onChange={(next) => setKind(next as LogKind)}
      />
    </LogField>
  );

  if (kind === "functions") return <FunctionLogs kindField={kindField} />;
  if (kind === "usage") return <Usage kindField={kindField} />;
  if (kind === "webhooks") return <TableLog key={kind} config={WEBHOOK_LOG} kindField={kindField} />;
  if (kind === "ai") return <TableLog key={kind} config={AI_LOG} kindField={kindField} />;
  return <ChangesLog kindField={kindField} />;
}

function ChangesLog({ kindField }: { kindField: ReactNode }) {
  const { t, i18n } = useTranslation();

  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(ACTIVITY_PAGE);

  /*
   * Текстовые поля отложены, даты — нет: дату вводят целиком и разом,
   * а буквы по одной. Ключ запроса собирается из отложенного значения,
   * поэтому лишних запросов на каждую букву не уходит.
   */
  const deferred = useDeferredValue(filters);
  const { entries, count, isLoading } = useActivity(deferred, page, limit);

  const [opened, setOpened] = useState("");
  const exportExcel = useExportActivity();

  const put = (patch: Partial<ActivityFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <LogLayout
      hint={t("activity.hint")}
      actions={
        /* Выгружается отобранное, а не страница: файл делают, чтобы
           посмотреть шире экрана. Кнопка основная — единственное
           действие в шапке, как и в остальных разделах настроек. */
        <Button
          size="sm"
          disabled={exportExcel.isPending}
          onClick={() => exportExcel.mutate(deferred)}
        >
          <Icon as={DownloadIcon} size={14} />
          {exportExcel.isPending ? t("common.loading") : t("activity.export")}
        </Button>
      }
      filters={
        <>
          {kindField}

          <LogField label={t("activity.action")}>
            <Input
              value={filters.action}
              onChange={(event) => put({ action: event.target.value })}
              placeholder="UPDATE VIEW"
              aria-label={t("activity.action")}
            />
          </LogField>

          <LogField label={t("activity.table")}>
            <TableFilter value={filters.table} onChange={(table) => put({ table })} size="md" />
          </LogField>

          <LogField label={t("activity.user")}>
            <Input
              value={filters.user}
              onChange={(event) => put({ user: event.target.value })}
              aria-label={t("activity.user")}
            />
          </LogField>

          {/* Наш календарь, а не нативное поле: у `<input type="date">`
              свой вид в каждой системе и светлый календарь в тёмной теме. */}
          <LogField label={t("activity.period")} className="w-80">
            <Period
              from={filters.from}
              to={filters.to}
              onChange={(from, to) => put({ from, to })}
            />
          </LogField>

          {/* Кнопка появляется по заполненности, а не по «трогали ли»:
              стёртое поле — это тот же пустой отбор. */}
          {Object.values(filters).some(Boolean) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilters(NO_FILTERS);
                setPage(1);
              }}
            >
              {t("table.clearFilters")}
            </Button>
          )}
        </>
      }
    >
      <div className="min-h-0 flex-1 divide-y divide-border overflow-auto">
        {isLoading && <LogEmpty text={t("common.loading")} />}
        {!isLoading && !entries.length && <LogEmpty text={t("activity.empty")} />}

        {entries.map((entry) => {
          const open = opened === entry.id;

          return (
            <div key={entry.id}>
              {/*
                Строка — кнопка целиком: открывают её и мышью, и с
                клавиатуры. `cursor-pointer` явно — preflight Tailwind v4
                курсор у `<button>` больше не переопределяет.
              */}
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`entry-${entry.id}`}
                onClick={() => setOpened(open ? "" : entry.id)}
                className={`flex w-full cursor-pointer items-center gap-3.5 px-4.5 py-3 text-left transition-colors hover:bg-surface-hover ${
                  open ? "bg-surface-hover" : ""
                }`}
              >
                {/*
                  Метод и адрес — как в прототипе. Правки view, меню
                  и полей пишутся без того и другого (`action_source`
                  у них — имя сущности): тогда слева действие, справа
                  таблица, — строка всё равно отвечает «что сделали».
                */}
                {entry.method ? (
                  <MethodBadge method={entry.method} />
                ) : (
                  <ActionBadge action={entry.action} />
                )}

                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium text-fg"
                  title={entry.url || undefined}
                >
                  {entry.url ||
                    (entry.method
                      ? [entry.action, entry.table].filter(Boolean).join(" · ")
                      : entry.table)}
                </span>

                {/* «Давно ли» в строке, «когда именно» — под курсором
                    и в раскрытой записи. */}
                <span
                  className="hidden shrink-0 text-[13px] whitespace-nowrap text-fg-subtle sm:inline"
                  title={formatDateTime(entry.date, i18n.language)}
                >
                  {relativeTime(entry.date, i18n.language)}
                </span>

                <StatusCode code={entry.statusCode} />

                <Icon
                  as={ChevronDownIcon}
                  size={16}
                  className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {/*
                Подробности под своей строкой, а не поверх списка:
                соседние записи остаются видны, и чтобы посмотреть
                следующую, ничего не надо закрывать.
              */}
              {open && (
                <div
                  id={`entry-${entry.id}`}
                  className="animate-page border-t border-border bg-surface-soft"
                >
                  <EntryDetails summary={entry} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Pager
        page={page}
        total={count}
        limit={limit}
        onPage={setPage}
        onLimit={(next) => {
          setLimit(next);
          // Пятая страница по двадцать — это не пятая по сотне: после
          // смены размера прежний номер указывает в другое место.
          setPage(1);
        }}
      />
    </LogLayout>
  );
}

/**
 * Подробности записи — `.lg-det` прототипа: вкладки «Общее», «Изменения»
 * и сырые поля.
 *
 * «Общее» собрано из строки списка — оно есть сразу, без ожидания.
 * Остальное — из своего запроса записи (`useActivityEntry`).
 *
 * «Изменения» — только разошедшиеся поля, каждое строкой. «Было»
 * и «стало» целиком — два полотна по две сотни строк, отличающиеся
 * номером порядка да одним идентификатором; открывали запись ради
 * этого отличия, а находить его приходилось глазами. Полотна остались
 * своими вкладками — для случая, когда нужно свериться целиком.
 *
 * Пустые поля вкладок не получают: у записи о чтении нет ни «было»,
 * ни «стало», и вкладки с прочерком только мешают.
 */
function EntryDetails({ summary }: { summary: ActivityEntry }) {
  const { t } = useTranslation();
  const { entry, isLoading } = useActivityEntry(summary.id);

  const [tab, setTab] = useState("general");

  const changes = entry ? diffEntry(entry.before, entry.after) : [];

  /*
   * Повторы выброшены, и это не косметика.
   *
   * Шлюз кладёт ОДНО И ТО ЖЕ значение в два поля: `logReq.Response = resp`
   * и `logReq.Current = resp` стоят рядом в каждом обработчике правки
   * (`api/handlers/v2/view.go:294`, `field.go:164`, `relation.go:253`
   * и ещё десяток мест). То есть «Ответ» — это буква в букву «Стало».
   *
   * А «Запрос» у правки — тело запроса, то есть тот же самый объект
   * сущности (`Request: &view`), поэтому он и выглядит как ответ. Это
   * правда о записи, а не ошибка показа: убрать его нельзя, он всё же
   * другой — в ответе заполнены поля, которые проставил сервер.
   *
   * Остаётся первый по порядку, а порядок здесь от важного к служебному.
   */
  const payloads = entry
    ? ([
        ["activity.before", unwrapEntry(entry.before)],
        ["activity.after", unwrapEntry(entry.after)],
        ["activity.request", unwrapEntry(entry.request)],
        ["activity.response", unwrapEntry(entry.response)],
      ] as const).filter(([, value]) => value)
    : [];

  const parts = payloads.filter(
    ([, value], index) => payloads.findIndex(([, other]) => other === value) === index,
  );

  const raw = parts.find(([key]) => key === tab);

  return (
    <>
      <div className="flex h-10 border-b border-border px-4">
        <Tabs
          tabs={[
            { id: "general", label: t("activity.general") },
            ...(changes.length ? [{ id: "changes", label: t("activity.diff") }] : []),
            ...parts.map(([key]) => ({ id: key, label: t(key) })),
          ]}
          activeId={tab}
          onSelect={setTab}
        />
      </div>

      {tab === "general" && <General entry={summary} />}

      {tab === "changes" && (
        <div className="p-4.5">
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {changes.map((change) => (
              <div
                key={change.path}
                className="flex flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0 sm:flex-row sm:gap-3"
              >
                {/* Путь — слева постоянной ширины: список читается
                    колонкой имён, а не лесенкой. */}
                <p className="shrink-0 truncate font-mono text-xs text-fg-muted sm:w-52">
                  {change.path}
                </p>

                <div className="min-w-0 flex-1">
                  <Change change={change} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {raw && (
        <div className="p-4.5">
          <CodeCard
            title={t(raw[0])}
            code={raw[1]}
            className="max-h-105 bg-surface"
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(raw[1]);
                  toast.success(t("cell.copied"));
                }}
              >
                <Icon as={CopyIcon} size={13} />
                {t("cell.copy")}
              </Button>
            }
          />
        </div>
      )}

      {/* Поля есть, а различий нет: правка ничего не изменила (такое
          пишется в журнал), — это ответ, и место ему в «Общем». */}
      {tab === "general" && !isLoading && entry && !changes.length && parts.length > 0 && (
        <p className="px-5 pb-4 text-sm text-fg-subtle">{t("activity.noChanges")}</p>
      )}
      {tab === "general" && !isLoading && entry && !parts.length && (
        <p className="px-5 pb-4 text-sm text-fg-subtle">{t("activity.noPayload")}</p>
      )}
    </>
  );
}

/** Вкладка «Общее» — `.lg-gen` прототипа: сетка подпись — значение. */
function General({ entry }: { entry: ActivityEntry }) {
  const { t, i18n } = useTranslation();
  const at = (value: string) => formatDateTime(value, i18n.language);

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 pt-4.5 pb-5 sm:grid-cols-3">
      {entry.url && (
        <Fact label={t("activity.url")}>
          <span className="break-all">{entry.url}</span>
        </Fact>
      )}

      {entry.method && (
        <Fact label={t("activity.method")}>
          <MethodBadge method={entry.method} />
        </Fact>
      )}

      <Fact label={t("activity.status")}>
        {entry.statusCode || "—"}
        {entry.duration > 0 && (
          <span className="ml-1 text-[13px] text-fg-subtle tabular-nums">({entry.duration}ms)</span>
        )}
      </Fact>

      {/* Начало и конец пишутся не всеми ручками: нет начала — есть
          дата записи, она и есть момент события. */}
      <Fact label={t("activity.time")}>
        <span className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-sm">
          <span className="text-fg-muted">{t("activity.started")}:</span>
          {at(entry.started || entry.date)}
          {entry.completed && (
            <>
              <span className="text-fg-muted">{t("activity.completed")}:</span>
              {at(entry.completed)}
            </>
          )}
        </span>
      </Fact>

      <Fact label={t("activity.who")}>
        <span className="inline-flex items-center gap-1.75">
          <Icon as={entry.user ? UserIcon : BotIcon} size={15} className="text-accent-text" />
          {entry.user || "system"}
        </span>
      </Fact>

      <Fact label={t("activity.actionType")}>
        <ActionBadge action={entry.action} />
      </Fact>

      {entry.table && (
        <Fact label={t("activity.table")}>
          <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[13px]">
            {entry.table}
          </code>
        </Fact>
      )}
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={`mb-1.5 ${CAPS_LABEL}`}>{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

/**
 * Что стало с одним полем.
 *
 * Короткое значение — строкой «было → стало»: две рамки ради «10 → 20»
 * занимают полэкрана, а сравнивать там нечего. Длинное всё-таки
 * разводится в два столбца — в строку оно не читается.
 *
 * Цветом помечены только знаки списка: плюс и минус — это добавили
 * и убрали, то есть ровно то, что означают success и danger. Обычная
 * смена значения цвета не получает: направление несёт стрелка, и
 * красить каждую правку значило бы раскрасить весь журнал.
 */
function Change({ change }: { change: EntryChange }) {
  const { t } = useTranslation();

  if ("added" in change) {
    // Набор тот же — значит переставили. Печатать список дважды незачем:
    // сам факт и есть всё содержание правки.
    if (!change.added.length && !change.removed.length) {
      return <p className="text-xs text-fg-subtle">{t("activity.reordered")}</p>;
    }

    return (
      <ul className="max-h-40 space-y-0.5 overflow-auto">
        {change.removed.map((item, index) => (
          <li key={`-${index}`} title={item} className="truncate font-mono text-xs text-fg">
            <span className="text-danger">−</span> {item}
          </li>
        ))}

        {change.added.map((item, index) => (
          <li key={`+${index}`} title={item} className="truncate font-mono text-xs text-fg">
            <span className="text-success">+</span> {item}
          </li>
        ))}
      </ul>
    );
  }

  if (inline(change.before) && inline(change.after)) {
    return (
      <p className="flex items-baseline gap-1.5 font-mono text-xs">
        <span className="min-w-0 truncate text-fg-muted">{change.before || "—"}</span>
        <span className="shrink-0 text-fg-subtle">→</span>
        <span className="min-w-0 truncate text-fg">{change.after || "—"}</span>
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Side label={t("activity.before")} value={change.before} />
      <Side label={t("activity.after")} value={change.after} />
    </div>
  );
}

/** Влезает в строку: без переносов и не длиннее половины ширины. */
function inline(value: string): boolean {
  return value.length <= 48 && !value.includes("\n");
}

/**
 * Одна сторона изменения. Пусто — это «поля не было», и так и написано
 * прочерком: пустая рамка читалась бы как «не загрузилось».
 */
function Side({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-2xs text-fg-subtle">{label}</p>
      <pre className="max-h-40 overflow-auto rounded-md bg-bg p-2 font-mono text-xs text-fg">
        {value || "—"}
      </pre>
    </div>
  );
}
