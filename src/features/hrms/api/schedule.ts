import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, toRequestBody, useItems, type Filters, type Item, type ItemsResponseDto } from "@/features/item";
import { api } from "@/shared/api/client";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";
import { SHIFT_KINDS, WEEKDAYS, type Shift, type ShiftDraft, type ShiftKind, type Template } from "../model/schedule";
import { EMPLOYEES } from "./employee";
import { firstText, text } from "./org";
import { plusDays } from "../model/timesheet";
import { useAll } from "./timesheet";

/** График работы: смены, шаблоны и их дни (`ucode/erp/erp.dbml`). */
export const SHIFTS = "hr_shifts";
export const WORK_SCHEDULES = "hr_work_schedules";
export const WORK_SCHEDULE_DAYS = "hr_work_schedule_days";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const kindOf = (value: unknown): ShiftKind => (SHIFT_KINDS as readonly unknown[]).includes(value) ? (value as ShiftKind) : "day";
/** TIME приходит «ЧЧ:ММ» или «ЧЧ:ММ:СС». */
const clock = (value: unknown) => text(value).slice(0, 5);

export const toShift = (row: Item): Shift => ({
  id: text(row.guid),
  employeeId: text(row.hr_employees_id),
  date: text(row.date).slice(0, 10),
  start: clock(row.start_time),
  end: clock(row.end_time),
  breakMinutes: num(row.break_minutes),
  plannedMinutes: num(row.planned_minutes),
  kind: kindOf(row.shift_kind),
  seriesId: text(row.series_id),
  templateId: text(row.hr_work_schedules_id),
  locationId: text(row.hr_locations_id),
  positionId: text(row.hr_positions_id),
  projectId: text(row.hr_projects_id),
  comment: text(row.comment),
});

/*
 * Строка для upsert-many: у каждой строки пачки — все колонки списка,
 * иначе бэкенд отвергает пачку целиком (справочник API, §4.3). Пустая
 * ссылка — null: колонка uuid пустую строку не принимает.
 */
const toRow = (draft: ShiftDraft, guid: string) => ({
  guid,
  hr_employees_id: draft.employeeId,
  date: draft.date,
  start_time: draft.start,
  end_time: draft.end,
  break_minutes: draft.breakMinutes,
  planned_minutes: draft.plannedMinutes,
  shift_kind: draft.kind,
  series_id: draft.seriesId,
  hr_work_schedules_id: draft.templateId || null,
  hr_locations_id: draft.locationId || null,
  hr_positions_id: draft.positionId || null,
  hr_projects_id: draft.projectId || null,
  comment: draft.comment,
  exception_type: "none",
});

export const toTemplate = (row: Item, days: Item[]): Template => {
  const own = days.filter((day) => text(day.hr_work_schedules_id) === text(row.guid));
  return {
    id: text(row.guid),
    name: text(row.name),
    color: text(row.color),
    type: row.type === "cycle" ? "cycle" : "weekly",
    breakMinutes: num(row.break_minutes),
    graceMinutes: num(row.grace_minutes),
    description: text(row.description),
    active: row.is_active !== false,
    days: WEEKDAYS.map((weekday) => {
      const day = own.find((item) => item.weekday === weekday);
      return {
        working: day?.is_working === true,
        start: clock(day?.start_time) || "09:00",
        end: clock(day?.end_time) || "18:00",
        kind: kindOf(day?.shift_kind),
      };
    }),
    dayIds: own.map((day) => text(day.guid)),
    cycle: {
      work: num(row.cycle_work_days) || 2,
      off: num(row.cycle_off_days) || 2,
      start: clock(row.cycle_start_time) || "08:00",
      end: clock(row.cycle_end_time) || "20:00",
      kind: kindOf(row.cycle_shift_kind),
    },
  };
};

/** Шаблоны с днями. */
export function useTemplates() {
  const templates = useAll(WORK_SCHEDULES, {}, false);
  const days = useAll(WORK_SCHEDULE_DAYS, {}, false);
  const list = useMemo(
    () => templates.rows.map((row) => toTemplate(row, days.rows)).sort((a, b) => a.name.localeCompare(b.name)),
    [templates.rows, days.rows],
  );
  return { templates: list, loading: templates.loading || days.loading };
}

