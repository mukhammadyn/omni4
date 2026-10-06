import { useEffect, useState } from "react";
import { MonitorIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/shared/api/use-session";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import {
  useChangePassword,
  useDeleteSession,
  useProfile,
  useSessions,
  useUpdateProfile,
  type ProfileDraft,
} from "../api/profile";
import { useClientTypes } from "../api/client-types";
import { ImagePicker } from "./ImagePicker";
import { GroupTitle, SectionHeader, SettingRow } from "./parts";

/**
 * Профиль: имя, как человека зовут в интерфейсе, и способы входа.
 *
 * Роль и тип клиента показаны, но не правятся: их выдаёт проект, а не
 * человек себе сам. Поле ввода, которое сервер всё равно перезапишет,
 * — это ложное обещание.
 */
export function ProfileSettings() {
  const { t } = useTranslation();
  const { profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const store = useSession();
  const role = store.getProfile()?.role ?? "";
  /*
   * Тип клиента у человека один и лежит в токене; человеческое имя
   * к нему — в справочнике проекта. Свой запрос за ним не нужен: список
   * типов уже грузится для создания ролей и живёт в кэше.
   */
  const { clientTypes } = useClientTypes();
  const clientType =
    clientTypes.find((type) => type.id === store.getClientTypeId())?.name ?? "";

  const [draft, setDraft] = useState<ProfileDraft>({
    name: "",
    login: "",
    email: "",
    phone: "",
    photo: "",
  });

  // Черновик наполняется, когда профиль приехал: до этого править нечего.
  useEffect(() => {
    if (!profile) return;
    setDraft({
      name: profile.name,
      login: profile.login,
      email: profile.email,
      phone: profile.phone,
      photo: profile.photoUrl,
    });
  }, [profile]);

  const header = <SectionHeader title={t("settings.profile")} hint={t("settings.profileHint")} />;

  if (isLoading || !profile) {
    return (
      <>
        {header}
        <p className="text-sm text-fg-subtle">{t("common.loading")}</p>
      </>
    );
  }

  const changed =
    draft.name !== profile.name ||
    draft.login !== profile.login ||
    draft.email !== profile.email ||
    draft.phone !== profile.phone ||
    draft.photo !== profile.photoUrl;

  const reset = () =>
    setDraft({
      name: profile.name,
      login: profile.login,
      email: profile.email,
      phone: profile.phone,
      photo: profile.photoUrl,
    });

  const text = (key: "name" | "login" | "email" | "phone", label: string, type = "text") => (
    <SettingRow label={label}>
      <Input
        type={type}
        value={draft[key]}
        aria-label={label}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </SettingRow>
  );

  return (
    <>
      {header}

      <SettingRow label={t("settings.photo")} hint={t("settings.photoHint")}>
        <ImagePicker
          value={draft.photo}
          letter={(draft.name || profile.login || "?").slice(0, 1).toUpperCase()}
          label={t("settings.photo")}
          round
          onChange={(photo) => setDraft({ ...draft, photo })}
        />
      </SettingRow>

      {text("name", t("settings.name"))}
      {text("login", t("auth.login"))}
      {text("email", t("auth.email"), "email")}
      {text("phone", t("settings.phone"))}

      {/* Роль и тип клиента выдаёт проект, а не человек себе сам: поле
          ввода, которое сервер всё равно перезапишет, — ложное обещание.
          Поэтому — текстом. */}
      <SettingRow label={t("settings.role")}>
        <span className="truncate text-sm text-fg">{role || "—"}</span>
      </SettingRow>
      <SettingRow label={t("settings.clientType")}>
        <span className="truncate text-sm text-fg">{clientType || "—"}</span>
      </SettingRow>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={!changed || update.isPending} onClick={reset}>
          {t("action.cancel")}
        </Button>
        <Button
          disabled={!changed || update.isPending}
          onClick={() => update.mutate({ profile, draft })}
        >
          {t("action.save")}
        </Button>
      </div>

      <PasswordSection />
      <SessionsSection />
    </>
  );
}

/**
 * Смена пароля. Отдельной формой: для неё нужен прежний пароль, и
 * ошибка в нём значит «это не вы», а не «не сохранилось».
 */
function PasswordSection() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");

  const filled = Boolean(oldPassword && password);
  const matches = password === repeat;

  return (
    <>
      <GroupTitle title={t("settings.password")} />

      {/* Браузеру здесь подставлять нечего: это не форма входа,
          и подставленный им пароль человек примет за уже введённый. */}
      <SettingRow label={t("settings.oldPassword")}>
        <PasswordInput
          autoComplete="new-password"
          aria-label={t("settings.oldPassword")}
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
      </SettingRow>

      <SettingRow label={t("settings.newPassword")}>
        <PasswordInput
          autoComplete="new-password"
          aria-label={t("settings.newPassword")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </SettingRow>

      <SettingRow
        label={t("settings.repeatPassword")}
        hint={repeat && !matches ? t("settings.passwordMismatch") : undefined}
      >
        <PasswordInput
          autoComplete="new-password"
          aria-label={t("settings.repeatPassword")}
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </SettingRow>

      <div className="mt-4 flex justify-end">
        <Button
          variant="secondary"
          disabled={!filled || !matches || change.isPending}
          onClick={() =>
            change.mutate(
              { oldPassword, password },
              {
                onSuccess: () => {
                  setOldPassword("");
                  setPassword("");
                  setRepeat("");
                },
              },
            )
          }
        >
          {t("settings.changePassword")}
        </Button>
      </div>
    </>
  );
}

/**
 * Открытые сессии: где человек ещё залогинен.
 *
 * Текущая помечена и не закрывается кнопкой: закрыть её — это выйти,
 * и для выхода есть выход. Кнопка, которая молча разлогинивает из
 * настроек, читается как поломка.
 */
function SessionsSection() {
  const { t, i18n } = useTranslation();
  const { sessions, isLoading } = useSessions();
  const remove = useDeleteSession();

  return (
    <>
      <GroupTitle title={t("settings.sessions")} />

      {isLoading && <p className="py-3 text-sm text-fg-subtle">{t("common.loading")}</p>}
      {!isLoading && !sessions.length && (
        <p className="py-3 text-sm text-fg-subtle">{t("settings.noSessions")}</p>
      )}

      {sessions.map((item) => (
        /* Строка — как `.srow`: линия между устройствами, без рамки. */
        <div
          key={item.id}
          className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
        >
          <Icon as={MonitorIcon} size={16} className="shrink-0 text-fg-muted" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-fg">
              {item.device || t("settings.unknownDevice")}
              {item.current && (
                <span className="ml-2 rounded bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent-text">
                  {t("settings.currentSession")}
                </span>
              )}
            </p>
            <p className="truncate text-2xs text-fg-subtle">
              {[item.ip, formatDate(item.updatedAt, i18n.language)].filter(Boolean).join(" · ")}
            </p>
          </div>

          {!item.current && (
            <button
              type="button"
              onClick={() => remove.mutate(item.id)}
              aria-label={t("settings.closeSession")}
              title={t("settings.closeSession")}
              className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
            >
              <Icon as={Trash2Icon} size={14} />
            </button>
          )}
        </div>
      ))}
    </>
  );
}

/** Дата сессии — как её отдал сервер. Мусор не показываем вовсе. */
function formatDate(value: string, locale: string): string {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale);
}
