import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTablePermissions } from "@/features/auth";
import { PEOPLE, useItems, useUpdateItem, type Filters, type Item } from "@/features/item";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { aggregate, coefficientOf, completion, ratingOf, SCORECARD, scoreOf, typeOfRange, type Aggregation, type KpiType, type Period } from "../model/kpi";
import { EMPLOYEES } from "./employee";
import { firstText, related, text } from "./org";
import { useAll } from "./timesheet";
import { upsert } from "./schedule";
import { ALL } from "./vacancy-page";

export const METRICS = "hr_kpi_metrics";
export const SCORECARDS = "hr_kpi_scorecards";
export const RESULTS = "hr_kpi_results";

export type Metric = {
  id: string;
  name: string;
  unit: string;
  direction: string;
  target: number;
  weight: number;
  /** Должность шаблона; пусто — разовый показатель, не шаблон. */
  positionId: string;
};
const num = (value: unknown) => (value == null || value === "" ? null : Number(value));
const toMetric = (row: Item): Metric => ({
  id: text(row.guid),
  name: text(row.name),
  unit: text(row.unit),
  direction: text(row.direction) || "up",
  target: num(row.target) ?? 0,
  weight: num(row.weight) ?? 0,
  positionId: text(row.hr_positions_id),
});

/** Строка оценки с показателем из связи. */
export type Result = {
  id: string;
  metric: Metric;
  target: number;
  actual: number | null;
  weight: number;
  created: string;
  /** Строка-родитель, если это дочерний период разбивки. */
  parentId: string;
  /** Есть у родителя: факт не вводится, а собирается из дочерних. */
  aggregation: Aggregation | "";
  /** Заметка к строке за период — «почему недобор» (`comment`). */
  comment: string;
};

const toResult = (row: Item): Result => ({
  id: text(row.guid),
  metric: { ...toMetric(related(row, "hr_kpi_metrics_id")), id: text(row.hr_kpi_metrics_id) },
  target: num(row.target) ?? 0,
  actual: num(row.actual),
  weight: num(row.weight) ?? 0,
  created: text(row.created_at),
  parentId: text(row.parent_result_id),
  aggregation: text(row.aggregation) as Aggregation | "",
  comment: text(row.comment),
});

/*
 * Строки карты по порядку добавления. Список приходит отсортированным
 * по последней правке — без этого строка прыгала вниз после ввода факта.
 */
const byCreated = (a: Result, b: Result) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id);
const groupByCard = (rows: Item[]) => {
  const map = new Map<string, Result[]>();
  for (const row of rows) {
    const id = text(row.hr_kpi_scorecards_id);
    map.set(id, [...(map.get(id) ?? []), toResult(row)]);
  }
  for (const list of map.values()) list.sort(byCreated);
  return map;
};


/** Итог карты, %: сумма баллов строк. */
export const totalOf = (rows: Result[]) =>
  Math.round(rows.reduce((sum, r) => sum + scoreOf(r.weight, completion(r.target, r.actual, r.metric.direction)), 0));

/**
 * Шаблоны для новой карты вида `type`: должности сотрудника, нет таких —
 * его отдела. Шаблон без вида — квартальный: до видов все были такими.
 */
export function templatesFor(metrics: Item[], positionId: string, departmentId: string, type: KpiType) {
  const ofType = metrics.filter((m) => (text(m.period_type) || "quarterly") === type);
  const of = (slug: string, id: string) => (id ? ofType.filter((m) => text(m[slug]) === id) : []);
  const own = of("hr_positions_id", positionId);
  return own.length ? own : of("hr_departments_id", departmentId);
}

export type KpiCard = { id: string; status: string; rows: Result[]; total: number };
export type KpiEmployee = {
  id: string;
  name: string;
  photo: string;
  position: string;
  positionId: string;
  deptId: string;
  dept: string;
  /** Карта по колонкам сводной; null — не заведена. */
  cards: (KpiCard | null)[];
};

