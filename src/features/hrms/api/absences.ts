import { useMemo } from "react";
import { MAX_LIMIT, useCreateItem, useItems, useUpdateItem, type Item } from "@/features/item";
import { session } from "@/shared/api/session";
import type { AbsenceType } from "../model/absence-balance";
import { decisionWrites, type Decision, type Progress, type Route } from "../model/approval";
import { plusDays } from "../model/timesheet";
import { EMPLOYEES } from "./employee";
import { related, text } from "./org";
import { REQUESTS } from "./timesheet";

/*
 * Заявки на отсутствие и их согласование (`ucode/erp/erp.dbml`):
 * `hr_requests` типа absence, маршруты `hr_approval_routes` с шагами
 * `hr_approval_route_steps`, пройденные шаги — `hr_request_approvals`.
 */

const APPROVALS = "hr_request_approvals";
const ALL = { limit: MAX_LIMIT, page: 1 };

export type AbsenceRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhoto: string;
  departmentId: string;
  departmentName: string;
  typeId: string;
  typeTitle: string;
  typeIcon: string;
  typeColor: string;
  from: string;
  to: string;
  days: number | null;
  /** Вариант STATUS: pending, approved, rejected, cancelled. */
  status: string;
  reason: string;
};

const toRequest = (row: Item): AbsenceRequest => {
  const person = related(row, "employees_id");
  const kind = related(row, "hr_absence_types_id");
  const from = text(row.date_from).slice(0, 10);
  return {
    id: text(row.guid),
    employeeId: text(row.employees_id),
    employeeName: text(person.full_name) || "—",
    employeePhoto: text(person.photo),
    // Отдел — заявки, а не сотрудника: по нему выбирается маршрут.
    departmentId: text(row.departments_id) || text(person.departments_id),
    departmentName: text(related(row, "departments_id").name),
    typeId: text(row.hr_absence_types_id),
    typeTitle: text(kind.name),
    typeIcon: text(kind.icon),
    typeColor: text(kind.color),
    from,
    to: text(row.date_to).slice(0, 10) || from,
    days: typeof row.days === "number" ? row.days : null,
    status: text(row.status),
    reason: text(row.reason),
  };
};

/** Заявки на отсутствие, задевающие период. Поиск — по имени сотрудника. */
export function useAbsenceRequests(from: string, to: string, search: string) {
  // ponytail: одна порция MAX_LIMIT заявок на период; за месяц их десятки.
  const query = useItems(REQUESTS, {
    ...ALL,
    filters: {
      type: { op: "is", values: ["absence"] },
      date_from: { op: "before", values: [plusDays(to, 1)] },
      date_to: { op: "after", values: [plusDays(from, -1)] },
    },
    sorts: [{ field: "date_from", direction: "desc" }],
  });
  const needle = search.toLocaleLowerCase();
  const rows = useMemo(
    () =>
      query.page.rows
        .map(toRequest)
        .filter((request) => !needle || request.employeeName.toLocaleLowerCase().includes(needle)),
    [query.page.rows, needle],
  );
  return { rows, loading: query.isLoading, fetching: query.isFetching };
}

/** Все заявки на отсутствие одного сотрудника — вкладка «Отсутствия» его страницы. */
export function useEmployeeRequests(employeeId: string) {
  const query = useItems(employeeId ? REQUESTS : undefined, {
    ...ALL,
    filters: { type: { op: "is", values: ["absence"] }, employees_id: { op: "any", values: [employeeId] } },
    sorts: [{ field: "date_from", direction: "desc" }],
  });
  const rows = useMemo(() => query.page.rows.map(toRequest), [query.page.rows]);
  return { rows, loading: query.isLoading };
}

/** Типы отсутствий с лимитами — для баланса. Выключенные не показываются. */
export function useAbsenceTypes(): AbsenceType[] {
  const query = useItems("hr_absence_types", { ...ALL, sorts: [{ field: "sort_order", direction: "asc" }] });
  return useMemo(
    () =>
      query.page.rows
        .filter((row) => row.is_active !== false)
        .map((row) => ({
          id: text(row.guid),
          title: text(row.name),
          icon: text(row.icon),
          color: text(row.color),
          limit: typeof row.limit_days === "number" && text(row.limit_period) !== "none" ? row.limit_days : null,
          period: text(row.limit_period),
        })),
    [query.page.rows],
  );
}

/** Пройденные шаги заявок на экране: заявка → решения по шагам. */
export function useDecisions(requestIds: string[]): Map<string, Decision[]> {
  const query = useItems(requestIds.length ? APPROVALS : undefined, {
    ...ALL,
    filters: { hr_requests_id: { op: "any", values: requestIds } },
  });
  return useMemo(() => {
    const map = new Map<string, Decision[]>();
    for (const row of query.page.rows) {
      const id = text(row.hr_requests_id);
      const step = typeof row.step_order === "number" ? row.step_order : 0;
      map.set(id, [...(map.get(id) ?? []), { step, decision: text(row.decision) }]);
    }
    return map;
  }, [query.page.rows]);
}

/** Маршруты согласования с номерами своих шагов. Их единицы — грузятся целиком. */
export function useRoutes(): Route[] {
  const routes = useItems("hr_approval_routes", ALL);
  const steps = useItems("hr_approval_route_steps", ALL);
  return useMemo(
    () =>
      routes.page.rows.map((row) => ({
        id: text(row.guid),
        name: text(row.name),
        requestType: text(row.request_type),
        departmentId: text(row.departments_id),
        absenceTypeId: text(row.hr_absence_types_id),
        active: row.is_active !== false,
        steps: steps.page.rows
          .filter((step) => text(step.hr_approval_routes_id) === text(row.guid))
          .map((step) => (typeof step.step_order === "number" ? step.step_order : 0))
          .sort((a, b) => a - b),
      })),
    [routes.page.rows, steps.page.rows],
  );
}

/**
 * Решение по заявке: пройденный шаг — в историю, итог — в статус заявки
 * (model/approval). Шаг пишется первым: если статус потом не запишется,
 * заявка останется ждущей с пройденным шагом, а не одобренной без следа.
 * Кто решил — своя строка `employees` из токена; у ADMIN её нет.
 */
export function useDecideRequest() {
  const createStep = useCreateItem(APPROVALS);
  const update = useUpdateItem(REQUESTS);
  return {
    pending: createStep.isPending || update.isPending,
    decide: async (request: AbsenceRequest, route: Route | null, progress: Progress | null, decision: "approved" | "rejected") => {
      const writes = decisionWrites(route, progress, decision);
      const at = new Date().toISOString();
      if (writes.step !== null) {
        await createStep.mutateAsync({
          hr_requests_id: request.id,
          step_order: writes.step,
          decision,
          decided_at: at,
          employees_id: session.getObjectIds()[EMPLOYEES] ?? null,
        });
      }
      if (writes.status) {
        await update.mutateAsync({ guid: request.id, values: { status: writes.status, decided_at: at } });
      }
    },
  };
}
