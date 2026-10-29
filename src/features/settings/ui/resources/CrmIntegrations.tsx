import { useEffect, useState, type ReactNode } from "react";
import { CopyIcon, PhoneIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localized, useTableFields, useTables } from "@/features/table";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { PasswordInput } from "@/shared/ui/password-input";
import { toast } from "@/shared/lib/toast";
import { useDataLanguages } from "@/features/workspace";
import {
  useConnectMeta,
  useDeleteGoogleForm,
  useDisconnectMeta,
  useGoogleLeads,
  useMetaForms,
  useMetaLeads,
  useMetaMapping,
  useMoizvonki,
  useMoizvonkiActions,
  usePbx,
  useSavePbx,
  useSaveGoogleForm,
  useToggleMetaForm,
  type GoogleForm,
  type MetaForm,
  type PbxDraft,
  type GoogleFormDraft,
} from "../../api/crm-integrations";
import { CAPS_LABEL } from "../parts";
import { ResourceLogo } from "./ResourceIcon";

/**
 * Интеграции CRM — блок каталога «Интеграции»: лиды Meta и Google Ads,
 * звонки «Моих Звонков». Состав и поведение — по new-crm; PBX сюда
 * не входит, пока в проекте нет его функции (см. STATUS).
 *
 * Карточка показывает, подключено ли, и открывает своё окно: у каждой
 * интеграции подключение устроено по-своему, общей формы ресурса у них нет.
 */