/**
 * Сводная KPI (вид `KPI`): работающие сотрудники (отбор `where` — по полям
 * сотрудника, как у графика) и их карты вида `type`
 * по колонкам `columns`. Вид карты — по её датам (typeOfRange), колонка —
 * по `period_start`.
 *
 * ponytail: сотрудники и карты грузятся все и отбираются на клиенте —
 * их сотни; отбор на сервере понадобится, когда компания вырастет.
 */
export function useKpiSheet(type: KpiType, columns: Period[], where: Filters = {}) {
  const from = columns[0]?.start ?? "";
  const to = columns.at(-1)?.end ?? "";
  const employees = useAll(EMPLOYEES, where);
  const cards = useAll(SCORECARDS, { period_start: { op: "between", values: [from, to] } }, false);
  const own = cards.rows.filter((c) => typeOfRange(text(c.period_start), text(c.period_end)) === type);
  const ids = own.map((r) => text(r.guid));
  const results = useItems(ids.length ? RESULTS : undefined, {
    ...ALL,
    filters: { hr_kpi_scorecards_id: { op: "is", values: ids } },
  });
  const starts = columns.map((c) => c.start).join();
  const rows = useMemo(() => {
    const byCard = groupByCard(results.page.rows);
    const index = new Map(starts.split(",").map((start, i) => [start, i]));
    const byEmployee = new Map<string, (KpiCard | null)[]>();
    for (const card of cards.rows) {
      if (typeOfRange(text(card.period_start), text(card.period_end)) !== type) continue;
      const at = index.get(text(card.period_start).slice(0, 10));
      if (at == null) continue;
      const list = byEmployee.get(text(card.hr_employees_id)) ?? starts.split(",").map(() => null);
      const lines = byCard.get(text(card.guid)) ?? [];
      list[at] = { id: text(card.guid), status: text(card.status), rows: lines, total: totalOf(lines) };
      byEmployee.set(text(card.hr_employees_id), list);
    }
    return employees.rows
      .filter((row) => row.status !== "dismissed" || byEmployee.has(text(row.guid)))
      .map(
        (row): KpiEmployee => ({
          id: text(row.guid),
          name: text(row.full_name) || [text(row.last_name), text(row.first_name)].filter(Boolean).join(" ") || "—",
          photo: firstText(row.photo),
          position: text(related(row, "hr_positions_id").name),
          positionId: text(row.hr_positions_id),
          deptId: text(row.hr_departments_id),
          dept: text(related(row, "hr_departments_id").name),
          cards: byEmployee.get(text(row.guid)) ?? starts.split(",").map(() => null),
        }),
      );
  }, [employees.rows, cards.rows, results.page.rows, starts, type]);
  /* Дети родительских строк — в картах дочернего вида, их сводная сама не грузит. */
  const parentIds = results.page.rows.filter((r) => text(r.aggregation)).map((r) => text(r.guid));
  const kids = useItems(parentIds.length ? RESULTS : undefined, {
    ...ALL,
    filters: { parent_result_id: { op: "is", values: parentIds } },
  });
  const childrenOf = useMemo(() => {
    const map = new Map<string, KpiChild[]>();
    for (const row of kids.page.rows) {
      const card = related(row, "hr_kpi_scorecards_id");
      const start = text(card.period_start).slice(0, 10);
      const end = text(card.period_end).slice(0, 10);
      const child: KpiChild = { result: toResult(row), period: { type: typeOfRange(start, end), start, end }, status: text(card.status) };
      map.set(child.result.parentId, [...(map.get(child.result.parentId) ?? []), child]);
    }
    for (const list of map.values()) list.sort((a, b) => a.period.start.localeCompare(b.period.start));
    return map;
  }, [kids.page.rows]);
  return { employees: rows, childrenOf, loading: employees.loading || cards.loading || (ids.length > 0 && results.isLoading) };
}

/** Дочерняя строка разбивки: строка, период её карты и статус карты (правка — пока не утверждена). */
export type KpiChild = { result: Result; period: Period; status: string };

