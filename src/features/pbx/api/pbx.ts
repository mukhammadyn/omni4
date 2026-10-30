import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { useSession } from "@/shared/api/use-session";
import i18n from "@/shared/lib/i18n";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";

/* ---------------- onlinePBX ---------------- */

/**
 * Телефония onlinePBX — общая функция `professional-crm-pbx-integration-call`
 * (репозиторий pbx-fn). Сервис в кластере один на все проекты; проекту
 * нужны только запись функции с этим path и три таблицы, которые она
 * читает: `pbx_settings` (одна строка), `pbx_operators` (пользователь →
 * добавочный), `pbx_calls` (журнал). Порядок и тела — как в new-crm
 * (`src/lib/pbx.ts`).
 */
export const PBX_FUNCTION = "professional-crm-pbx-integration-call";

export type PbxSettings = {
  guid: string;
  domain: string;
  /** Ключ сохранён. Сам ключ на экран не возвращается. */
  hasKey: boolean;
  phone: string;
  enabled: boolean;
};

export type PbxOperator = { guid: string; userId: string; extension: string };

export type PbxUser = { guid: string; name: string };

type Row = Record<string, unknown>;
type ListDto = { data?: { response?: Row[] | null } };

const listRows = (table: string, limit: number) =>
  api
    .post<ListDto>(`/v2/object/get-list/${table}`, { data: { limit, offset: 0 } })
    .then((dto) => dto.data?.response ?? []);

const str = (row: Row, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");

export function usePbx() {
  const envId = useSession().getEnvironmentId() ?? "";

  const query = useQuery({
    queryKey: keys.settings.integration(envId, "pbx"),
    queryFn: async () => {
      const [settings, operators, users] = await Promise.all([
        listRows("pbx_settings", 1),
        listRows("pbx_operators", 1000),
        listRows("core_users", 1000),
      ]);
      const row = settings[0];

      return {
        /* Прежний ключ уезжает обратно, если новый не ввели: строку
           настроек PUT перезаписывает целиком. На экран он не попадает. */
        storedKey: row ? str(row, "api_key") : "",
        settings: row
          ? ({
              guid: str(row, "guid"),
              domain: str(row, "domain"),
              hasKey: Boolean(str(row, "api_key")),
              phone: str(row, "phone_number"),
              enabled: row["enable"] === true,
            } satisfies PbxSettings)
          : null,
        operators: operators.map(
          (op): PbxOperator => ({
            guid: str(op, "guid"),
            userId: str(op, "users_id"),
            extension: str(op, "pbx_extension"),
          }),
        ),
        users: users
          .map((user): PbxUser => ({ guid: str(user, "guid"), name: str(user, "full_name") }))
          .filter((user) => user.guid && user.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    retry: false,
  });

  return { data: query.data, isLoading: query.isLoading, failed: query.isError };
}

/**
 * Запись функции в проекте. Invoke ищет функцию по path в базе проекта,
 * а сервис в кластере общий: нужна только запись. POST сразу с KNATIVE
 * форкнул бы шаблонный репозиторий и завёл пустой сервис — поэтому
 * WORKFLOW, затем PUT в KNATIVE. `max_scale == former_max_scale`
 * обязательно: иначе UpdateFunction перемасштабирует общий сервис всех
 * проектов (new-crm, `ensurePbxFunction`).
 */
async function ensurePbxFunction() {
  type Fn = { id?: string; path?: string; name?: string; type?: string };
  const list = await api.get<{ functions?: Fn[] }>("/v2/function", { params: { limit: 1000 } });
  const functions = list.functions ?? [];
  if (functions.some((fn) => fn.path === PBX_FUNCTION)) return;

  const record = { path: PBX_FUNCTION, name: "Call pbx", description: "pbx-integration-call" };
  const draft =
    functions.find((fn) => fn.type === "WORKFLOW" && fn.name === record.name) ??
    (await api.post<Fn>("/v2/function", { ...record, type: "WORKFLOW" }));
  if (!draft.id) throw new Error("function service returned no id");

  await api.put<unknown>("/v2/function", {
    ...draft,
    ...record,
    type: "KNATIVE",
    max_scale: 3,
    former_max_scale: 3,
  });
}

export type PbxDraft = {
  domain: string;
  /** Пусто — прежний ключ остаётся. */
  apiKey: string;
  phone: string;
  enabled: boolean;
  /** Пользователь → добавочный. Пустой добавочный — оператор убран. */
  extensions: Record<string, string>;
};

export function useSavePbx() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";
  const { data } = usePbx();

  return useMutation({
    mutationFn: async (draft: PbxDraft) => {
      await ensurePbxFunction();

      const current = data?.settings;
      const apiKey = draft.apiKey.trim() || data?.storedKey || "";
      const row = {
        ...(current ? { guid: current.guid } : {}),
        domain: draft.domain.trim(),
        ...(apiKey ? { api_key: apiKey } : {}),
        phone_number: draft.phone.trim(),
        enable: draft.enabled,
      };
      await (current
        ? api.put<unknown>("/v2/items/pbx_settings", { data: row })
        : api.post<unknown>("/v2/items/pbx_settings", { data: row }));

      /* Операторы: шлём только разницу с тем, что было. */
      const before = new Map((data?.operators ?? []).map((op) => [op.userId, op]));
      for (const [userId, raw] of Object.entries(draft.extensions)) {
        const extension = raw.trim();
        const was = before.get(userId);
        if (was && !extension) {
          await api.delete<unknown>(`/v2/items/pbx_operators/${was.guid}`, { data: { data: {} } });
        } else if (was && was.extension !== extension) {
          await api.put<unknown>("/v2/items/pbx_operators", {
            data: { guid: was.guid, users_id: userId, pbx_extension: extension, enabled: true },
          });
        } else if (!was && extension) {
          await api.post<unknown>("/v2/items/pbx_operators", {
            data: { users_id: userId, pbx_extension: extension, enabled: true },
          });
        }
      }
    },
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("settings.saved"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.integration(envId, "pbx") });
    },
  });
}

type CallResult = { success?: boolean; message?: string };

/**
 * Звонок по клику: onlinePBX звонит сначала оператору (номер из
 * настроек), затем клиенту. Отказ функции приходит телом с
 * `success: false`, а не кодом ответа.
 */
export function usePbxCall() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const dto = await api.post<CallResult & { data?: CallResult }>(`/v2/invoke_function/${PBX_FUNCTION}`, {
        data: {
          method: "pbx_make_call",
          object_data: { client_phone: phone, idempotency_key: crypto.randomUUID() },
        },
      });
      const result = dto.data ?? dto;
      if (result.success === false) throw new Error(result.message || "PBX rejected the call");
    },
    onError: (error) => reportError(error, "pbx.callFailed"),
    onSuccess: () => toast.success(i18n.t("pbx.calling")),
  });
}

