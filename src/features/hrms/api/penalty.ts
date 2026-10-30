import { useMemo } from "react";
import { useCreateItem, useDeleteItems, useUpdateItem, type Item } from "@/features/item";
import { todayInput } from "@/shared/lib/date-value";
import type { PolicyRules, Violation } from "../model/penalty";
import { EMPLOYEES } from "./employee";
import { firstText, related, text } from "./org";
import { useAll } from "./timesheet";

/**
 * Штрафы за посещаемость — `fnRoot` прототипа (settings.html#hr-fines):
 * политика (`hr_penalty_policies`) — пороги и суммы по видам нарушений
 * (`hr_penalty_rules`), назначение (`hr_penalty_assignments`) — кому она
 * действует. Сами штрафы начисляет функция; здесь только настройки.
 */
const POLICIES = "hr_penalty_policies";
const RULES = "hr_penalty_rules";
const ASSIGNMENTS = "hr_penalty_assignments";

export const VIOLATIONS: readonly Violation[] = ["late", "early_leave", "no_checkout", "absence"];
export type { Violation };
/** У опоздания и раннего ухода — ступени по минутам, у остальных одна сумма. */
export const STEPPED: ReadonlySet<Violation> = new Set(["late", "early_leave"]);

/** Флаг включения вида на политике. */
const FLAG: Record<Violation, string> = {
  late: "late_enabled",
  early_leave: "early_leave_enabled",
  no_checkout: "no_checkout_enabled",
  absence: "absence_enabled",
};

export type PolicyRule = PolicyRules[Violation];
export type PenaltyPolicy = {
  id: string;
  name: string;
  description: string;
  rules: PolicyRules;
};
export type PolicyDraft = Omit<PenaltyPolicy, "id">;

export const SCOPES = ["employee", "department", "location", "all_locations"] as const;
export type Scope = (typeof SCOPES)[number];
const SCOPE_FIELD: Record<Exclude<Scope, "all_locations">, string> = {
  employee: "hr_employees_id",
  department: "hr_departments_id",
  location: "hr_locations_id",
};

export type PenaltyAssignment = {
  id: string;
  scope: Scope;
  targetId: string;
  target: string;
  policyId: string;
  from: string;
  to: string;
  active: boolean;
  excluded: string[];
};

export type Target = { id: string; name: string; departmentId?: string; locationId?: string };

const number = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);

const toAssignment = (row: Item): PenaltyAssignment => {
  const scope = (SCOPES as readonly string[]).includes(firstText(row.scope)) ? (firstText(row.scope) as Scope) : "employee";
  const field = scope === "all_locations" ? "" : SCOPE_FIELD[scope];
  const data = field ? related(row, field) : {};
  return {
    id: text(row.guid),
    scope,
    targetId: field ? text(row[field]) : "",
    target: text(data.full_name) || text(data.name),
    policyId: text(row.hr_penalty_policies_id),
    from: (text(row.valid_from) || text(row.effective_from)).slice(0, 10),
    to: text(row.valid_to).slice(0, 10),
    active: row.is_active !== false,
    excluded: Array.isArray(row.excluded_ids) ? row.excluded_ids.filter((x): x is string => typeof x === "string") : [],
  };
};