export type ScheduleEmployee = {
  id: string;
  name: string;
  photo: string;
  position: string;
  positionId: string;
  department: string;
  departmentId: string;
  location: string;
  locationId: string;
  templateId: string;
  hireDate: string;
  dismissalDate: string;
};

/**
 * Справочники графика: отделы, филиалы и должности — отбор календаря,
 * подпись смены и названия у сотрудников (их строки едут без связей);
 * проекты — окну смены, грузятся, только когда окно открыто.
 */
export function useScheduleDirectory({ forms = false }: { forms?: boolean } = {}) {
  const departments = useAll("hr_departments", {}, false);
  const locations = useAll("hr_locations", {}, false);
  const positions = useAll("hr_positions", {}, false);
  const projects = useAll(forms ? "hr_projects" : undefined, {}, false);
  return useMemo(() => {
    const names = (rows: Item[]) => rows.map((row) => ({ id: text(row.guid), name: text(row.name) })).sort((a, b) => a.name.localeCompare(b.name));
    return {
      departments: names(departments.rows),
      locations: names(locations.rows),
      positions: names(positions.rows),
      projects: names(projects.rows),
    };
  }, [departments.rows, locations.rows, positions.rows, projects.rows]);
}

/**
 * Праздники за период — даты, которые серия пропускает. Пока грузятся
 * (и пока видны праздники прошлого периода — `placeholderData`), писать
 * по ним нельзя: смены лягут на праздник.
 */
export function useHolidays(from: string, to: string) {
  const query = useAll(from && to ? "hr_holidays" : undefined, { date: { op: "between", values: [from, to] } }, false);
  const dates = useMemo(
    () => new Set(query.rows.filter((row) => text(row.type) !== "working_weekend").map((row) => text(row.date).slice(0, 10))),
    [query.rows],
  );
  return { dates, loading: query.loading || query.fetching };
}

/*
 * Сотрудники графика едут без связей: из `*_id_data` нужны только
 * названия, а со связями ответ в разы тяжелее (справочник API, §4.3:
 * 2,0 МБ против 437 КБ на 651 строке). Выбрать колонки get-list не даёт
 * (GetListV2 берёт все поля), так что это единственный рычаг. Названия —
 * из справочников, они и так загружены.
 */
type Names = Record<"positions" | "departments" | "locations", Map<string, string>>;

function useNames(): Names {
  const directory = useScheduleDirectory();
  return useMemo(() => {
    const map = (list: { id: string; name: string }[]) => new Map(list.map((item) => [item.id, item.name]));
    return { positions: map(directory.positions), departments: map(directory.departments), locations: map(directory.locations) };
  }, [directory]);
}

const toEmployee = (row: Item, names: Names): ScheduleEmployee => {
  const positionId = text(row.hr_positions_id);
  const departmentId = text(row.hr_departments_id);
  const locationId = text(row.hr_locations_id);
  return {
    id: text(row.guid),
    name: text(row.full_name) || [text(row.last_name), text(row.first_name)].filter(Boolean).join(" "),
    photo: firstText(row.photo),
    positionId,
    position: names.positions.get(positionId) ?? "",
    departmentId,
    department: names.departments.get(departmentId) ?? "",
    locationId,
    location: names.locations.get(locationId) ?? "",
    templateId: text(row.hr_work_schedules_id),
    hireDate: text(row.hire_date).slice(0, 10),
    dismissalDate: text(row.dismissal_date).slice(0, 10),
  };
};

/** Все сотрудники по алфавиту — «Шаблонам»: кто на каком шаблоне. */
export function useScheduleEmployees() {
  const names = useNames();
  const people = useAll(EMPLOYEES, {}, false);
  const employees = useMemo(
    () => people.rows.map((row) => toEmployee(row, names)).sort((a, b) => a.name.localeCompare(b.name)),
    [people.rows, names],
  );
  return { employees, loading: people.loading };
}

/**
 * Сотрудники по guid — окнам: выбранные в форме, сотрудник новой смены.
 * Не весь список компании: окну нужны только они. guid сортируются,
 * чтобы ключ кэша не зависел от порядка выбора.
 */
export function useEmployeesById(ids: string[]) {
  const names = useNames();
  const sorted = [...new Set(ids)].sort();
  const people = useAll(sorted.length ? EMPLOYEES : undefined, { guid: { op: "any", values: sorted } }, false);
  const employees = useMemo(() => people.rows.map((row) => toEmployee(row, names)), [people.rows, names]);
  return { employees, loading: sorted.length > 0 && people.loading };
}

