import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/shared/api/client";
import { useSession } from "@/shared/api/use-session";
import i18n from "@/shared/lib/i18n";
import { keys } from "@/shared/lib/query-keys";
import { reportError, toast } from "@/shared/lib/toast";

/**
 * Интеграции CRM: лиды из Meta и Google Ads, звонки «Моих Звонков».
 *
 * Это не ресурсы проекта из каталога выше, хотя Meta и Google сами
 * заводят себе строки ресурсов (META_LEADS, GOOGLE_LEADS). У каждой
 * своя ручка шлюза, и подключение идёт через неё: OAuth у Meta,
 * сопоставление полей формы у Google, ключ API у «Моих Звонков».
 * Поведение — по new-crm (`SettingsIntegrations.tsx`, `MoizvonkiIntegration.tsx`).
 */

/* ---------------- Meta (лид-формы Facebook) ---------------- */

export type MetaPage = {
  resourceId: string;
  pageId: string;
  pageName: string;
  status: string;
  connectedAt: string;
};

type MetaStatusDto = { connected?: boolean; active?: boolean; reason?: string };
type MetaPagesDto = {
  integrations?: {
    resource_id?: string;
    page_id?: string;
    page_name?: string;
    status?: string;
    connected_at?: string;
  }[];
};

export function useMetaLeads() {
  const envId = useSession().getEnvironmentId() ?? "";

  const status = useQuery({
    queryKey: keys.settings.integration(envId, "facebook"),
    queryFn: () => api.get<MetaStatusDto>("/v1/facebook/status"),
    retry: false,
  });
  const connected = Boolean(status.data?.connected);

  const pages = useQuery({
    queryKey: [...keys.settings.integration(envId, "facebook"), "pages"],
    queryFn: () => api.get<MetaPagesDto>("/v1/facebook/integration"),
    enabled: connected,
    retry: false,
  });

  return {
    connected,
    /** Токен страницы протух — подключение есть, лиды не идут. */
    active: Boolean(status.data?.active),
    reason: status.data?.reason ?? "",
    pages: (pages.data?.integrations ?? []).map(
      (dto): MetaPage => ({
        resourceId: dto.resource_id ?? "",
        pageId: dto.page_id ?? "",
        pageName: dto.page_name ?? "",
        status: dto.status ?? "",
        connectedAt: dto.connected_at ?? "",
      }),
    ),
    isLoading: status.isLoading,
    failed: status.isError,
    refetch: () => void status.refetch().then(() => pages.refetch()),
  };
}

/**
 * Начать подключение Meta: шлюз отдаёт адрес OAuth, и сам же принимает
 * возврат (`/v1/facebook/callback`), после чего уводит на `redirect_uri`
 * с `?facebook=success|error`. Открываем отдельной вкладкой и перечитываем
 * статус на возврат фокуса — как аккаунты репозиториев (integrations.ts).
 */
export function useConnectMeta() {
  return useMutation({
    mutationFn: () =>
      api.get<string | { url?: string; auth_url?: string }>("/v1/facebook/connect", {
        params: { redirect_uri: window.location.href },
      }),
    onError: (error) => reportError(error, "integrations.connectFailed"),
    onSuccess: (dto) => {
      const url = typeof dto === "string" ? dto : (dto.auth_url ?? dto.url ?? "");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
  });
}

export function useDisconnectMeta() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";

  return useMutation({
    mutationFn: (resourceId: string) => api.delete<unknown>(`/v1/facebook/integration/${resourceId}`),
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("integrations.disconnected"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.integration(envId, "facebook") });
    },
  });
}

/* ---------------- Google Ads (лид-формы) ---------------- */

export type GoogleColumn = { id: string; label: string };

export type GoogleMappingRow = { column: string; field: string; required: boolean };

export type GoogleForm = {
  resourceId: string;
  formName: string;
  formId: string;
  tableSlug: string;
  /** Ключ и адрес, которые вставляют в настройки формы в Google Ads. */
  key: string;
  webhookUrl: string;
  fields: GoogleMappingRow[];
};

export type GoogleFormDraft = Pick<GoogleForm, "formName" | "formId" | "tableSlug" | "fields">;

type GoogleFormsDto = {
  integrations?: {
    resource_id?: string;
    google_key?: string;
    webhook_url?: string;
    form_id?: string;
    form_name?: string;
    table_slug?: string;
    fields?: { lead_column?: string; table_field?: string; required?: boolean }[];
  }[];
};

type GoogleCreatedDto = { resource_id?: string; google_key?: string; webhook_url?: string };