/** Карты сотрудника по периодам и строки всех его карт — вкладка «KPI». */
export function useEmployeeKpi(employeeId: string) {
  const cards = useItems(employeeId ? SCORECARDS : undefined, {
    ...ALL,
    filters: { hr_employees_id: { op: "is", values: [employeeId] } },
  });
  const ids = cards.page.rows.map((r) => text(r.guid));
  const results = useItems(ids.length ? RESULTS : undefined, {
    ...ALL,
    filters: { hr_kpi_scorecards_id: { op: "is", values: ids } },
  });
  const byCard = useMemo(() => groupByCard(results.page.rows), [results.page.rows]);
  const permissionOf = useTablePermissions();
  return {
    cards: cards.page.rows,
    results: byCard,
    isLoading: cards.isLoading || (ids.length > 0 && results.isLoading),
    canEdit: permissionOf(SCORECARDS).update && permissionOf(RESULTS).update,
    canCreate: permissionOf(SCORECARDS).write && permissionOf(RESULTS).write,
  };
}

/** Активные шаблоны показателей: для новой карты и «Добавить показатель». */
export function useMetrics(enabled: boolean) {
  const query = useItems(enabled ? METRICS : undefined, { ...ALL, relations: false });
  return useMemo(
    () => query.page.rows.filter((r) => r.is_active !== false).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
    [query.page.rows],
  );
}

const invalidate = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([SCORECARDS, RESULTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })));

/**
 * Новая карта за квартал: черновик и строки по шаблонам должности
 * сотрудника (нет таких — отдела) с целью и весом шаблона.
 */
export function useCreateScorecard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (a: { employeeId: string; departmentId: string; period: Period; metrics: Item[] }) => {
      const guid = crypto.randomUUID();
      await api.post<unknown>(`/v2/items/${SCORECARDS}`, {
        data: {
          guid,
          hr_employees_id: a.employeeId,
          hr_departments_id: a.departmentId || null,
          period_start: a.period.start,
          period_end: a.period.end,
          status: SCORECARD.draft,
        },
      });
      await upsert(
        RESULTS,
        a.metrics.map((m) => ({
          guid: crypto.randomUUID(),
          hr_kpi_scorecards_id: guid,
          hr_kpi_metrics_id: text(m.guid),
          target: num(m.target) ?? 0,
          weight: num(m.weight) ?? 0,
          actual: null,
        })),
      );
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => invalidate(queryClient),
  });
}

/** «Добавить показатель» в карту. */
export function useAddResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (a: { card: string; metric: string; target: number; weight: number }) =>
      api.post<unknown>(`/v2/items/${RESULTS}`, {
        data: { guid: crypto.randomUUID(), hr_kpi_scorecards_id: a.card, hr_kpi_metrics_id: a.metric, target: a.target, weight: a.weight },
      }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => invalidate(queryClient),
  });
}

/** Правка ячейки строки и полей карты. */
export const useUpdateResult = () => useUpdateItem(RESULTS);

/**
 * Факт строки. У дочерней строки следом пересчитывается факт родителя
 * из всех его детей (`aggregation`).
 *
 * ponytail: пересчёт на фронте — функции нет; правка мимо этого хука
 * (таблица, импорт) родителя не обновит. Появится функция — уходит туда.
 */
export function useUpdateActual() {
  const update = useUpdateItem(RESULTS);
  return (row: Result, actual: number | null) =>
    void update
      .mutateAsync({ guid: row.id, values: { actual } })
      .then(async () => {
        if (!row.parentId) return;
        type List = { data?: { response?: Item[] } };
        const [kids, parent] = await Promise.all([
          api.post<List>(`/v2/object/get-list/${RESULTS}`, { data: { parent_result_id: row.parentId, limit: 100 } }),
          api.post<List>(`/v2/object/get-list/${RESULTS}`, { data: { guid: row.parentId, limit: 1 } }),
        ]);
        const mode = (text(parent.data?.response?.[0]?.aggregation) || "sum") as Aggregation;
        const facts = (kids.data?.response ?? []).map((k) => (text(k.guid) === row.id ? actual : num(k.actual)));
        await update.mutateAsync({ guid: row.parentId, values: { actual: aggregate(facts, mode) } });
      })
      .catch((error: unknown) => reportError(error, "common.saveFailed"));
}
export const useUpdateScorecard = () => useUpdateItem(SCORECARDS);