/** Поиск сотрудника в выборе — с сервера порциями, по алфавиту, как сетка. */
export function useEmployeeSearch(search: string) {
  const names = useNames();
  const query = useItems(EMPLOYEES, {
    limit: 50,
    page: 1,
    infinite: true,
    filters: {},
    search,
    sorts: [{ field: "full_name", direction: "asc" }],
    relations: false,
  });
  const employees = useMemo(() => query.page.rows.map((row) => toEmployee(row, names)), [query.page.rows, names]);
  return { employees, loading: query.isLoading, loadingMore: query.loadingMore, hasMore: query.hasMore, loadMore: query.loadMore };
}

/**
 * Всё, из чего рисуется график за период: сотрудники, их смены, шаблоны
 * и праздники. Смены — одним запросом на период на всю компанию, как
 * у табеля (api/timesheet, useTimesheet); порциями — только сотрудники,
 * по алфавиту, с поиском и отбором по отделу и филиалу на сервере.
 */
export function useSchedule({
  from,
  to,
  employeeId,
  search = "",
  departments = [],
  locations = [],
  pageSize,
}: {
  from: string;
  to: string;
  employeeId?: string;
  search?: string;
  departments?: string[];
  locations?: string[];
  /** Сотрудники порциями по столько — прокрутка, как в «Посещаемости». Без него — все. */
  pageSize?: number;
}) {
  const one = employeeId ? { hr_employees_id: { op: "any" as const, values: [employeeId] } } : {};
  // «—» (поле пустое) в отбор uuid не передать — такой отбор остаётся на клиенте.
  const only = (field: string, values: string[]): Filters =>
    values.length && !values.includes("") ? { [field]: { op: "any", values } } : {};
  const peopleQuery = useItems(EMPLOYEES, {
    limit: pageSize ?? MAX_LIMIT,
    page: 1,
    infinite: true,
    filters: employeeId
      ? { guid: { op: "any", values: [employeeId] } }
      : { ...only("hr_departments_id", departments), ...only("hr_locations_id", locations) },
    search,
    // Порции идут по алфавиту — иначе новая порция вставала бы между строк.
    sorts: [{ field: "full_name", direction: "asc" }],
    relations: false,
  });
  const names = useNames();
  const { hasMore: peopleMore, loadMore } = peopleQuery;
  useEffect(() => {
    if (!pageSize && peopleMore) loadMore();
  }, [pageSize, peopleMore, loadMore]);
  const people = useMemo(
    () => ({
      employees: peopleQuery.page.rows.map((row) => toEmployee(row, names)),
      loading: peopleQuery.isLoading || (!pageSize && (peopleMore || peopleQuery.loadingMore)),
    }),
    [peopleQuery.page.rows, peopleQuery.isLoading, peopleQuery.loadingMore, pageSize, peopleMore, names],
  );
  const loadingMore = peopleQuery.loadingMore;
  const hasMore = Boolean(pageSize) && peopleMore;
  const shifts = useAll(SHIFTS, { ...one, date: { op: "between", values: [from, to] } }, false);
  const holidays = useAll("hr_holidays", { date: { op: "between", values: [from, to] } }, false);
  const { templates, loading: templatesLoading } = useTemplates();

  return useMemo(
    () => ({
      // Принятые после периода и уволенные до него в графике не нужны.
      employees: people.employees.filter((e) => (!e.hireDate || e.hireDate <= to) && (!e.dismissalDate || e.dismissalDate >= from)),
      shifts: shifts.rows.map(toShift),
      templates,
      // ponytail: праздник общий на всех, как в табеле (api/timesheet).
      holidays: new Map(
        holidays.rows
          .filter((row) => text(row.type) !== "working_weekend")
          .map((row) => [text(row.date).slice(0, 10), text(row.name)]),
      ),
      loading: people.loading || shifts.loading || holidays.loading || templatesLoading,
      // Догрузка порции — не обновление: прежние строки не приглушаются.
      fetching: shifts.fetching || (peopleQuery.isFetching && !loadingMore),
      hasMore,
      loadingMore,
      loadMore,
      /** Сотрудников по серверному отбору всего, а не загруженных. */
      total: peopleQuery.page.count,
    }),
    [people.employees, people.loading, shifts.rows, holidays.rows, templates, from, to, shifts.loading, holidays.loading, templatesLoading, shifts.fetching, peopleQuery.isFetching, hasMore, loadingMore, loadMore, peopleQuery.page.count],
  );
}