/** onlinePBX включён в проекте. Без этого кнопки «Позвонить» нет. */
export function usePbxEnabled() {
  const envId = useSession().getEnvironmentId() ?? "";
  const query = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "enabled"],
    queryFn: () => listRows("pbx_settings", 1).then((rows) => rows[0]?.["enable"] === true),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data === true;
}

/**
 * Куда звонить из открытой записи. Телефон лежит в разных местах:
 * у контакта и компании — своё поле `phone`, у сделки — телефон
 * связанного контакта (`crm_contacts_id_data.phone`, связанная строка
 * приезжает в ответе целиком). Одно правило здесь, а не в экране.
 */
export function phoneToCall(tableSlug: string, row: Record<string, unknown>): string {
  const own = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  if (tableSlug === "crm_contacts" || tableSlug === "crm_companies") return own(row["phone"]);
  if (tableSlug === "crm_deals") {
    const contact = row["crm_contacts_id_data"];
    return contact && typeof contact === "object" ? own((contact as Record<string, unknown>)["phone"]) : "";
  }
  return "";
}

/**
 * Вызов метода функции. Успех шлюз отдаёт `{status, data}` от функции
 * (после разворота конверта клиентом), отказ — 400 с текстом ошибки
 * (`knative.go`: `resp.Status == "error"` → `HandleResponse(InvalidArgument, message)`).
 */
async function invoke<T>(method: string, objectData: Record<string, unknown> = {}): Promise<T> {
  const dto = await api.post<{ data?: T }>(`/v2/invoke_function/${PBX_FUNCTION}`, {
    data: { method, object_data: objectData },
  });
  return (dto.data ?? dto) as T;
}

export type WebRtcCredentials = { host: string; login: string; password: string; extension: string };

/**
 * Вход оператора в onlinePBX для звонка из браузера (Verto). Оператора
 * функция находит сама — по `user_id` из токена в `pbx_operators`.
 */
export function fetchWebRtcCredentials(): Promise<WebRtcCredentials> {
  return invoke<{ host?: string; login?: string; verto_password?: string; extension?: string }>(
    "pbx_get_webrtc_credentials",
  ).then((dto) => {
    if (!dto.host || !dto.login || !dto.verto_password) throw new Error("PBX_OPERATOR_NOT_CONFIGURED");
    return { host: dto.host, login: dto.login, password: dto.verto_password, extension: dto.extension ?? "" };
  });
}