/**
 * «Утвердить оценку»: статус, кто и когда, итог, коэффициент и рейтинг.
 * ponytail: итог помечен в схеме [fn], но функции нет — пишем сами;
 * когда появится функция, отсюда уходят total_score/bonus_coefficient/rating.
 * Передача бонуса в hr_payroll_lines — тоже её дело.
 */
export function statusValues(status: string, total: number): Item {
  if (status === SCORECARD.approved) return approveValues(total);
  /* Шаг назад из утверждённой — подпись утверждения снимается, итог пересчитают при новом. */
  return { status, approved_at: null, core_users_id: null };
}

export function approveValues(total: number): Item {
  return {
    status: SCORECARD.approved,
    approved_at: new Date().toISOString(),
    core_users_id: session.getObjectIds()[PEOPLE] ?? null,
    total_score: total,
    bonus_coefficient: coefficientOf(total),
    rating: ratingOf(total),
  };
}

export type NewKpi = {
  name: string;
  unit: string;
  direction: string;
  target: number;
  weight: number;
  positionId: string;
  /**
   * Сделать показатель шаблоном должности: тогда он встанет и в будущие
   * карты её сотрудников. Нет — показатель разовый, только выбранным.
   */
  asTemplate: boolean;
  /** Период карт; его вид — вид нового шаблона (`period_type`). */
  period: Period;
  /**
   * Разбивка на дочерние периоды (childPeriods): родительская строка
   * в карте `period` считает факт из дочерних по `aggregation`, у каждой
   * дочерней — своя цель в карте своего периода.
   */
  split?: { aggregation: Aggregation; children: { period: Period; target: number }[] };
  /**
   * Кому: сотрудник и его отдел. Карты берутся из `cards` (useCardsOfPeriods);
   * нет карты — заводится как «Создать карту»: шаблонами должности
   * её вида (`templates`) и затем новым показателем.
   */
  employees: { id: string; deptId: string; templates: (type: KpiType) => Item[] }[];
  cards: Map<string, string>;
};

/** Ключ карты в useCardsOfPeriods: сотрудник и начало периода. */
export const cardKey = (employee: string, period: Period) => `${employee}|${period.start}`;

/**
 * «Добавить KPI» сводной — как в udevs_hrms_admin: показатель заводится
 * шаблоном на должность и сразу встаёт строкой в карты выбранных
 * сотрудников за период. У кого карты нет — черновик с шаблонами
 * должности, как у «Создать карту»: карта одна, откуда её ни заведи.
 * С разбивкой — то же для каждого дочернего периода, строки детей
 * ссылаются на строку родителя (`parent_result_id`).
 */
export function useAddKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (a: NewKpi) => {
      const metric = crypto.randomUUID();
      await api.post<unknown>(`/v2/items/${METRICS}`, {
        data: {
          guid: metric,
          name: a.name,
          unit: a.unit,
          direction: a.direction,
          target: a.target,
          weight: a.weight,
          /* Без должности показатель не шаблон: templatesFor его не найдёт. */
          hr_positions_id: a.asTemplate ? a.positionId || null : null,
          data_source: "manual",
          period_type: a.period.type,
          is_active: true,
        },
      });

      const freshCards: Item[] = [];
      const rows: Item[] = [];
      const row = (card: string, metricId: string, target: number, weight: number, extra: Item = {}): Item => ({
        guid: crypto.randomUUID(),
        hr_kpi_scorecards_id: card,
        hr_kpi_metrics_id: metricId,
        target,
        weight,
        actual: null,
        parent_result_id: null,
        aggregation: null,
        ...extra,
      });
      /* Карта сотрудника за период: есть — её id, нет — новый черновик со строками шаблонов. */
      const cardOf = (e: NewKpi["employees"][number], period: Period) => {
        const key = cardKey(e.id, period);
        const known = a.cards.get(key);
        if (known) return known;
        const guid = crypto.randomUUID();
        a.cards.set(key, guid);
        freshCards.push({
          guid,
          hr_employees_id: e.id,
          hr_departments_id: e.deptId || null,
          period_start: period.start,
          period_end: period.end,
          status: SCORECARD.draft,
        });
        for (const m of e.templates(period.type)) rows.push(row(guid, text(m.guid), num(m.target) ?? 0, num(m.weight) ?? 0));
        return guid;
      };

      for (const e of a.employees) {
        const parent = row(cardOf(e, a.period), metric, a.target, a.weight, a.split ? { aggregation: a.split.aggregation } : {});
        rows.push(parent);
        for (const child of a.split?.children ?? [])
          rows.push(row(cardOf(e, child.period), metric, child.target, a.weight, { parent_result_id: parent.guid }));
      }
      await upsert(SCORECARDS, freshCards);
      await upsert(RESULTS, rows);
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all([METRICS, SCORECARDS, RESULTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) }))),
  });
}