export function CrmIntegrations({ query }: { query: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<"" | "meta" | "google" | "moizvonki" | "pbx">("");

  const meta = useMetaLeads();
  const google = useGoogleLeads();
  const moizvonki = useMoizvonki();
  const pbx = usePbx();

  /* OAuth Meta уходит в соседнюю вкладку: перечитываем на возврат. */
  useEffect(() => {
    const onFocus = () => {
      meta.refetch();
      moizvonki.refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  const cards = [
    {
      id: "meta" as const,
      logo: <ResourceLogo kind="META_LEADS" />,
      name: "Meta Lead Ads",
      about: t("crmInt.meta.about"),
      on: meta.connected,
      state: meta.connected
        ? meta.active
          ? t("crmInt.pages", { count: meta.pages.length })
          : t("crmInt.expired")
        : "",
    },
    {
      id: "google" as const,
      logo: <ResourceLogo kind="GOOGLE_LEADS" />,
      name: "Google Ads",
      about: t("crmInt.google.about"),
      on: google.forms.length > 0,
      state: google.forms.length ? t("crmInt.forms", { count: google.forms.length }) : "",
    },
    {
      id: "moizvonki" as const,
      logo: (
        <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-surface-hover text-fg-muted">
          <Icon as={PhoneIcon} size={18} />
        </span>
      ),
      name: t("crmInt.moizvonki.name"),
      about: t("crmInt.moizvonki.about"),
      on: Boolean(moizvonki.connection?.connected),
      state: moizvonki.connection?.connected ? moizvonki.connection.account : "",
    },
    {
      id: "pbx" as const,
      logo: (
        <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-surface-hover text-fg-muted">
          <Icon as={PhoneIcon} size={18} />
        </span>
      ),
      name: "onlinePBX",
      about: t("crmInt.pbx.about"),
      on: Boolean(pbx.data?.settings?.enabled),
      state: pbx.data?.settings?.domain ?? "",
    },
  ];

  const needle = query.trim().toLowerCase();
  const shown = cards.filter((card) => !needle || `${card.name} ${card.about}`.toLowerCase().includes(needle));
  if (!shown.length) return null;

  return (
    <section className="mb-6">
      <div className={`mb-2.5 flex items-center justify-between ${CAPS_LABEL}`}>
        {t("crmInt.title")}
        <span className="text-[12.5px] font-medium tracking-normal normal-case">{shown.length}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((card) => (
          <div
            key={card.id}
            className={`flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-border bg-surface p-3.5 ${
              card.on ? "border-l-3 border-l-success" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {card.logo}
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-semibold text-fg">{card.name}</b>
                <small className="block truncate text-xs text-fg-subtle">{card.state || t("crmInt.title")}</small>
              </div>
              {card.on && (
                <span className="shrink-0 rounded-[5px] bg-chip-green-bg px-1.75 py-0.75 text-[10.5px] font-bold tracking-[.05em] text-chip-green-fg uppercase">
                  {t("resources.badgeConnected")}
                </span>
              )}
            </div>

            <p className="flex-1 text-[13px] leading-snug text-fg-muted">{card.about}</p>

            <Button variant="secondary" size="sm" onClick={() => setOpen(card.id)}>
              {card.on ? t("crmInt.configure") : t("resources.connect")}
            </Button>
          </div>
        ))}
      </div>

      {open === "meta" && <MetaDialog onClose={() => setOpen("")} />}
      {open === "google" && <GoogleDialog onClose={() => setOpen("")} />}
      {open === "moizvonki" && <MoizvonkiDialog onClose={() => setOpen("")} />}
      {open === "pbx" && <PbxDialog onClose={() => setOpen("")} />}
    </section>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-modal">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Meta ---------------- */

function MetaDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const meta = useMetaLeads();
  const connect = useConnectMeta();
  const disconnect = useDisconnectMeta();
  const mapping = useMetaMapping(meta.connected);
  const { forms } = useMetaForms(meta.connected);

  /*
   * Без этого шлюз ищет таблицы new-crm и молча не пишет ничего.
   * Ставится один раз, как только страница подключена: принять его
   * раньше шлюз не может (см. useMetaMapping).
   */
  const { ours, loaded, save } = mapping;
  useEffect(() => {
    if (loaded && !ours && save.isIdle) save.mutate();
  }, [loaded, ours, save]);

  return (
    <Dialog title="Meta Lead Ads" onClose={onClose}>
      <p className="text-[13px] text-fg-muted">{t("crmInt.meta.hint")}</p>

      {meta.connected && !meta.active && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
          {t("crmInt.expired")}
          {meta.reason ? ` — ${meta.reason}` : ""}
        </p>
      )}

      {meta.pages.map((page) => (
        <div key={page.resourceId} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{page.pageName || page.pageId}</p>
              {page.connectedAt && (
                <p className="text-xs text-fg-subtle">{new Date(page.connectedAt).toLocaleString(i18n.language)}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(page.resourceId)}
            >
              {t("integrations.disconnect")}
            </Button>
          </div>

          <MetaForms forms={forms.filter((form) => form.pageId === page.pageId)} />
        </div>
      ))}

      <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
        {meta.connected ? t("crmInt.meta.addPage") : t("resources.connect")}
      </Button>
    </Dialog>
  );
}

/**
 * Формы страницы и «принимать лиды». Новая форма выключена: шлюз заводит
 * её строку, чтобы её было видно, но лиды с неё не берёт, пока не включат.
 */
function MetaForms({ forms }: { forms: MetaForm[] }) {
  const { t } = useTranslation();
  const toggle = useToggleMetaForm();

  if (!forms.length) return <p className="text-xs text-fg-subtle">{t("crmInt.meta.noForms")}</p>;

  return (
    <div className="flex flex-col">
      <p className="text-xs font-medium text-fg-muted">{t("crmInt.meta.forms")}</p>
      {forms.map((form) => (
        <label key={form.guid} className="flex h-8 cursor-pointer items-center gap-2 text-sm text-fg">
          <Checkbox
            checked={form.accept}
            disabled={toggle.isPending}
            onChange={(event) => toggle.mutate({ guid: form.guid, accept: event.target.checked })}
          />
          <span className="min-w-0 flex-1 truncate">{form.name || form.formId}</span>
          <span className="shrink-0 text-xs text-fg-subtle">
            {form.accept ? t("crmInt.meta.accepting") : t("crmInt.meta.off")}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ---------------- Google Ads ---------------- */

const EMPTY_FORM: GoogleFormDraft = { formName: "", formId: "", tableSlug: "", fields: [] };

function GoogleDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const google = useGoogleLeads();
  const remove = useDeleteGoogleForm();
  /** Правится форма: пустой id — новая. Нет — список форм. */
  const [editing, setEditing] = useState<{ id: string; draft: GoogleFormDraft } | null>(null);

  if (editing) {
    return (
      <Dialog title="Google Ads" onClose={onClose}>
        <GoogleEditor
          id={editing.id}
          initial={editing.draft}
          columns={google.columns}
          onDone={() => setEditing(null)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog title="Google Ads" onClose={onClose}>
      <p className="text-[13px] text-fg-muted">{t("crmInt.google.hint")}</p>

      {google.forms.map((form) => (
        <GoogleFormRow
          key={form.resourceId}
          form={form}
          onEdit={() => setEditing({ id: form.resourceId, draft: form })}
          onDelete={() => remove.mutate(form.resourceId)}
        />
      ))}

      <Button onClick={() => setEditing({ id: "", draft: EMPTY_FORM })}>
        <Icon as={PlusIcon} size={14} />
        {t("crmInt.google.addForm")}
      </Button>
    </Dialog>
  );
}

function GoogleFormRow({ form, onEdit, onDelete }: { form: GoogleForm; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{form.formName || form.formId}</p>
          <p className="text-xs text-fg-subtle">
            {form.tableSlug} · {t("crmInt.google.fieldCount", { count: form.fields.length })}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t("action.edit")}
        </Button>
        <Button size="sm" variant="ghost" aria-label={t("action.delete")} onClick={onDelete}>
          <Icon as={Trash2Icon} size={14} />
        </Button>
      </div>

      {/* Это вставляют в настройки формы в Google Ads: адрес вебхука и ключ. */}
      <Copyable label={t("crmInt.google.webhook")} value={form.webhookUrl} />
      <Copyable label={t("crmInt.google.key")} value={form.key} />
    </div>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  if (!value) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-fg-subtle">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-surface-hover px-1.5 py-0.5 text-fg">{value}</code>
      <button
        type="button"
        aria-label={t("crmInt.copy")}
        title={t("crmInt.copy")}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg"
        onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(t("cell.copied")))}
      >
        <Icon as={CopyIcon} size={13} />
      </button>
    </div>
  );
}

function GoogleEditor({
  id,
  initial,
  columns,
  onDone,
}: {
  id: string;
  initial: GoogleFormDraft;
  columns: { id: string; label: string }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { current } = useDataLanguages();
  const save = useSaveGoogleForm();
  const [draft, setDraft] = useState(initial);

  const [tableSearch, setTableSearch] = useState("");
  const tables = useTables(tableSearch);
  const fields = useTableFields(draft.tableSlug || undefined, "");

  const rows = draft.fields;
  const setRow = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setDraft({ ...draft, fields: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const ready = Boolean(draft.formName.trim() && draft.tableSlug && rows.some((row) => row.column && row.field));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) save.mutate({ id, draft }, { onSuccess: onDone });
      }}
    >
      <Field label={t("crmInt.google.formName")}>
        <Input autoFocus value={draft.formName} onChange={(event) => setDraft({ ...draft, formName: event.target.value })} />
      </Field>
      <Field label={t("crmInt.google.formId")} hint={t("crmInt.optional")}>
        <Input value={draft.formId} onChange={(event) => setDraft({ ...draft, formId: event.target.value })} />
      </Field>
      <Field label={t("crmInt.google.table")}>
        <Dropdown
          value={draft.tableSlug}
          placeholder={t("crmInt.google.pickTable")}
          items={tables.items.map((table) => ({
            value: table.slug,
            label: localized(table.labels, current, table.label),
          }))}
          search={tableSearch}
          onSearch={setTableSearch}
          searchPlaceholder={t("crmInt.google.pickTable")}
          hasMore={tables.hasMore}
          onLoadMore={tables.loadMore}
          onChange={(tableSlug) =>
            /* Поля прежней таблицы новой не подходят: сопоставление заново. */
            setDraft({ ...draft, tableSlug, fields: id ? rows.map((row) => ({ ...row, field: "" })) : defaultRows(columns) })
          }
        />
      </Field>

      {draft.tableSlug && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-fg-muted">{t("crmInt.google.mapping")}</p>
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Dropdown
                className="min-w-0 flex-1"
                size="sm"
                value={row.column}
                placeholder={t("crmInt.google.column")}
                items={columns.map((column) => ({ value: column.id, label: column.label }))}
                onChange={(column) => setRow(index, { column })}
              />
              <Dropdown
                className="min-w-0 flex-1"
                size="sm"
                value={row.field}
                placeholder={t("crmInt.google.field")}
                items={fields.items.map((field) => ({ value: field.slug, label: field.label || field.slug }))}
                hasMore={fields.hasMore}
                onLoadMore={fields.loadMore}
                onChange={(field) => setRow(index, { field })}
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                <Checkbox checked={row.required} onChange={(event) => setRow(index, { required: event.target.checked })} />
                {t("crmInt.google.required")}
              </label>
              <button
                type="button"
                aria-label={t("action.delete")}
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-fg-subtle hover:bg-danger-subtle hover:text-danger"
                onClick={() => setDraft({ ...draft, fields: rows.filter((_, i) => i !== index) })}
              >
                <Icon as={Trash2Icon} size={14} />
              </button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setDraft({ ...draft, fields: [...rows, { column: "", field: "", required: false }] })}
          >
            <Icon as={PlusIcon} size={14} />
            {t("crmInt.google.addRow")}
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("action.cancel")}
        </Button>
        <Button type="submit" disabled={!ready || save.isPending}>
          {save.isPending ? t("common.saving") : t("action.save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Строки сопоставления новой формы — по одной на колонку Google, поле
 * пустое: таблицу выбирает человек, и угадывать в ней поля мы не будем.
 * Email и телефон обязательны, как в new-crm: без них лид некуда вернуть.
 */
function defaultRows(columns: { id: string }[]) {
  return columns.map((column) => ({
    column: column.id,
    field: "",
    required: column.id === "EMAIL" || column.id === "PHONE_NUMBER",
  }));
}

/* ---------------- «Мои Звонки» ---------------- */

function MoizvonkiDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { connection, isLoading, failed, forbidden, refetch } = useMoizvonki();
  const { connect, disconnect, setEnabled } = useMoizvonkiActions();
  const [draft, setDraft] = useState({ account: "", email: "", apiKey: "" });

  const name = t("crmInt.moizvonki.name");

  if (isLoading) {
    return (
      <Dialog title={name} onClose={onClose}>
        <p className="text-sm text-fg-subtle">{t("common.loading")}</p>
      </Dialog>
    );
  }

  if (failed || (connection && !connection.ready)) {
    return (
      <Dialog title={name} onClose={onClose}>
        <p className="text-sm text-fg-muted">{t(forbidden ? "crmInt.forbidden" : "crmInt.unavailable")}</p>
        <Button variant="secondary" onClick={refetch}>
          {t("crmInt.retry")}
        </Button>
      </Dialog>
    );
  }

  if (connection?.connected) {
    return (
      <Dialog title={name} onClose={onClose}>
        <p className="text-sm text-fg">
          {t("crmInt.moizvonki.account")}: <b>{connection.account}</b>
        </p>
        <p className="text-sm text-fg-muted">
          {connection.polling ? t("crmInt.moizvonki.syncOn") : t("crmInt.moizvonki.syncOff")}
        </p>
        {connection.syncError && (
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">{connection.syncError}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate(!connection.polling)}
          >
            {connection.polling ? t("crmInt.moizvonki.pause") : t("crmInt.moizvonki.resume")}
          </Button>
          <Button variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {t("integrations.disconnect")}
          </Button>
        </div>
      </Dialog>
    );
  }

  const ready = Boolean(draft.account.trim() && draft.email.trim() && draft.apiKey.trim());

  return (
    <Dialog title={name} onClose={onClose}>
      <p className="text-[13px] text-fg-muted">{t("crmInt.moizvonki.hint")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          /* Ключ не держим в форме после попытки — ни удачной, ни нет. */
          if (ready) connect.mutate(draft, { onSettled: () => setDraft({ ...draft, apiKey: "" }) });
        }}
      >
        <Field label={t("crmInt.moizvonki.account")} hint="company / https://company.moizvonki.ru">
          <Input autoFocus value={draft.account} onChange={(event) => setDraft({ ...draft, account: event.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        </Field>
        <Field label={t("crmInt.moizvonki.apiKey")}>
          <PasswordInput
            autoComplete="off"
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          />
        </Field>
        <Button type="submit" disabled={!ready || connect.isPending}>
          {t("resources.connect")}
        </Button>
      </form>
    </Dialog>
  );
}

/* ---------------- onlinePBX ---------------- */

const PBX_DOMAIN = /^[a-z0-9-]+\.onpbx\.ru$/i;

function PbxDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = usePbx();
  const save = useSavePbx();

  if (isLoading || !data) {
    return (
      <Dialog title="onlinePBX" onClose={onClose}>
        <p className="text-sm text-fg-subtle">{t("common.loading")}</p>
      </Dialog>
    );
  }

  return (
    <Dialog title="onlinePBX" onClose={onClose}>
      <PbxForm data={data} busy={save.isPending} onSave={(draft) => save.mutate(draft, { onSuccess: onClose })} />
    </Dialog>
  );
}

function PbxForm({
  data,
  busy,
  onSave,
}: {
  data: NonNullable<ReturnType<typeof usePbx>["data"]>;
  busy: boolean;
  onSave: (draft: PbxDraft) => void;
}) {
  const { t } = useTranslation();
  const [domain, setDomain] = useState(data.settings?.domain ?? "");
  const [apiKey, setApiKey] = useState("");
  const [phone, setPhone] = useState(data.settings?.phone ?? "");
  const [enabled, setEnabled] = useState(data.settings?.enabled ?? true);
  const [extensions, setExtensions] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.operators.map((op) => [op.userId, op.extension])),
  );
  const [search, setSearch] = useState("");

  const domainOk = PBX_DOMAIN.test(domain.trim());
  /* Ключ обязателен только в первый раз: дальше пустое поле — «оставить». */
  const ready = domainOk && (apiKey.trim() || data.settings?.hasKey) && phone.trim();
  const needle = search.trim().toLowerCase();
  const users = data.users.filter((user) => !needle || user.name.toLowerCase().includes(needle));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave({ domain, apiKey, phone, enabled, extensions });
      }}
    >
      <p className="text-[13px] text-fg-muted">{t("crmInt.pbx.hint")}</p>

      <Field label={t("crmInt.pbx.domain")} hint={domain && !domainOk ? t("crmInt.pbx.domainHint") : "company.onpbx.ru"}>
        <Input autoFocus value={domain} onChange={(event) => setDomain(event.target.value)} />
      </Field>
      <Field label={t("crmInt.pbx.apiKey")} {...(data.settings?.hasKey ? { hint: t("crmInt.pbx.keepKey") } : {})}>
        <PasswordInput autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      </Field>
      <Field label={t("crmInt.pbx.phone")} hint={t("crmInt.pbx.phoneHint")}>
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-fg">
        <Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        {t("crmInt.pbx.enabled")}
      </label>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-fg-muted">{t("crmInt.pbx.operators")}</p>
        <Input
          value={search}
          placeholder={t("crmInt.pbx.searchUser")}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="max-h-56 overflow-y-auto rounded-md border border-border">
          {users.map((user) => (
            <div key={user.guid} className="flex h-11 items-center gap-2 border-b border-border px-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
              <div className="w-24 shrink-0">
              <Input
                inputMode="numeric"
                placeholder="—"
                aria-label={`${user.name}: ${t("crmInt.pbx.extension")}`}
                value={extensions[user.guid] ?? ""}
                onChange={(event) => setExtensions({ ...extensions, [user.guid]: event.target.value })}
              />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={!ready || busy}>
        {busy ? t("common.saving") : t("action.save")}
      </Button>
    </form>
  );
}