/** Звонок из браузера закончился — строка в журнал (`pbx_calls`). */
export function logWebRtcCall(input: { phone: string; duration: number; status: string }) {
  return invoke<unknown>("pbx_log_call", {
    client_phone: input.phone,
    duration: Math.max(0, Math.round(input.duration)),
    status: input.status,
  });
}

/* ---------------- Журнал ---------------- */

export type PbxCall = {
  guid: string;
  at: string;
  /** Сотрудник по `users_id`; пусто — звонок без оператора. */
  userName: string;
  phone: string;
  direction: string;
  status: string;
  duration: number;
  callUuid: string;
  recording: string;
};

const PAGE = 50;

export function useCallLog(page: number, search: string) {
  const envId = useSession().getEnvironmentId() ?? "";

  const calls = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "calls", page, search],
    queryFn: () =>
      api.post<{ data?: { count?: number; response?: Row[] | null } }>("/v2/object/get-list/pbx_calls", {
        data: {
          limit: PAGE,
          offset: (page - 1) * PAGE,
          /* Без order: строки и так приходят новыми вперёд, а сортировка
             по одному created_at роняет запрос (backend-notes,
             «Сортировка по created_at в get-list»). */
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
    placeholderData: (previous) => previous,
  });

  /* Имена сотрудников: в журнале guid строкой (функция пишет `users_id`
     без связи), подпись берём из `core_users`. */
  const users = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "users"],
    queryFn: () => listRows("core_users", 1000),
    staleTime: 5 * 60_000,
  });
  const names = new Map((users.data ?? []).map((user) => [str(user, "guid"), str(user, "full_name")]));

  return {
    calls: (calls.data?.data?.response ?? []).map(
      (row): PbxCall => ({
        guid: str(row, "guid"),
        at: str(row, "created_at"),
        userName: names.get(str(row, "users_id")) ?? "",
        phone: str(row, "client_phone"),
        direction: str(row, "direction"),
        status: str(row, "status"),
        duration: typeof row["duration"] === "number" ? row["duration"] : 0,
        callUuid: str(row, "call_uuid"),
        recording: str(row, "recording_url"),
      }),
    ),
    count: calls.data?.data?.count ?? 0,
    pageSize: PAGE,
    isLoading: calls.isLoading,
  };
}

/**
 * Запись разговора. Функция ищет её в истории onlinePBX, кладёт в CDN
 * проекта и запоминает в строке; пока onlinePBX её не отдал — `pending`.
 */
export function useCallRecording() {
  return useMutation({
    mutationFn: (callUuid: string) =>
      invoke<{ status?: string; recording_url?: string }>("pbx_get_recording", { call_uuid: callUuid }),
    onError: (error) => reportError(error, "pbx.recordingFailed"),
  });
}

/**
 * Входящий звонок — строка в журнал напрямую, мимо функции:
 * `pbx_log_call` пишет только `client_phone/status/duration` и
 * направления не знает (pbx-fn, functions/pbx_webrtc.go, PBXLogCall),
 * а пропущенный от исходящего иначе не отличить. Оператор — тот же
 * `users_id`, что функция берёт из токена.
 */
export function logIncomingCall(input: { phone: string; duration: number; status: string }) {
  return api.post<unknown>("/v2/items/pbx_calls", {
    data: {
      client_phone: input.phone,
      direction: "incoming",
      status: input.status,
      duration: Math.max(0, Math.round(input.duration)),
      users_id: session.getUserId(),
    },
  });
}

/**
 * Кто звонит: контакт, иначе компания с этим номером. Сравниваем по
 * последним 9 цифрам — АТС присылает номер то с кодом страны, то без,
 * а текстовый фильтр get-list ищет подстроку. Номер в базе хранится
 * сплошными цифрами (`+998901234567`); с пробелами внутри не найдётся.
 */
export function useCallerName(phone: string): string {
  const envId = useSession().getEnvironmentId() ?? "";
  const digits = phone.replace(/\D+/g, "").slice(-9);

  const query = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "caller", digits],
    enabled: digits.length === 9,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      for (const [table, field] of [
        ["crm_contacts", "full_name"],
        ["crm_companies", "name"],
      ] as const) {
        const dto = await api.post<ListDto>(`/v2/object/get-list/${table}`, { data: { limit: 1, phone: digits } });
        const row = dto.data?.response?.[0];
        if (row) return str(row, field);
      }
      return "";
    },
  });
  return query.data ?? "";
}
