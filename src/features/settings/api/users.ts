import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_LIMIT, PEOPLE, useDeleteItems, useItems, type Item } from "@/features/item";
import { api, authApi } from "@/shared/api/client";
import i18n from "@/shared/lib/i18n";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";

/** Не из `@/features/hrms`: та сама импортирует настройки ради этого диалога. */
const EMPLOYEES = "hr_employees";

/**
 * Люди проекта — строки `core_users` (PEOPLE), таблицы входа типа
 * «Сотрудник» (ERP-TEMPLATE, §2).
 *
 * Строка и учётка — не одно и то же. Строку можно завести без входа
 * (`from_auth_service: true` — object builder не зовёт auth,
 * `ob/storage/postgres/items.go:361`), а вход дать позже. Есть ли
 * вход — по `user_id_auth`: его ставит только синхронизация с auth.
 * `login` пуст и у тех, кто входит по почте, — по нему судить нельзя.
 */
export type ProjectUser = {
  id: string;
  name: string;
  login: string;
  email: string;
  phone: string;
  roleId: string;
  hasLogin: boolean;
};

export type UserDraft = {
  /** Сотрудник, к которому привязывается строка (`core_users.hr_employees_id`). */
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  /** Дать вход: тогда обязательны логин и пароль. */
  access: boolean;
  login: string;
  password: string;
};

export const USERS_PAGE = 20;

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function toUser(row: Item): ProjectUser {
  return {
    id: str(row.guid),
    name: str(row.full_name),
    login: str(row.login),
    email: str(row.email),
    phone: str(row.phone),
    roleId: str(row.role_id),
    hasLogin: Boolean(str(row.user_id_auth)),
  };
}

/** Сотрудник без строки в `core_users` — кандидат во «Новый пользователь». */
export type FreeEmployee = { id: string; name: string; email: string; phone: string };

/**
 * Сотрудники, которых ещё нет в `core_users`. Обе таблицы целиком,
 * без связей: людей сотни, а не десятки тысяч.
 * ponytail: MAX_LIMIT (1000) на таблицу — за ним список обрежется, тогда отбор на сервере.
 */
export function useFreeEmployees(enabled = true) {
  const query = { limit: MAX_LIMIT, page: 1, relations: false } as const;
  const employees = useItems(enabled ? EMPLOYEES : undefined, query);
  const users = useItems(enabled ? PEOPLE : undefined, query);
  const taken = new Set(users.page.rows.map((row) => str(row.hr_employees_id)));
  const free: FreeEmployee[] = employees.page.rows
    .filter((row) => !taken.has(str(row.guid)))
    .map((row) => ({
      id: str(row.guid),
      name: str(row.full_name),
      email: str(row.email),
      phone: str(row.phone),
    }));
  return { employees: free, isLoading: employees.isLoading || users.isLoading };
}

export function useUsers({ search, page, limit }: { search: string; page: number; limit: number }) {
  const { page: data, isLoading } = useItems(PEOPLE, { limit, page, search, relations: false });
  return { users: data.rows.map(toUser), count: data.count, isLoading };
}

/** Пустая строка — null: пустой email в уникальной колонке столкнулся бы с чужим. */
const orNull = (value: string) => value.trim() || null;

/**
 * Поля строки и то, как с ней обойдётся auth:
 * - `grant` — логин и пароль уходят, синхронизация заводит по ним
 *   учётку (`items.go:406` при создании, `UpdateLoginStrategy` в auth
 *   при правке строки без учётки);
 * - `sync` — вход уже есть: правка почты, телефона, логина доезжает
 *   до учётки, пароль не трогаем;
 * - `row` — только строка (`from_auth_service`), иначе новая почта
 *   сама завела бы учётку без пароля.
 */
type AuthMode = "grant" | "sync" | "row";

function toBody(draft: UserDraft, mode: AuthMode) {
  const fields = {
    full_name: draft.name.trim(),
    email: orNull(draft.email),
    phone: orNull(draft.phone),
    role_id: draft.roleId,
    ...(draft.employeeId ? { hr_employees_id: draft.employeeId } : {}),
  };
  if (mode === "grant") return { ...fields, login: draft.login.trim(), password: draft.password };
  if (mode === "sync") return { ...fields, login: orNull(draft.login) };
  return { ...fields, from_auth_service: true };
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.items.table(PEOPLE) });
}

/** Тип клиента обязателен строке таблицы входа, даже без учётки: без него позже вход не дать. */
export function useCreateUser(clientTypeId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (draft: UserDraft) =>
      api.post<unknown>(`/v2/items/${PEOPLE}`, {
        data: { ...toBody(draft, draft.access ? "grant" : "row"), client_type_id: clientTypeId },
      }),
    onError: (error) => reportError(error, "common.createFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("users.created"));
      await invalidate();
    },
  });
}

/** Правка; режим — см. `toBody`. */
export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ user, draft }: { user: ProjectUser; draft: UserDraft }) => {
      const mode: AuthMode = user.hasLogin ? "sync" : draft.access ? "grant" : "row";
      return api.put<unknown>(`/v2/items/${PEOPLE}`, { data: { guid: user.id, ...toBody(draft, mode) } });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("settings.saved"));
      await invalidate();
    },
  });
}

export function useDeleteUser() {
  return useDeleteItems(PEOPLE);
}

/**
 * Новый пароль чужой учётке — «Сгенерировать пароль» старого HRMS.
 * Ручка смены своего пароля, но прежний auth только меряет (≥ 6 символов)
 * и не сверяет (`auth/grpc/service/user_service_v2.go:1565`), а строку ищет
 * по guid `core_users` (`ob/storage/postgres/login.go:587`). Поэтому вместо
 * прежнего уходит сам новый пароль.
 */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, clientTypeId, password }: { userId: string; clientTypeId: string; password: string }) =>
      authApi.put<unknown>("/v2/user/reset-password", {
        user_id: userId,
        client_type_id: clientTypeId,
        old_password: password,
        password,
      }),
    onError: (error) => reportError(error, "settings.passwordFailed"),
  });
}