export function useGoogleLeads() {
  const envId = useSession().getEnvironmentId() ?? "";

  const forms = useQuery({
    queryKey: keys.settings.integration(envId, "google-leads"),
    queryFn: () => api.get<GoogleFormsDto>("/v1/google-leads/integration"),
    retry: false,
  });

  const columns = useQuery({
    queryKey: [...keys.settings.integration(envId, "google-leads"), "columns"],
    queryFn: () => api.get<{ columns?: { column_id?: string; label?: string }[] }>("/v1/google-leads/columns"),
    staleTime: Infinity,
  });

  return {
    forms: (forms.data?.integrations ?? []).map(
      (dto): GoogleForm => ({
        resourceId: dto.resource_id ?? "",
        formName: dto.form_name ?? "",
        formId: dto.form_id ?? "",
        tableSlug: dto.table_slug ?? "",
        key: dto.google_key ?? "",
        webhookUrl: dto.webhook_url ?? "",
        fields: (dto.fields ?? []).map((field) => ({
          column: field.lead_column ?? "",
          field: field.table_field ?? "",
          required: Boolean(field.required),
        })),
      }),
    ),
    columns: (columns.data?.columns ?? [])
      .filter((column) => column.column_id)
      .map((column): GoogleColumn => ({ id: column.column_id!, label: column.label || column.column_id! })),
    isLoading: forms.isLoading,
    failed: forms.isError,
  };
}

const toGoogleBody = (draft: GoogleFormDraft) => ({
  form_name: draft.formName.trim(),
  form_id: draft.formId.trim(),
  table_slug: draft.tableSlug,
  fields: draft.fields
    .filter((row) => row.column && row.field)
    .map((row) => ({ lead_column: row.column, table_field: row.field, required: row.required })),
});

/** Новая форма или правка сопоставления существующей. */
export function useSaveGoogleForm() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";

  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: GoogleFormDraft }) =>
      id
        ? api.put<GoogleCreatedDto>(`/v1/google-leads/mapping/${id}`, toGoogleBody(draft))
        : api.post<GoogleCreatedDto>("/v1/google-leads", toGoogleBody(draft)),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("settings.saved"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.integration(envId, "google-leads") });
    },
  });
}

export function useDeleteGoogleForm() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";

  return useMutation({
    mutationFn: (id: string) => api.delete<unknown>(`/v1/google-leads/integration/${id}`),
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSuccess: async () => {
      toast.success(i18n.t("integrations.disconnected"));
      await queryClient.invalidateQueries({ queryKey: keys.settings.integration(envId, "google-leads") });
    },
  });
}

/* ---------------- «Мои Звонки» ---------------- */

export type Moizvonki = {
  connected: boolean;
  /** Синхронизация звонков включена. */
  polling: boolean;
  account: string;
  syncError: string;
  /** Хранилище ключей шлюза готово. Нет — подключать некуда. */
  ready: boolean;
};

type MoizvonkiDto = {
  connected?: boolean;
  polling?: boolean;
  secure_storage_ready?: boolean;
  account?: string;
  sync_error?: string;
};

/* Ручка просит проект параметром, а не берёт из ключа (как new-crm). */
function useProjectParams() {
  return { "project-id": useSession().getProjectId() ?? "" };
}

export function useMoizvonki() {
  const envId = useSession().getEnvironmentId() ?? "";
  const params = useProjectParams();

  const query = useQuery({
    queryKey: keys.settings.integration(envId, "moizvonki"),
    queryFn: () => api.get<MoizvonkiDto>("/v1/moizvonki/connection", { params }),
    retry: false,
  });
  const dto = query.data;

  return {
    connection: dto
      ? ({
          connected: Boolean(dto.connected),
          polling: Boolean(dto.polling),
          account: dto.account ?? "",
          syncError: dto.sync_error ?? "",
          ready: dto.secure_storage_ready !== false,
        } satisfies Moizvonki)
      : undefined,
    isLoading: query.isLoading,
    failed: query.isError,
    /* 403 «workspace integration administrator required»: подключать
       может только администратор интеграций, и сказать это прямо
       полезнее, чем «недоступно». */
    forbidden: query.error instanceof ApiError && query.error.status === 403,
    refetch: () => void query.refetch(),
  };
}

export type MoizvonkiDraft = { account: string; email: string; apiKey: string };