/** Карты периодов `periods` (одного вида) по cardKey — «Добавить KPI» решает, кому заводить новую. */
export function useCardsOfPeriods(periods: Period[]) {
  const starts = periods.map((p) => p.start).sort();
  const from = starts[0] ?? "";
  const to = starts.at(-1) ?? "";
  const query = useItems(from ? SCORECARDS : undefined, {
    ...ALL,
    relations: false,
    filters: { period_start: { op: "between", values: [from, to] } },
  });
  const wanted = periods.map((p) => `${p.type}|${p.start}`).join();
  return useMemo(() => {
    const map = new Map<string, string>();
    const want = new Set(wanted.split(","));
    for (const c of query.page.rows) {
      const period: Period = { type: typeOfRange(text(c.period_start), text(c.period_end)), start: text(c.period_start).slice(0, 10), end: text(c.period_end).slice(0, 10) };
      if (want.has(`${period.type}|${period.start}`)) map.set(cardKey(text(c.hr_employees_id), period), text(c.guid));
    }
    return map;
  }, [query.page.rows, wanted]);
}

export type KpiEdit = {
  /** Поля показателя — меняются во всех картах, где он стоит. */
  metric: { id: string; name: string; unit: string; direction: string };
  /** Строка этой карты. `aggregation` — только у родителя. */
  row: { id: string; target: number; weight: number; aggregation?: Aggregation };
  /** Планы дочерних строк; у родителя после правки пересчитывается факт. */
  children: { id: string; target: number; actual: number | null }[];
};

const invalidateKpi = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([METRICS, SCORECARDS, RESULTS].map((slug) => queryClient.invalidateQueries({ queryKey: keys.items.table(slug) })));

/** «Редактировать» строки сводной: показатель, строка карты и планы её детей. */
export function useEditKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (e: KpiEdit) => {
      const put = (slug: string, data: Item) => api.put<unknown>(`/v2/items/${slug}`, { data });
      await put(METRICS, { guid: e.metric.id, name: e.metric.name, unit: e.metric.unit, direction: e.metric.direction });
      const row: Item = { guid: e.row.id, target: e.row.target, weight: e.row.weight };
      if (e.row.aggregation) {
        row.aggregation = e.row.aggregation;
        row.actual = aggregate(e.children.map((c) => c.actual), e.row.aggregation);
      }
      await put(RESULTS, row);
      await Promise.all(e.children.map((c) => put(RESULTS, { guid: c.id, target: c.target })));
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => invalidateKpi(queryClient),
  });
}

/**
 * «Удалить» строки сводной: строка с дочерними. `unlinkTemplate` —
 * заодно отвязать показатель от должности, чтобы не вставал в новые карты.
 */
export function useDeleteKpi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (d: { ids: string[]; metricId: string; unlinkTemplate: boolean }) => {
      await api.delete<unknown>(`/v1/object/${RESULTS}`, { data: { ids: d.ids } });
      if (d.unlinkTemplate) await api.put<unknown>(`/v2/items/${METRICS}`, { data: { guid: d.metricId, hr_positions_id: null, hr_departments_id: null } });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => invalidateKpi(queryClient),
  });
}