/**
 * Смены серии с даты `from` — открыть её на правку. Раньше правка не
 * трогает (прошлое — норма табеля), и год шаблона на 50 человек не
 * дочитывается десятком запросов. `earlier` — есть ли у серии дни до
 * `from`: без них серия из одной даты правилась бы целиком, хотя она
 * длиннее (model/schedule, isOneDate). Это одна строка, `limit: 1`;
 * отказ запроса — `error`, а не вечная загрузка.
 */
export function useSeries(seriesId: string, from: string) {
  const series = { series_id: { op: "any" as const, values: [seriesId] } };
  const query = useAll(seriesId ? SHIFTS : undefined, { ...series, date: { op: "after", values: [plusDays(from, -1)] } }, false);
  const earlier = useItems(seriesId ? SHIFTS : undefined, {
    limit: 1,
    page: 1,
    filters: { ...series, date: { op: "before", values: [from] } },
    relations: false,
  });
  return {
    rows: useMemo(() => query.rows.map(toShift), [query.rows]),
    earlier: earlier.page.rows.length > 0,
    loading: query.loading || earlier.isLoading,
    error: earlier.error,
  };
}

/** Порция одной записи: год графика отдела — десятки тысяч строк. */
const CHUNK = 1000;
const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

const upsert = (slug: string, objects: Record<string, unknown>[]) =>
  objects.length
    ? api.post<unknown>(`/v2/items/${slug}/upsert-many`, { data: { field_slug: "guid", fields: Object.keys(objects[0]!), objects } })
    : Promise.resolve();

/**
 * Смены сотрудников в периоде — все, порциями до конца, а не первые N:
 * усечённый список молча соврал бы, какие дни заняты.
 */
async function shiftsOf(employeeIds: string[], from: string, to: string) {
  const filters: Filters = { hr_employees_id: { op: "any", values: employeeIds }, date: { op: "between", values: [from, to] } };
  const body = toRequestBody({ limit: MAX_LIMIT, page: 1, filters, relations: false });
  const shifts: Shift[] = [];
  for (let offset = 0; ; offset += MAX_LIMIT) {
    const page = await api.post<ItemsResponseDto>(`/v2/object/get-list/${SHIFTS}`, { data: { ...body, offset } });
    const rows = page.data?.response ?? [];
    shifts.push(...rows.map(toShift));
    if (rows.length < MAX_LIMIT) return shifts;
  }
}

/** Их снимает «Заменить существующие». */
const shiftIdsOf = async (employeeIds: string[], from: string, to: string) =>
  (await shiftsOf(employeeIds, from, to)).map((shift) => shift.id);

/**
 * Занятые дни — по требованию, при сохранении окна смены, а не запросом
 * на каждое изменение формы: какие смены уже стоят у выбранных в периоде
 * (конфликты, как в HRMS: `ShiftModal` грузит `existing` на сохранении).
 */
export function useBusyShifts() {
  return useMutation({
    mutationFn: ({ employeeIds, from, to }: { employeeIds: string[]; from: string; to: string }) =>
      employeeIds.length ? shiftsOf(employeeIds, from, to) : Promise.resolve([]),
    onError: (error) => reportError(error, "shift.busyFailed"),
  });
}

/**
 * Сначала пишутся смены одним upsert-many на порцию (справочник API, §4.3) —
 * а не POST на каждый день, — потом удаляются снятые. Атомарна только
 * порция, и при сбое посередине такой порядок даёт дубли, а не потерю.
 * Строка с `id` обновляется на месте; новым guid даём сами: ответ
 * upsert-many пуст.
 */
async function writeShifts(remove: string[], add: (ShiftDraft & { id?: string })[]) {
  for (const objects of chunks(add.map((draft) => toRow(draft, draft.id ?? crypto.randomUUID())))) await upsert(SHIFTS, objects);
  for (const ids of chunks(remove)) await api.delete<unknown>(`/v1/object/${SHIFTS}`, { data: { ids } });
}

export function useWriteShifts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ remove, add }: { remove: string[]; add: (ShiftDraft & { id?: string })[] }) => writeShifts(remove, add),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.items.table(SHIFTS) }),
  });
}