export function useMoizvonkiActions() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";
  const params = useProjectParams();
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.settings.integration(envId, "moizvonki") });

  return {
    connect: useMutation({
      mutationFn: (draft: MoizvonkiDraft) =>
        api.post<unknown>(
          "/v1/moizvonki/connection",
          { account: draft.account.trim(), user_name: draft.email.trim(), api_key: draft.apiKey.trim() },
          { params },
        ),
      onError: (error) => reportError(error, "integrations.connectFailed"),
      onSuccess: refresh,
    }),
    disconnect: useMutation({
      mutationFn: () => api.delete<unknown>("/v1/moizvonki/connection", { params }),
      onError: (error) => reportError(error, "common.deleteFailed"),
      onSuccess: async () => {
        toast.success(i18n.t("integrations.disconnected"));
        await refresh();
      },
    }),
    /** Пауза и возобновление синхронизации, без отключения. */
    setEnabled: useMutation({
      mutationFn: (enabled: boolean) => api.put<unknown>("/v1/moizvonki/connection/enabled", { enabled }, { params }),
      onError: (error) => reportError(error, "common.saveFailed"),
      onSuccess: refresh,
    }),
  };
}

/* ---------------- Формы Meta ---------------- */

/**
 * Лид-формы страниц Meta — строки `crm_lead_forms`. Заводит их шлюз:
 * при подключении страницы (`facebookSyncPageForms`) и при первом лиде
 * с незнакомой формы. Новая форма выключена: лиды принимаются только
 * с тех, где `accept_leads` включён (`facebook_professional_crm.go:364`).
 */
const LEAD_FORMS = "crm_lead_forms";

export type MetaForm = { guid: string; name: string; formId: string; pageId: string; accept: boolean };

type LeadFormRow = { guid?: string; name?: string; form_id?: string; page_id?: string; accept_leads?: boolean };

export function useMetaForms(enabled: boolean) {
  const envId = useSession().getEnvironmentId() ?? "";

  const query = useQuery({
    queryKey: [...keys.settings.integration(envId, "facebook"), "forms"],
    queryFn: () =>
      api.post<{ data?: { response?: LeadFormRow[] | null } }>(`/v2/object/get-list/${LEAD_FORMS}`, {
        data: { limit: 500, offset: 0 },
      }),
    enabled,
  });

  return {
    forms: (query.data?.data?.response ?? []).map(
      (row): MetaForm => ({
        guid: row.guid ?? "",
        name: row.name ?? "",
        formId: row.form_id ?? "",
        pageId: row.page_id ?? "",
        accept: row.accept_leads === true,
      }),
    ),
    isLoading: query.isLoading,
  };
}

export function useToggleMetaForm() {
  const queryClient = useQueryClient();
  const envId = useSession().getEnvironmentId() ?? "";

  return useMutation({
    mutationFn: ({ guid, accept }: { guid: string; accept: boolean }) =>
      api.put<unknown>(`/v2/items/${LEAD_FORMS}`, { data: { guid, accept_leads: accept } }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...keys.settings.integration(envId, "facebook"), "forms"] }),
  });
}

/**
 * Куда шлюз кладёт лиды Meta. По умолчанию — таблицы new-crm (`contacts`,
 * `deals`, `lead_forms`), которых в omni4 нет; здесь — наши. Воронку,
 * этап и источник не трогаем: шлюз пишет их текстом в массиве, а у нас
 * это связи, и правильного значения ему не передать (backend-notes,
 * «Лиды Meta пишутся в схему new-crm»).
 *
 * Шлюз хранит сопоставление на строках ресурсов META_LEADS и без
 * подключённой страницы его не принимает — поэтому только после подключения.
 */
const OMNI4_MAPPING = {
  contacts_table: "crm_contacts",
  deals_table: "crm_deals",
  lead_forms_table: LEAD_FORMS,
  deal_contact_field: "crm_contacts_id",
  deal_form_field: "crm_lead_forms_id",
};

type CrmMappingDto = { mapping?: Record<string, string> };

export function useMetaMapping(connected: boolean) {
  const envId = useSession().getEnvironmentId() ?? "";
  const queryClient = useQueryClient();
  const key = [...keys.settings.integration(envId, "facebook"), "mapping"];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<CrmMappingDto>("/v1/facebook/crm-mapping"),
    enabled: connected,
  });

  const save = useMutation({
    mutationFn: () => api.put<unknown>("/v1/facebook/crm-mapping", { ...query.data?.mapping, ...OMNI4_MAPPING }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const current = query.data?.mapping;
  return {
    /** Сопоставление уже смотрит в таблицы omni4. */
    ours: Boolean(current && Object.entries(OMNI4_MAPPING).every(([k, v]) => current[k] === v)),
    loaded: query.isSuccess,
    save,
  };
}

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
