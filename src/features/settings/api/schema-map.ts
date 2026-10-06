import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import { toSchemaMap } from "../model/schema-map";
import { execSql } from "./sql";

/**
 * Схема базы для диаграммы — двумя SQL-запросами к служебным таблицам
 * object builder (`table`, `field`, `relation`) через ту же ручку, что
 * у SQL-консоли.
 *
 * Не через `/v2/fields/{slug}` и `/v2/relations/{slug}`: ручки «вся схема
 * разом» у шлюза нет, а по таблице — два запроса на каждую. На ERP
 * с сотней таблиц это двести запросов ради одной картинки.
 *
 * Цена — завязка на служебные таблицы бэкенда, а не на его API. Набор
 * таблиц повторяет список таблиц шлюза (`table.go:767`): свои
 * и четыре платформенные, на которые свои ссылаются.
 *
 * Как и консоль, работает только на postgres-проекте и только в базе
 * текущего окружения (api/sql.ts).
 */
const TABLES_SQL = `SELECT t.slug, t.label,
  (SELECT c.reltuples::bigint FROM pg_class c WHERE c.oid = to_regclass(quote_ident(t.slug))) AS rows,
  COALESCE((SELECT json_agg(json_build_object('slug', f.slug, 'type', f.type) ORDER BY f.created_at)
            FROM field f WHERE f.table_id = t.id), '[]'::json) AS fields
FROM "table" t
WHERE t.is_system = false OR t.slug IN ('role', 'client_type', 'person', 'sms_template')
ORDER BY t.slug`;

/**
 * Связи — от ПОЛЯ, а не от строки `relation`. В `relation.field_from`
 * не сказано, в какой таблице лежит колонка: у Many2One она в
 * `table_from`, а у Many2Many — в `table_to` (`relation.go:75`, `:100`),
 * и по одной строке стрелку не провести. Зато у каждого поля-связи есть
 * `relation_id` (`relation.go:316`): таблица поля — откуда ссылка,
 * вторая сторона связи — куда. Ссылка таблицы на себя (Recursive)
 * получается сама: обе стороны совпадают.
 */
const LINKS_SQL = `SELECT t.slug AS table_from, f.slug AS field_from,
  CASE WHEN r.table_from = t.slug THEN r.table_to ELSE r.table_from END AS table_to,
  r.type::text AS type
FROM field f
JOIN "table" t ON t.id = f.table_id
JOIN relation r ON r.id = f.relation_id`;

export function useSchemaMap() {
  const store = useSession();
  const projectId = store.getProjectId() ?? "";
  const envId = store.getEnvironmentId() ?? "";

  const query = useQuery({
    queryKey: keys.settings.schemaMap(projectId, envId),
    queryFn: async () => {
      const [tables, links] = await Promise.all([execSql(TABLES_SQL), execSql(LINKS_SQL)]);
      return toSchemaMap(tables.rows, links.rows);
    },
    enabled: Boolean(projectId && envId),
    // Схему меняет админ в конструкторе, а не пользователь по ходу работы.
    staleTime: 5 * 60_000,
  });

  return { map: query.data, isLoading: query.isLoading, error: query.error };
}
