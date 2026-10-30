import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileUrl } from "@/features/item";
import { api } from "@/shared/api/client";
import { session } from "@/shared/api/session";
import { useSession } from "@/shared/api/use-session";
import i18n from "@/shared/lib/i18n";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";
import { parseTranscript, type TranscriptLine } from "../model/transcript";

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

/**
 * Коды отказа `pbx_get_webrtc_credentials`, при которых человек всё же
 * оператор: добавочный есть, не вышло только с WebRTC. Ему — звонок
 * старым путём (`pbx_make_call`). Остальные отказы — «телефонии нет»:
 * выключена, не оператор, нет настроек или самой функции
 * (pbx-fn, functions/pbx_webrtc.go, PBXGetWebRTCCredentials).
 */
const FALLBACK_CODES = [
  "PBX_OPERATOR_NOT_FOUND",
  "PBX_WEBRTC_NOT_AVAILABLE",
  "PBX_VERTO_HOST_NOT_CONFIGURED",
  "PBX_AUTH_FAILED",
  "PBX_PROVIDER_ERROR",
];

export type PbxMode = "off" | "fallback" | "verto";

/**
 * Что может этот человек: звонить из браузера, только старым путём
 * или никак. Спрашиваем функцию, а не читаем `pbx_settings`: в той
 * строке ключ API onlinePBX, и читать её нужно только экрану настроек
 * — иначе ключ уезжает в браузер каждому сотруднику.
 *
 * ponytail: временный `PBX_PROVIDER_ERROR` держит «старый путь» до
 * перезапроса (5 минут или возврат на вкладку).
 */
export function usePbxMode(): PbxMode {
  const envId = useSession().getEnvironmentId() ?? "";
  const query = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "mode"],
    queryFn: () =>
      fetchWebRtcCredentials().then(
        (): PbxMode => "verto",
        (error: unknown): PbxMode => {
          const message = error instanceof Error ? error.message : String(error);
          return FALLBACK_CODES.some((code) => message.includes(code)) ? "fallback" : "off";
        },
      ),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? "off";
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

/**
 * Звонок из браузера закончился — строка в журнал (`pbx_calls`).
 *
 * Пишем сами, мимо `pbx_log_call`: та не сохраняет ни направления, ни
 * `call_uuid` (pbx-fn, functions/pbx_webrtc.go, PBXLogCall), а без
 * `call_uuid` `pbx_get_recording` звонка не найдёт. Id звонка Verto —
 * он же uuid звонка в onlinePBX (так в new-crm, `savePbxCallHistory`).
 * Оператор — тот же `users_id`, что функция берёт из токена.
 */
export function logCall(input: {
  callId: string;
  phone: string;
  direction: "incoming" | "outgoing";
  status: string;
  duration: number;
}) {
  return api.post<unknown>("/v2/items/pbx_calls", {
    data: {
      call_uuid: input.callId,
      idempotency_key: input.callId,
      /* Только цифры и ведущий «+», как нормализует функция для своих
         строк (pbxNormalizeDial): иначе один номер в журнале в трёх видах. */
      client_phone: input.phone.trim().replace(/(?!^\+)\D/g, ""),
      direction: input.direction,
      status: input.status,
      duration: Math.max(0, Math.round(input.duration)),
      users_id: session.getUserId(),
    },
  });
}

/**
 * Запись разговора: адрес в CDN проекта или пусто, пока onlinePBX её
 * не отдал (`pending`). Функция сама кладёт адрес в строку журнала.
 */
export function fetchRecording(callUuid: string): Promise<string> {
  return invoke<{ status?: string; recording_url?: string }>("pbx_get_recording", { call_uuid: callUuid }).then(
    (dto) => fileUrl(dto.recording_url ?? ""),
  );
}

/**
 * Свои принятые звонки за сутки без записи — дотянуть после
 * перезагрузки: вкладку могли закрыть, пока onlinePBX готовил файл.
 */
export async function callsWithoutRecording(): Promise<string[]> {
  const dto = await api.post<ListDto>("/v2/object/get-list/pbx_calls", {
    data: { limit: 20, offset: 0, users_id: session.getUserId(), status: "answered" },
  });
  const since = Date.now() - 24 * 3600_000;
  return (dto.data?.response ?? [])
    /* Короче 5 с записи обычно нет вовсе — не спрашивать её каждую загрузку. */
    .filter(
      (row) =>
        !str(row, "recording_url") &&
        Number(row["duration"]) >= 5 &&
        Date.parse(str(row, "created_at")) > since,
    )
    .map((row) => str(row, "call_uuid"))
    .filter(Boolean);
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
  /** Текст разговора от воркера распознавания; пусто — ещё нет. */
  transcript: TranscriptLine[];
};