/**
 * Шаблон в карточку сотрудников — одним upsert-many только с двумя
 * колонками: `DO UPDATE SET` переписывает лишь перечисленные поля
 * (`object_builder storage/postgres/items.go:1544`), остальная карточка
 * не трогается — проверено на живом проекте 2026-10-14. Не PATCH: его
 * под токеном пользователя отклоняет auth (docs/backend-notes.md,
 * «PATCH строк под токеном пользователя»). guid — только из загруженных
 * строк: несуществующий upsert вставил бы пустого сотрудника.
 */
const setEmployeeTemplate = async (employeeIds: string[], templateId: string | null) => {
  for (const ids of chunks(employeeIds)) await upsert(EMPLOYEES, ids.map((guid) => ({ guid, hr_work_schedules_id: templateId })));
};

/**
 * «Применить шаблон»: смены по шаблону на период и шаблон в карточку
 * каждого сотрудника (`hr_employees.hr_work_schedules_id` — им «Шаблоны»
 * считают, кто на шаблоне). С `replace` прежние смены сотрудников
 * в периоде снимаются — разовые тоже, как в прототипе.
 */
export function useApplyTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      employeeIds,
      from,
      to,
      replace,
      add,
    }: {
      templateId: string;
      employeeIds: string[];
      from: string;
      to: string;
      replace: boolean;
      add: ShiftDraft[];
    }) => {
      await writeShifts(replace ? await shiftIdsOf(employeeIds, from, to) : [], add);
      await setEmployeeTemplate(employeeIds, templateId);
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.items.table(SHIFTS) }),
        queryClient.invalidateQueries({ queryKey: keys.items.table(EMPLOYEES) }),
      ]),
  });
}

/**
 * Запись шаблона: строка `hr_work_schedules` и семь дней заново — старые
 * дни удаляются, а не сверяются по дню недели: их всего семь. Удаляются
 * после записи новых: сбой оставит лишние дни, а не шаблон без дней.
 * Новому шаблону guid даём сами. Возвращает guid шаблона.
 */
export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: Template) => {
      const guid = template.id || crypto.randomUUID();
      await upsert(WORK_SCHEDULES, [
        {
          guid,
          name: template.name.trim(),
          color: template.color,
          type: template.type,
          break_minutes: template.breakMinutes,
          grace_minutes: template.graceMinutes,
          description: template.description,
          is_active: template.active,
          cycle_work_days: template.cycle.work,
          cycle_off_days: template.cycle.off,
          cycle_start_time: template.cycle.start,
          cycle_end_time: template.cycle.end,
          cycle_shift_kind: template.cycle.kind,
        },
      ]);
      await upsert(
        WORK_SCHEDULE_DAYS,
        template.days.map((day, index) => ({
          guid: crypto.randomUUID(),
          hr_work_schedules_id: guid,
          weekday: WEEKDAYS[index],
          is_working: day.working,
          start_time: day.working ? day.start : null,
          end_time: day.working ? day.end : null,
          shift_kind: day.kind,
        })),
      );
      if (template.dayIds.length) await api.delete<unknown>(`/v1/object/${WORK_SCHEDULE_DAYS}`, { data: { ids: template.dayIds } });
      return guid;
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.items.table(WORK_SCHEDULES) }),
        queryClient.invalidateQueries({ queryKey: keys.items.table(WORK_SCHEDULE_DAYS) }),
      ]),
  });
}

/**
 * Удаление шаблона с его днями. Смены, уже созданные по нему, остаются;
 * из карточек сотрудников ссылка снимается — иначе там мёртвый guid.
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ template, employeeIds }: { template: Template; employeeIds: string[] }) => {
      await setEmployeeTemplate(employeeIds, null);
      if (template.dayIds.length) await api.delete<unknown>(`/v1/object/${WORK_SCHEDULE_DAYS}`, { data: { ids: template.dayIds } });
      await api.delete<unknown>(`/v1/object/${WORK_SCHEDULES}`, { data: { ids: [template.id] } });
    },
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.items.table(WORK_SCHEDULES) }),
        queryClient.invalidateQueries({ queryKey: keys.items.table(WORK_SCHEDULE_DAYS) }),
        queryClient.invalidateQueries({ queryKey: keys.items.table(EMPLOYEES) }),
      ]),
  });
}
