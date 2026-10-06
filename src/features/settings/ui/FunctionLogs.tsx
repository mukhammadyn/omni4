import { useDeferredValue, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import {
  FUNCTION_LOGS_PAGE,
  NO_LOG_FILTERS,
  useFunctionLogs,
  type FunctionLogFilters,
} from "../api/function-logs";
import { useProjectFunctions } from "../api/functions";
import { relativeTime } from "../model/time";
import {
  LogEmpty,
  LogField,
  LogLayout,
  MethodBadge,
  Pager,
  Period,
  StatusPill,
  formatDateTime,
} from "./parts";
import { TableFilter } from "./TableFilter";

/**
 * Выполнение функций: когда вызвали, что вызвали и чем кончилось.
 * Вид «Логи функций» прототипа — та же рамка, что у журнала изменений.
 *
 * Строка не раскрывается: в отличие от журнала изменений, где хранятся
 * «было» и «стало», здесь у записи нет ни тела запроса, ни ответа —
 * `FunctionLogModel` их не несёт (`pg_version_history.proto:70`).
 * Всё, что есть, помещается в саму строку.
 */
export function FunctionLogs({ kindField }: { kindField: ReactNode }) {
  const { t, i18n } = useTranslation();

  const [filters, setFilters] = useState<FunctionLogFilters>(NO_LOG_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(FUNCTION_LOGS_PAGE);

  const deferred = useDeferredValue(filters);
  const { logs, count, isLoading, error } = useFunctionLogs(deferred, page, limit);

  const put = (patch: Partial<FunctionLogFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <LogLayout
      hint={t("functionLogs.hint")}
      filters={
        <>
          {kindField}

          <LogField label={t("functionLogs.function")}>
            <FunctionFilter
              value={filters.functionId}
              onChange={(functionId) => put({ functionId })}
            />
          </LogField>

          {/*
            Статус — список из двух значений, и это не догадка: в журнал
            его пишут ровно два места, и оба знают только «success»
            и «error» (`helper/invoke_function.go:61,101` и
            `function_service/api/handlers/function.go:1241,1271`).

            Список здесь обязателен: сравнение ТОЧНОЕ, `l.status = $1`
            (`version_history.go:396`), — набранное руками «succ»
            молча вернуло бы пустой список.
          */}
          <LogField label={t("functionLogs.status")} className="w-40">
            <Dropdown
              value={filters.status}
              items={[
                ...(filters.status ? [{ value: "", label: t("table.clearFilters") }] : []),
                { value: "success", label: t("functionLogs.success") },
                { value: "error", label: t("functionLogs.error") },
              ]}
              placeholder={t("functionLogs.anyStatus")}
              ariaLabel={t("functionLogs.status")}
              onChange={(status) => put({ status })}
            />
          </LogField>

          {/* Таблица — выбор из списка: сравнение тоже точное
              (`l.table_slug = $1`), и слаг по памяти не набирают. */}
          <LogField label={t("activity.table")}>
            <TableFilter value={filters.table} onChange={(table) => put({ table })} size="md" />
          </LogField>

          <LogField label={t("activity.period")} className="w-80">
            <Period from={filters.from} to={filters.to} onChange={(from, to) => put({ from, to })} />
          </LogField>

          {Object.values(filters).some(Boolean) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilters(NO_LOG_FILTERS);
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
        {!isLoading && !logs.length && <LogEmpty text={error ?? t("functionLogs.empty")} />}

        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-3.5 px-4.5 py-3">
            <MethodBadge method={log.method} />

            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
              {log.functionName || log.functionId}
              {log.tableSlug && (
                <span className="ml-2 font-normal text-fg-subtle">
                  {log.tableSlug}
                  {log.actionType && ` · ${log.actionType}`}
                </span>
              )}
            </span>

            {log.duration > 0 && (
              <span className="hidden shrink-0 text-[13px] text-fg-subtle tabular-nums sm:inline">
                {log.duration} ms
              </span>
            )}

            <span
              className="hidden shrink-0 text-[13px] whitespace-nowrap text-fg-subtle sm:inline"
              title={formatDateTime(log.sentAt, i18n.language)}
            >
              {relativeTime(log.sentAt, i18n.language)}
            </span>

            {/*
              Слово из базы переводится, а не показывается как есть:
              «success» в русском интерфейсе — не термин, а недоделка.
              Незнакомое значение покажем как есть, серым: соврать хуже,
              чем удивить.
            */}
            {log.status && (
              <StatusPill
                ok={log.status !== "error"}
                tone={log.status === "success" ? "green" : log.status === "error" ? "red" : "gray"}
              >
                {log.status === "success"
                  ? t("functionLogs.success")
                  : log.status === "error"
                    ? t("functionLogs.error")
                    : log.status}
              </StatusPill>
            )}
          </div>
        ))}
      </div>

      <Pager
        page={page}
        total={count}
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

/**
 * Отбор по функции — списком, а не строкой поиска.
 *
 * Дело не только в удобстве: поиск по имени на этой ручке отвечает
 * ошибкой на весь журнал (условие ссылается на присоединённую таблицу
 * функций, а счётчик строк выполняется без неё — см. `api/function-logs`).
 * Отбор по идентификатору такого условия не создаёт.
 *
 * Список — первая страница `useProjectFunctions` с поиском на сервере:
 * функций в проекте единицы, а не сотни, как таблиц, и догрузка
 * по прокрутке здесь была бы механизмом ради двух десятков строк.
 * Не нашлось — набирают в поиске, он уходит на сервер.
 */
function FunctionFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { functions, isLoading } = useProjectFunctions(search, 1);

  const found = functions.map((item) => ({
    value: item.id,
    label: item.name || item.path || item.id,
  }));

  const items = [
    // Первым пунктом — снять отбор: стереть выбор в списке больше нечем.
    ...(value ? [{ value: "", label: t("table.clearFilters") }] : []),
    /* Выбранная функция остаётся в списке, даже когда поиск её не нашёл,
       — иначе набранное чужое слово стирает подпись с кнопки, и кажется,
       что отбора нет, а он есть. */
    ...(value && !found.some((item) => item.value === value)
      ? [{ value, label: value }]
      : []),
    ...found,
  ];

  return (
    <Dropdown
      value={value}
      items={items}
      placeholder={t("functionLogs.function")}
      ariaLabel={t("functionLogs.function")}
      searchPlaceholder={t("functions.search")}
      emptyText={t("functions.empty")}
      search={search}
      loading={isLoading}
      onSearch={setSearch}
      onChange={onChange}
    />
  );
}
