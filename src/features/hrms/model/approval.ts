/*
 * Согласование заявки по маршруту — как в HRMS (`udevs_hrms_admin`,
 * Settings/Approvals/approvalRuntime.ts): маршрут отдела — шаги по
 * порядку; строка `hr_request_approvals` пишется, когда шаг пройден,
 * заготовок «ожидает» нет. Итог — статус самой заявки: «одобрена»,
 * когда пройдены все шаги, «отклонена» — сразу.
 *
 * Так лежат и данные проекта: у одобренных заявок по строке на шаг,
 * у ждущих — ни одной, `current_step` не заполнен нигде.
 */

export type Route = {
  id: string;
  name: string;
  /** `request_type`: absence, attendance_correction, late_arrival. */
  requestType: string;
  departmentId: string;
  /** Пусто — маршрут на любой тип отсутствия. */
  absenceTypeId: string;
  active: boolean;
  /** Номера шагов по порядку. */
  steps: number[];
};

export type Decision = { step: number; decision: string };

/**
 * Маршрут заявки: активный, того же вида и отдела; маршрут на её тип
 * отсутствия важнее общего. Маршрут без отдела не подбирается: отделы
 * процесса HRMS при переносе потерялись (SYSTEM-TABLES-AUDIT,
 * «hr_approval_routes»), и угадывать, к кому он относится, нельзя.
 */
export const routeFor = (
  request: { type: string; departmentId: string; absenceTypeId: string },
  routes: Route[],
): Route | null => {
  const fits = routes.filter(
    (route) =>
      route.active &&
      route.steps.length > 0 &&
      route.requestType === request.type &&
      route.departmentId !== "" &&
      route.departmentId === request.departmentId &&
      (!route.absenceTypeId || route.absenceTypeId === request.absenceTypeId),
  );
  return fits.find((route) => route.absenceTypeId) ?? fits[0] ?? null;
};

export type Progress = { done: number; total: number; next: number | null };

/** Сколько шагов маршрута пройдено и какой следующий. */
export const progressOf = (route: Route, decisions: Decision[]): Progress => {
  const approved = new Set(decisions.filter((d) => d.decision === "approved").map((d) => d.step));
  const left = route.steps.filter((step) => !approved.has(step));
  return { done: route.steps.length - left.length, total: route.steps.length, next: left[0] ?? null };
};

/**
 * Что записать по решению: шаг в историю (если есть маршрут) и новый
 * статус заявки (если решение итоговое). Одобрение шага, за которым
 * есть ещё шаги, статус не трогает.
 */
export const decisionWrites = (
  route: Route | null,
  progress: Progress | null,
  decision: "approved" | "rejected",
): { step: number | null; status: "approved" | "rejected" | null } => {
  const step = route && progress ? progress.next : null;
  if (decision === "rejected") return { step, status: "rejected" };
  const last = !route || !progress || progress.next === null || progress.done + 1 >= progress.total;
  return { step, status: last ? "approved" : null };
};
