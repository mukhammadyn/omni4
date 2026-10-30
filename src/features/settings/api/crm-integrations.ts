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
  // Связи: шлюз пишет в них guid, а не массив, и пропускает не-guid
  // (ветка feat/facebook-leads-lookup-fields шлюза, `setCRMChoice`).
  pipeline_field: "crm_pipelines_id",
  stage_field: "crm_stages_id",
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

/* ---------------- Meta: воронка лидов по странице ---------------- */

type PipelineMappingsDto = { pages?: { page_id?: string; pipeline_value?: string; stage_value?: string }[] };
export type MetaPageRoute = { pipelineId: string; stageId: string };

/**
 * Куда ложатся лиды страницы: воронка и этап (`/v1/facebook/pipeline-mappings`,
 * как в new-crm ARMADA — `MetaPagePipelineEditor`). Значения — guid omni4.
 * Этап — связь `crm_stages_id`, воронка — `crm_pipelines_id` из crm-mapping
 * (`OMNI4_MAPPING`); шлюз пишет в них guid (docs/backend-notes.md,
 * «Воронка лида Meta по странице»).
 */
export function useMetaPageRoutes(connected: boolean) {
  const envId = useSession().getEnvironmentId() ?? "";
  const queryClient = useQueryClient();
  const key = [...keys.settings.integration(envId, "facebook"), "pipelines"];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<PipelineMappingsDto>("/v1/facebook/pipeline-mappings"),
    enabled: connected,
  });

  const save = useMutation({
    mutationFn: ({ pageId, pipelineId, stageId }: MetaPageRoute & { pageId: string }) =>
      api.put<unknown>(`/v1/facebook/pipeline-mappings/${encodeURIComponent(pageId)}`, {
        pipeline_value: pipelineId,
        pipeline_stage_field: pipelineId ? "crm_stages_id" : "",
        stage_value: stageId,
      }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: () => {
      toast.success(i18n.t("settings.saved"));
      return queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const routes = new Map<string, MetaPageRoute>(
    (query.data?.pages ?? []).map((p) => [p.page_id ?? "", { pipelineId: p.pipeline_value ?? "", stageId: p.stage_value ?? "" }]),
  );
  return { routes, loading: query.isLoading, save };
}

/* ---------------- Meta Ads: какие кампании пускаются в воронку ---------------- */

export type MetaCampaign = { id: string; name: string; active: boolean };
type CampaignsDto = { campaigns?: { id?: string; name?: string; effective_status?: string }[] };

/**
 * Кампании воронки (`/v1/meta-ads/pipeline-campaigns`, как доска ARMADA):
 * лид страницы попадает в воронку, только если его объявление из выбранной
 * кампании. Рекламный аккаунт шлюз подбирает сам — по страницам воронки
 * (`/v1/meta-ads/selected-account`).
 *
 * Пустой ответ — «все кампании»: списка ещё нет. Сохранённый пустой список
 * шлюз читает как «никого» и убрать его не даёт — поэтому пустым не пишем.
 */
export function useMetaPipelineCampaigns(pipelineId: string) {
  const envId = useSession().getEnvironmentId() ?? "";
  const queryClient = useQueryClient();
  const base = [...keys.settings.integration(envId, "meta-ads"), pipelineId];

  const account = useQuery({
    queryKey: [...base, "account"],
    queryFn: () => api.get<{ account?: { id?: string } }>("/v1/meta-ads/selected-account", { params: { pipeline_value: pipelineId } }),
    enabled: Boolean(pipelineId),
    retry: false,
  });
  const accountId = account.data?.account?.id ?? "";
  const campaigns = useQuery({
    queryKey: [...base, "campaigns", accountId],
    queryFn: () => api.get<CampaignsDto>("/v1/meta-ads/campaigns", { params: { account_id: accountId } }),
    enabled: Boolean(accountId),
    retry: false,
  });
  const selected = useQuery({
    queryKey: [...base, "selected"],
    queryFn: () => api.get<{ campaign_ids?: string[] }>("/v1/meta-ads/pipeline-campaigns", { params: { pipeline_value: pipelineId } }),
    enabled: Boolean(pipelineId),
  });
  const save = useMutation({
    mutationFn: (ids: string[]) => api.put<unknown>("/v1/meta-ads/pipeline-campaigns", { pipeline_value: pipelineId, campaign_ids: ids }),
    onError: (error) => reportError(error, "common.saveFailed"),
    onSuccess: () => {
      toast.success(i18n.t("settings.saved"));
      return queryClient.invalidateQueries({ queryKey: [...base, "selected"] });
    },
  });

  return {
    campaigns: (campaigns.data?.campaigns ?? []).map(
      (c): MetaCampaign => ({ id: c.id ?? "", name: c.name ?? c.id ?? "", active: c.effective_status === "ACTIVE" }),
    ),
    selected: selected.data?.campaign_ids ?? [],
    loading: account.isLoading || campaigns.isLoading || selected.isLoading,
    /** Нет рекламного аккаунта или он не видит страниц воронки. */
    unavailable: account.isError || campaigns.isError,
    save,
  };
}