export function usePenalties() {
  const policyRows = useAll(POLICIES, {}, false);
  const ruleRows = useAll(RULES, {}, false);
  const assignmentRows = useAll(ASSIGNMENTS, {});
  const createPolicy = useCreateItem(POLICIES);
  const updatePolicy = useUpdateItem(POLICIES);
  const removePolicies = useDeleteItems(POLICIES);
  const createRule = useCreateItem(RULES);
  const removeRules = useDeleteItems(RULES);
  const createAssignment = useCreateItem(ASSIGNMENTS);
  const updateAssignment = useUpdateItem(ASSIGNMENTS);
  const removeAssignments = useDeleteItems(ASSIGNMENTS);

  const policies = useMemo<PenaltyPolicy[]>(
    () =>
      policyRows.rows.map((row) => {
        const id = text(row.guid);
        const mine = ruleRows.rows.filter((rule) => text(rule.hr_penalty_policies_id) === id);
        const rules = Object.fromEntries(
          VIOLATIONS.map((kind) => {
            const steps = mine
              .filter((rule) => firstText(rule.violation) === kind)
              .map((rule) => ({ minutes: number(rule.threshold_minutes), amount: number(rule.amount) }))
              .sort((a, b) => a.minutes - b.minutes);
            /* Флаг пуст у строк, заведённых до него: тогда вид включён, если у него есть суммы. */
            const flag = row[FLAG[kind]];
            return [kind, { on: flag === true || (flag == null && steps.length > 0), steps }];
          }),
        ) as Record<Violation, PolicyRule>;
        return { id, name: text(row.name), description: text(row.description), rules };
      }),
    [policyRows.rows, ruleRows.rows],
  );

  const assignments = useMemo(() => assignmentRows.rows.map(toAssignment), [assignmentRows.rows]);

  /* ponytail: правила политики переписываются целиком — удалить и создать заново;
     их единицы на политику. Нужна история правок — править по месту. */
  const savePolicy = async (draft: PolicyDraft, id?: string) => {
    const values = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      ...Object.fromEntries(VIOLATIONS.map((kind) => [FLAG[kind], draft.rules[kind].on])),
    };
    const guid = id ?? crypto.randomUUID();
    if (id) await updatePolicy.mutateAsync({ guid: id, values });
    else await createPolicy.mutateAsync({ guid, is_active: true, ...values });

    const old = ruleRows.rows.filter((rule) => text(rule.hr_penalty_policies_id) === guid).map((rule) => text(rule.guid));
    if (old.length) await removeRules.mutateAsync(old);
    for (const kind of VIOLATIONS)
      for (const step of draft.rules[kind].steps)
        await createRule.mutateAsync({
          guid: crypto.randomUUID(),
          hr_penalty_policies_id: guid,
          violation: kind,
          threshold_minutes: STEPPED.has(kind) ? step.minutes : null,
          amount: step.amount,
          currency: "UZS",
        });
    return guid;
  };

  const removePolicy = async (id: string) => {
    const rules = ruleRows.rows.filter((rule) => text(rule.hr_penalty_policies_id) === id).map((rule) => text(rule.guid));
    if (rules.length) await removeRules.mutateAsync(rules);
    await removePolicies.mutateAsync([id]);
  };

  /**
   * Одно назначение на цель: повторное — правка прежнего, как в прототипе.
   * `id` — правка этой строки; прежняя цель другого уровня очищается.
   */
  const assign = (scope: Scope, targetId: string, policyId: string, from: string, id?: string) => {
    const field = scope === "all_locations" ? "" : SCOPE_FIELD[scope];
    const same = id ? assignments.find((a) => a.id === id) : assignments.find((a) => a.scope === scope && a.targetId === targetId);
    const values = {
      scope,
      hr_penalty_policies_id: policyId,
      valid_from: from || todayInput(),
      ...Object.fromEntries(Object.values(SCOPE_FIELD).map((slug) => [slug, slug === field ? targetId : null])),
    };
    return same
      ? updateAssignment.mutateAsync({ guid: same.id, values })
      : createAssignment.mutateAsync({ guid: crypto.randomUUID(), is_active: true, ...values });
  };

  return {
    policies,
    assignments,
    loading: policyRows.loading || ruleRows.loading || assignmentRows.loading,
    busy: createPolicy.isPending || updatePolicy.isPending || createRule.isPending || removeRules.isPending,
    savePolicy,
    removePolicy,
    assign,
    toggleAssignment: (a: PenaltyAssignment) => updateAssignment.mutateAsync({ guid: a.id, values: { is_active: !a.active } }),
    removeAssignment: (id: string) => removeAssignments.mutateAsync([id]),
  };
}

/** Кому можно назначить: филиалы, отделы, сотрудники (с отделом и филиалом — для проверки). */
export function usePenaltyTargets() {
  const locations = useAll("hr_locations", {}, false);
  const departments = useAll("hr_departments", {}, false);
  const employees = useAll(EMPLOYEES, {}, false);
  return useMemo(
    () => ({
      location: locations.rows.map((row) => ({ id: text(row.guid), name: text(row.name) })),
      department: departments.rows.map((row) => ({ id: text(row.guid), name: text(row.name) })),
      employee: employees.rows
        .filter((row) => firstText(row.status) !== "dismissed")
        .map((row) => ({
          id: text(row.guid),
          name: text(row.full_name),
          departmentId: text(row.hr_departments_id),
          locationId: text(row.hr_locations_id),
        })),
    }),
    [locations.rows, departments.rows, employees.rows],
  );
}

/**
 * Назначения, под которые сотрудник подпадает сегодня, — от самого точного
 * к общему: сотрудник → отдел → филиал → все филиалы. Действует первое,
 * остальные им перекрыты. Выключенные, не начавшиеся, истёкшие
 * и исключённые (`excluded_ids`) пропускаются.
 */
export function matchingPolicies(person: Target, assignments: PenaltyAssignment[], today = todayInput()) {
  const match: Record<Scope, string | undefined> = {
    employee: person.id,
    department: person.departmentId,
    location: person.locationId,
    all_locations: "",
  };
  return SCOPES.flatMap((scope) =>
    assignments.filter(
      (a) =>
        a.scope === scope &&
        (scope === "all_locations" || (!!match[scope] && a.targetId === match[scope])) &&
        a.active &&
        (!a.from || a.from <= today) &&
        (!a.to || a.to >= today) &&
        !a.excluded.includes(person.id),
    ),
  );
}