const PAGE = 50;

/**
 * Отбор журнала. Пусто — без отбора. Текстовый фильтр get-list ищет
 * подстроку, но значения здесь из закрытого списка (`incoming`,
 * `no_answer`, guid), и ложных совпадений между ними нет.
 */
export type CallLogFilter = { direction: string; status: string; userId: string };

/**
 * Имена сотрудников: в журнале guid строкой (функция пишет `users_id`
 * без связи), подпись берём из `core_users`.
 */
function useUserNames(): Map<string, string> {
  const envId = useSession().getEnvironmentId() ?? "";
  const users = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "users"],
    queryFn: () => listRows("core_users", 1000),
    staleTime: 5 * 60_000,
  });
  return new Map((users.data ?? []).map((user) => [str(user, "guid"), str(user, "full_name")]));
}

const toCall = (row: Row, names: Map<string, string>): PbxCall => ({
  guid: str(row, "guid"),
  at: str(row, "created_at"),
  userName: names.get(str(row, "users_id")) ?? "",
  phone: str(row, "client_phone"),
  direction: str(row, "direction"),
  status: str(row, "status"),
  duration: typeof row["duration"] === "number" ? row["duration"] : 0,
  callUuid: str(row, "call_uuid"),
  /* Функция кладёт путь в CDN проекта без хоста (`<проект>/Media/<файл>`). */
  recording: fileUrl(str(row, "recording_url")),
  transcript: parseTranscript(row["transcript"]),
});

/**
 * Звонки по номеру открытой записи — вкладка «Звонки» карточки.
 * Связи с контактом у `pbx_calls` нет (строку пишут функция и
 * софтфон, о карточках они не знают), поэтому — по последним 9 цифрам,
 * как и «кто звонит» (useCallerName). 100 последних.
 */
export function useRecordCalls(phone: string) {
  const envId = useSession().getEnvironmentId() ?? "";
  const digits = phone.replace(/\D+/g, "").slice(-9);
  const names = useUserNames();

  const calls = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "calls", "record", digits],
    enabled: digits.length === 9,
    queryFn: () =>
      api
        .post<ListDto>("/v2/object/get-list/pbx_calls", { data: { limit: 100, offset: 0, client_phone: digits } })
        .then((dto) => dto.data?.response ?? []),
  });

  return {
    calls: (calls.data ?? []).map((row) => toCall(row, names)),
    isLoading: calls.isLoading && digits.length === 9,
  };
}

export function useCallLog(page: number, search: string, filter: CallLogFilter) {
  const envId = useSession().getEnvironmentId() ?? "";

  const calls = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "calls", page, search, filter],
    queryFn: () =>
      api.post<{ data?: { count?: number; response?: Row[] | null } }>("/v2/object/get-list/pbx_calls", {
        data: {
          limit: PAGE,
          offset: (page - 1) * PAGE,
          /* Без order: строки и так приходят новыми вперёд, а сортировка
             по одному created_at роняет запрос (backend-notes,
             «Сортировка по created_at в get-list»). */
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(filter.direction ? { direction: filter.direction } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.userId ? { users_id: filter.userId } : {}),
        },
      }),
    placeholderData: (previous) => previous,
  });

  const names = useUserNames();

  /* Кого предложить в отборе «Сотрудник» — операторов, а не всех людей. */
  const operators = useQuery({
    queryKey: [...keys.settings.integration(envId, "pbx"), "operators"],
    queryFn: () => listRows("pbx_operators", 1000),
    staleTime: 5 * 60_000,
  });

  return {
    operators: (operators.data ?? [])
      .map((op) => ({ value: str(op, "users_id"), label: names.get(str(op, "users_id")) ?? "" }))
      .filter((op) => op.value && op.label)
      .sort((a, b) => a.label.localeCompare(b.label)),
    calls: (calls.data?.data?.response ?? []).map((row) => toCall(row, names)),
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
    mutationFn: fetchRecording,
    onError: (error) => reportError(error, "pbx.recordingFailed"),
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
