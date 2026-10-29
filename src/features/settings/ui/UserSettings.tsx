import { useDeferredValue, useState } from "react";
import { CopyIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PEOPLE } from "@/features/item";
import { useSession } from "@/shared/api/use-session";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Dropdown } from "@/shared/ui/dropdown";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { PasswordInput } from "@/shared/ui/password-input";
import { useClientTypes } from "../api/client-types";
import { useRoles } from "../api/roles";
import {
  USERS_PAGE,
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useUpdateUser,
  useUsers,
  useFreeEmployees,
  type FreeEmployee,
  type ProjectUser,
  type UserDraft,
} from "../api/users";
import { inviteLink } from "../model/invite";
import { Empty, Pager, SectionHeader, Td, Th } from "./parts";

/**
 * Люди проекта — строки `core_users` (см. api/users).
 *
 * Человек заводится строкой; вход — галочкой, сразу или позже в правке:
 * тогда по логину и паролю бэкенд заводит учётку и связывает её со
 * строкой. Колонка «Вход» показывает, у кого учётка есть.
 *
 * Тип клиента не выбирается: у `core_users` он один — тот, чья таблица
 * входа она и есть. Роли — только его: роль другого типа бэкенд примет,
 * а войти под ней не выйдет.
 */
export function UserSettings() {
  const { t } = useTranslation();
  const { clientTypes, isLoading: loadingTypes } = useClientTypes();
  const clientTypeId = clientTypes.find((type) => type.tableSlug === PEOPLE)?.id ?? "";

  const [query, setQuery] = useState("");
  /* Запрос уходит на сервер — печатать быстрее, чем он отвечает. */
  const search = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(USERS_PAGE);

  const { users, count, isLoading } = useUsers({ search, page, limit });
  const { roles } = useRoles();
  const remove = useDeleteUser();

  const [editing, setEditing] = useState<ProjectUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectUser | null>(null);

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? "";

  if (loadingTypes) return <p className="p-4 text-sm text-fg-muted">{t("common.loading")}</p>;
  if (!clientTypeId) return <p className="p-4 text-sm text-fg-muted">{t("users.noTypes")}</p>;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SectionHeader title={t("users.title")} hint={t("users.hint")}>
        {/* Ширину задаёт обёртка: у `Input` в базовых классах стоит
            `w-full`, и своя ширина на самом поле с ним спорит. */}
        <div className="w-48">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={t("users.search")}
            aria-label={t("users.search")}
            className="h-7 text-sm"
          />
        </div>

        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon as={PlusIcon} size={14} />
          {t("users.create")}
        </Button>
      </SectionHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <Th>{t("settings.name")}</Th>
              <Th>{t("auth.login")}</Th>
              <Th>{t("auth.email")}</Th>
              <Th>{t("settings.phone")}</Th>
              <Th>{t("settings.role")}</Th>
              <Th>{t("users.access")}</Th>
              <Th className="w-20" />
            </tr>
          </thead>

          <tbody>
            {isLoading && <Empty text={t("common.loading")} colSpan={7} />}
            {!isLoading && !users.length && <Empty text={t("users.empty")} colSpan={7} />}

            {users.map((user) => (
              <tr key={user.id} className="group/row hover:bg-surface-hover">
                <Td>{user.name || "—"}</Td>
                <Td className="font-mono text-xs">{user.login}</Td>
                <Td className="text-fg-muted">{user.email}</Td>
                <Td className="text-fg-muted">{user.phone}</Td>
                <Td className="text-fg-muted">{roleName(user.roleId)}</Td>
                <Td className="text-fg-muted">{user.hasLogin ? t("users.accessYes") : "—"}</Td>

                <Td className="text-right">
                  <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                    <IconButton
                      icon={PencilIcon}
                      label={t("action.edit")}
                      onClick={() => setEditing(user)}
                    />
                    <IconButton
                      icon={Trash2Icon}
                      label={t("action.delete")}
                      danger
                      onClick={() => setDeleting(user)}
                    />
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        page={page}
        total={count}
        limit={limit}
        onPage={setPage}
        onLimit={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />

      {(editing || creating) && (
        <UserDialog
          user={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("users.deleteTitle", { name: deleting.name || deleting.login })}
          description={t("users.deleteDescription")}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate([deleting.id], { onSuccess: () => setDeleting(null) })
          }
        />
      )}
    </div>
  );
}

function IconButton({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: typeof PencilIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-7 place-items-center rounded-md text-fg-subtle transition-colors ${
        danger ? "hover:bg-danger-subtle hover:text-danger" : "hover:bg-surface-active hover:text-fg"
      }`}
    >
      <Icon as={icon} size={14} />
    </button>
  );
}

/**
 * Заведение и правка человека — одна форма.
 *
 * Новый пользователь — обычно уже заведённый сотрудник: выбирается из
 * тех, у кого строки в `core_users` ещё нет, и строка привязывается к
 * нему (`hr_employees_id`), а имя, почта и телефон берутся его.
 * Со страницы сотрудника он приходит готовым (`employee`).
 *
 * Галочка «Доступ ко входу» видна, пока учётки нет: при создании и у
 * строки без входа. Включена — нужны логин и пароль, по ним бэкенд
 * заводит учётку. Когда вход уже есть, логин правится как поле, а пароль
 * здесь не меняется: прочитать его нельзя, а пустое поле читалось бы
 * как «сотрётся».
 *
 * Ссылка-приглашение — без бэкенда вовсе, см. `inviteLink()`: пришедший
 * по ней заводится сам и сам назначает пароль.
 */
export function UserDialog({
  user = null,
  employee,
  onClose,
}: {
  user?: ProjectUser | null;
  /** Открыт со страницы сотрудника: он уже выбран, выбора нет. */
  employee?: FreeEmployee;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const store = useSession();
  const { clientTypes } = useClientTypes();
  const clientTypeId = clientTypes.find((type) => type.tableSlug === PEOPLE)?.id ?? "";
  const roles = useRoles().roles.filter(
    (role) => !role.clientTypeId || role.clientTypeId === clientTypeId,
  );
  const picking = !user && !employee;
  const free = useFreeEmployees(picking);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const create = useCreateUser(clientTypeId);
  const update = useUpdateUser();
  const saving = create.isPending || update.isPending;

  const [draft, setDraft] = useState<UserDraft>({
    employeeId: employee?.id ?? "",
    name: user?.name ?? employee?.name ?? "",
    email: user?.email ?? employee?.email ?? "",
    phone: user?.phone ?? employee?.phone ?? "",
    roleId: user?.roleId ?? "",
    // Из сотрудника заводят ради входа — галочка сразу стоит.
    access: Boolean(employee),
    // Логин — почта: учётки общие на все проекты, и короткий логин вроде
    // «Test» почти наверняка занят — бэкенд тогда молча привяжет строку
    // к чужой учётке (docs/backend-notes.md, «прилипает к чужой учётке»).
    login: user?.login || employee?.email || "",
    // ponytail: со страницы сотрудника пароль генерируется, не спрашивается.
    password: employee ? generatePassword() : "",
  });
  const put = (patch: Partial<UserDraft>) => setDraft((current) => ({ ...current, ...patch }));
  /* Роли приезжают позже формы: пустая роль — первая подходящая. */
  const roleId = draft.roleId || roles[0]?.id || "";

  const pickEmployee = (id: string) => {
    const chosen = free.employees.find((item) => item.id === id);
    if (chosen) put({ employeeId: id, name: chosen.name, email: chosen.email, phone: chosen.phone, access: true, login: chosen.email });
  };

  const granting = !user?.hasLogin && draft.access;
  const filled =
    Boolean(clientTypeId && draft.name.trim() && roleId) &&
    (!granting || Boolean(draft.login.trim() && draft.password));

  const link = inviteLink({
    origin: window.location.origin,
    projectId: store.getProjectId() ?? "",
    environmentId: store.getEnvironmentId() ?? "",
    roleId,
    clientTypeId,
  });

  return (
    <Modal onClose={onClose}>
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          const full = { ...draft, roleId };
          const done = () => {
            /* Пароль прочитать назад нельзя — сразу в буфер вместе с логином. */
            if (employee) {
              void navigator.clipboard.writeText(`${full.login}\n${full.password}`);
              toast.success(t("users.credentialsCopied"));
            }
            onClose();
          };
          if (user) update.mutate({ user, draft: full }, { onSuccess: done });
          else create.mutate(full, { onSuccess: done });
        }}
      >
{employee ? (
<>
        <h2 className="text-base font-semibold">{t("users.grantTitle", { name: draft.name })}</h2>
        <Field label={t("auth.login")}>
          <Input
            autoFocus
            required
            value={draft.login}
            onChange={(event) => put({ login: event.target.value })}
          />
        </Field>
        <Field label={t("auth.password")}>
          <GeneratedPassword value={draft.password} onRegenerate={() => put({ password: generatePassword() })} />
        </Field>
        <p className="text-xs text-fg-subtle">{t("users.passwordHint")}</p>
</>
) : (
<>
        <h2 className="text-base font-semibold">{t(user ? "users.editTitle" : "users.create")}</h2>

        {picking && (
          <Field label={t("users.employee")}>
            <Dropdown
              value={draft.employeeId}
              placeholder={t("users.employeeNone")}
              loading={free.isLoading}
              search={employeeQuery}
              onSearch={setEmployeeQuery}
              emptyText={t("users.employeeEmpty")}
              items={free.employees
                .filter((item) => item.name.toLowerCase().includes(employeeQuery.trim().toLowerCase()))
                .map((item) => ({ value: item.id, label: item.name || item.email || "—" }))}
              onChange={pickEmployee}
            />
          </Field>
        )}

        <Field label={t("settings.name")}>
          <Input
            autoFocus
            required
            value={draft.name}
            onChange={(event) => put({ name: event.target.value })}
          />
        </Field>

        <Field label={t("auth.email")}>
          <Input
            type="email"
            value={draft.email}
            onChange={(event) => put({ email: event.target.value })}
          />
        </Field>

        <Field label={t("settings.phone")}>
          <Input value={draft.phone} onChange={(event) => put({ phone: event.target.value })} />
        </Field>

        <Field label={t("settings.role")}>
          <Dropdown
            value={roleId}
            placeholder="—"
            items={roles.map((role) => ({ value: role.id, label: role.name }))}
            onChange={(roleId) => put({ roleId })}
          />
        </Field>

        {user?.hasLogin ? (
          <Field label={t("auth.login")}>
            <Input value={draft.login} onChange={(event) => put({ login: event.target.value })} />
          </Field>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={draft.access} onChange={(event) =>
                put({ access: event.target.checked, login: draft.login || draft.email.trim() })
              } />
            {t("users.grantAccess")}
          </label>
        )}

        {granting && (
          <>
            <Input
              required
              placeholder={t("auth.login")}
              value={draft.login}
              onChange={(event) => put({ login: event.target.value })}
            />
            <PasswordInput
              required
              autoComplete="new-password"
              placeholder={t("auth.password")}
              value={draft.password}
              onChange={(event) => put({ password: event.target.value })}
            />
            <p className="text-xs text-fg-subtle">{t("users.loginHint")}</p>
            <p className="text-xs text-fg-subtle">{t("users.passwordHint")}</p>
          </>
        )}

</>
)}
        <div className="flex items-center justify-end gap-2">
          {!user && !employee && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={!link}
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success(t("cell.copied"));
              }}
            >
              <Icon as={CopyIcon} size={14} />
              {t("users.inviteLink")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={!filled || saving}>
            {saving ? t("common.saving") : t(user ? "action.save" : "action.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * 12 символов без похожих (0/O, 1/l/I): диктуется и переписывается без ошибок.
 * Заглавная, строчная и цифра — обязательно: иначе object builder отклонит
 * пароль (`ob/pkg/util/validation.go:8`).
 */
function generatePassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const password = Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join("");
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) ? password : generatePassword();
}

/** «Сгенерировать пароль» со страницы сотрудника: новый пароль, сохранён — сразу в буфер. */
export function PasswordDialog({
  user,
  onClose,
}: {
  user: { id: string; clientTypeId: string; login: string; name: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(generatePassword);
  const reset = useResetUserPassword();
  return (
    <Modal onClose={onClose}>
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          reset.mutate(
            { userId: user.id, clientTypeId: user.clientTypeId, password },
            {
              onSuccess: () => {
                void navigator.clipboard.writeText(user.login ? `${user.login}\n${password}` : password);
                toast.success(t("users.credentialsCopied"));
                onClose();
              },
            },
          );
        }}
      >
        <h2 className="text-base font-semibold">{t("users.newPasswordTitle", { name: user.name })}</h2>
        {user.login && (
          <Field label={t("auth.login")}>
            <Input readOnly value={user.login} />
          </Field>
        )}
        <Field label={t("auth.password")}>
          <GeneratedPassword value={password} onRegenerate={() => setPassword(generatePassword())} />
        </Field>
        <p className="text-xs text-fg-subtle">{t("users.newPasswordHint")}</p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={reset.isPending}>
            {reset.isPending ? t("common.saving") : t("action.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Сгенерированный пароль: только чтение, «заново» и «скопировать». */
function GeneratedPassword({ value, onRegenerate }: { value: string; onRegenerate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono" />
      <Button
        type="button"
        variant="secondary"
        title={t("cell.copy")}
        aria-label={t("cell.copy")}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success(t("cell.copied"));
        }}
      >
        <Icon as={CopyIcon} size={14} />
      </Button>
      <Button
        type="button"
        variant="secondary"
        title={t("users.regenerate")}
        aria-label={t("users.regenerate")}
        onClick={onRegenerate}
      >
        <Icon as={RefreshCwIcon} size={14} />
      </Button>
    </div>
  );
}
