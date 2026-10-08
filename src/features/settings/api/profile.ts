import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useItems } from "@/features/item";
import { authApi } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { useSession } from "@/shared/api/use-session";
import { setTimeZone } from "@/shared/lib/date-value";
import i18n from "@/shared/lib/i18n";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";

/**
 * Профиль человека и его сессии.
 *
 * Живут на сервере авторизации (VITE_AUTH_URL), а не на шлюзе: это
 * настройки пользователя, а не проекта. Отсюда authApi вместо api.
 */

type UserDto = {
  id?: string;
  guid?: string;
  name?: string;
  login?: string;
  email?: string;
  phone?: string;
  photo_url?: string;
  role_id?: string;
  client_type_id?: string;
};

export type Profile = {
  id: string;
  name: string;
  login: string;
  email: string;
  phone: string;
  photoUrl: string;
  /** Ответ целиком: PUT перезаписывает строку, и терять чужие поля нельзя. */
  raw: Record<string, unknown>;
};

export function useProfile() {
  const store = useSession();
  /*
   * Профиль живёт в auth-сервисе, и знает он СВОЙ идентификатор
   * пользователя (`user_id_auth`), а не строку в таблице входа проекта.
   * С обычным `user_id` ручка отвечает «no rows in result set».
   */
  const userId = store.getAuthUserId();

  /*
   * Тип клиента обязателен и живёт только в токене: без него ручка
   * отвечает «client type id is an invalid uuid» (auth_service,
   * user_v2.go:191). В ответе логина его нет вовсе.
   */
  const clientTypeId = store.getClientTypeId();

  const query = useQuery({
    queryKey: keys.settings.profile(userId),
    queryFn: () =>
      authApi.get<UserDto>(`/v2/user/${userId}`, {
        params: { "client-type-id": clientTypeId, "project-id": store.getProjectId() ?? "" },
      }),
    enabled: Boolean(userId) && Boolean(clientTypeId),
    // Свой профиль человек меняет раз в год.
    staleTime: 5 * 60_000,
    select: toProfile,
  });

  return { profile: query.data, isLoading: query.isLoading };
}

export type ProfileDraft = {
  name: string;
  login: string;
  email: string;
  phone: string;
  /** Адрес фотографии в нашем CDN. Пусто — фотографии нет. */
  photo: string;
};

/**
 * Правка профиля.
 *
 * Тело — поверх ответа: PUT /v2/user принимает строку целиком, и
 * собранное заново тело обнулило бы роль, тип клиента и проект —
 * человек перестал бы существовать в своей же роли.
 *
 * Имя дублируется в сессию: в сайдбаре оно берётся оттуда, и без этого
 * шапка показывала бы прежнее до следующего входа.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const store = useSession();
  // Тот же идентификатор, что у чтения профиля, — иначе перезапрос
  // после сохранения промахивается мимо своей ячейки кэша.
  const userId = store.getAuthUserId();

  return useMutation({
    mutationFn: ({ profile, draft }: { profile: Profile; draft: ProfileDraft }) =>
      authApi.put<unknown>("/v2/user", {
        ...profile.raw,
        id: profile.id,
        name: draft.name.trim(),
        login: draft.login.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        photo_url: draft.photo,
      }),

    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: async (_data, { draft }) => {
      const current = session.getProfile();
      // Имя и фотография дублируются в сессию: шапка сайдбара берёт их
      // оттуда, и без этого она показывала бы прежние до следующего входа.
      if (current) {
        session.setProfile({ ...current, name: draft.name.trim(), photo: draft.photo });
      }

      toast.success(i18n.t("settings.saved"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.profile(userId) });
    },
  });
}

/** Учётные записи — таблица входа типа «Сотрудник» (ADR-0014). */
const USERS = "users";

/**
 * Пояс пользователя — [[User Timezone]], `users.timezone_id` своей строки.
 *
 * Строка ищется по `user_id_auth`, а не по `user_id` токена: так она
 * одна и та же при любом входе. У ADMIN строки в `users` нет —
 * `hasAccount: false`, и личного пояса у него нет (ADR-0014).
 *
 * `GET /v2/user/{id}` пояс не отдаёт: из строки входа он берёт только
 * роль, тип клиента, `active` и имя (auth_service, user_service_v2.go:778).
 */
export function useUserTimezone() {
  const authId = useSession().getAuthUserId();
  const { page, isLoading } = useItems(authId ? USERS : undefined, {
    limit: 1,
    page: 1,
    filters: { user_id_auth: { op: "contains", values: [authId] } },
  });
  const row = page.rows[0];

  return {
    hasAccount: Boolean(row),
    timezone: typeof row?.timezone_id === "string" ? row.timezone_id : "",
    isLoading,
  };
}

/**
 * Смена пояса — тем же `PUT /v2/user`, что и профиль: auth передаёт тело
 * в таблицу входа, и та пишет каждое поле, у которого есть колонка
 * с тем же слагом (object_builder storage/postgres/items.go:1590).
 * Отсюда и слаг `timezone_id`: это поле тела (user_service.proto:243).
 *
 * Тело — поверх ответа профиля: без `company_id` ручка падает на пустом
 * uuid, а собранное заново обнулило бы роль и тип клиента.
 */
export function useUpdateTimezone() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: (timezone: string) => {
      if (!profile) throw new Error("profile is not loaded");
      return authApi.put<unknown>("/v2/user", { ...profile.raw, id: profile.id, timezone_id: timezone });
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: async (_data, timezone) => {
      setTimeZone(timezone);
      await queryClient.invalidateQueries({ queryKey: keys.items.table(USERS) });
    },
  });
}

/**
 * Смена пароля. Отдельная ручка и отдельная форма: пароль не правится
 * вместе с телефоном — для него нужен прежний, и ошибка в нём означает
 * не «не сохранилось», а «это не вы».
 */
export function useChangePassword() {
  const store = useSession();

  return useMutation({
    mutationFn: ({ oldPassword, password }: { oldPassword: string; password: string }) =>
      authApi.put<unknown>("/v2/user/reset-password", {
        user_id: store.getUserId(),
        client_type_id: store.getClientTypeId(),
        old_password: oldPassword,
        password,
      }),

    onError: (error) => reportError(error, "settings.passwordFailed"),
    onSuccess: () => toast.success(i18n.t("settings.passwordChanged")),
  });
}

export type UserSession = {
  id: string;
  /** Откуда вошли: платформа и устройство, как их записал сервер. */
  device: string;
  ip: string;
  updatedAt: string;
  /** Текущая сессия — та, из которой смотрят. Её не закрывают кнопкой. */
  current: boolean;
};

type SessionDto = {
  id?: string;
  ip?: string;
  data?: string;
  platform?: string;
  device?: string;
  updated_at?: string;
  is_current?: boolean;
};

type SessionsResponse = { sessions?: SessionDto[] };

/** Открытые сессии человека — где он ещё залогинен. */
export function useSessions(enabled = true) {
  const store = useSession();
  const userId = store.getUserId();

  const query = useQuery({
    queryKey: keys.settings.sessions(userId),
    queryFn: () =>
      authApi.get<SessionsResponse>("/v2/session", {
        params: {
          user_id: userId,
          client_type_id: store.getClientTypeId(),
          limit: 50,
          offset: 0,
        },
      }),
    enabled: enabled && Boolean(userId),
    // Список коротких живых записей: держим свежее остальных настроек.
    staleTime: 30_000,
    select: (data) =>
      (data.sessions ?? [])
        .filter((dto) => dto.id)
        .map(
          (dto): UserSession => ({
            id: dto.id!,
            device: [dto.platform, dto.device, dto.data].map((part) => part?.trim()).filter(Boolean).join(" · "),
            ip: dto.ip ?? "",
            updatedAt: dto.updated_at ?? "",
            current: dto.is_current === true,
          }),
        ),
  });

  return { sessions: query.data ?? [], isLoading: query.isLoading };
}

/** Закрыть чужую сессию: выход с того устройства. */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  const userId = useSession().getUserId();

  return useMutation({
    mutationFn: (id: string) => authApi.delete<unknown>(`/v2/session/${id}`),
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("settings.sessionClosed"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.sessions(userId) });
    },
  });
}

export function toProfile(dto: UserDto): Profile {
  return {
    id: dto.id || dto.guid || "",
    name: dto.name?.trim() ?? "",
    login: dto.login?.trim() ?? "",
    email: dto.email?.trim() ?? "",
    phone: dto.phone?.trim() ?? "",
    photoUrl: dto.photo_url ?? "",
    raw: { ...dto },
  };
}
