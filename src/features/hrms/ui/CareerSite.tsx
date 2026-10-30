import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "@tanstack/react-router";
import {
  AppWindowIcon,
  ContactIcon,
  EyeOffIcon,
  GlobeIcon,
  ImageIcon,
  ImagePlusIcon,
  InfoIcon,
  LayoutTemplateIcon,
  LockIcon,
  MailIcon,
  MonitorIcon,
  PaletteIcon,
  SmartphoneIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Tabs } from "@/shared/ui/tabs";
import { CAREER_DOMAIN, useCareerSite, type CareerSite as Site, type PreviewVacancy } from "../api/career";
import { Switch } from "./record-form";

const SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_IMAGE = 5 * 1024 * 1024;

const label = "mb-1 block text-xs font-medium text-fg-muted";
const hint = "mt-1 block text-xs text-fg-subtle";
const area = "w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** «Карьерный сайт» — `careerInit` прототипа: настройки слева, предпросмотр справа. */
export function CareerSite() {
  const { t } = useTranslation();
  const data = useCareerSite();
  const [draft, setDraft] = useState<Site>(data.site);
  const [dirty, setDirty] = useState(false);
  const [mobile, setMobile] = useState(false);
  // Строка пришла с сервера (или перечитана после сохранения) — форма с ней.
  useEffect(() => {
    if (!dirty) setDraft(data.site);
  }, [data.site, dirty]);

  // Уход с несохранёнными правками — переход по приложению и закрытие вкладки.
  useBlocker({ shouldBlockFn: () => !window.confirm(t("career.leave")), disabled: !dirty, enableBeforeUnload: () => dirty });

  const set = (patch: Partial<Site>) => (setDraft((d) => ({ ...d, ...patch })), setDirty(true));
  const subOk = !draft.subdomain || SUBDOMAIN.test(draft.subdomain);
  const emailOk = !draft.contact_email || EMAIL.test(draft.contact_email);

  const save = () => {
    if (!subOk) return toast.error(t("career.badSubdomain"));
    if (!emailOk) return toast.error(t("career.badEmail"));
    data.save(draft).then(
      () => (setDirty(false), toast.success(t("career.saved"))),
      () => {},
    );
  };
  const text = (key: keyof Site, ph = "") => (
    <Input value={String(draft[key])} placeholder={ph} onChange={(e) => set({ [key]: e.target.value })} />
  );
  const long = (key: keyof Site, rows: number) => (
    <textarea rows={rows} className={area} value={String(draft[key])} onChange={(e) => set({ [key]: e.target.value })} />
  );

  if (data.loading) return <p className="py-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-lg bg-surface-hover px-3 py-2 text-xs text-fg-muted">
        <Icon as={InfoIcon} size={14} className="mt-px shrink-0" />
        {t("career.legacyNote")}
      </p>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <b className="block text-sm font-semibold">{t("career.title")}</b>
                <small className="text-xs text-fg-subtle">{t(draft.enabled ? "career.on" : "career.off")}</small>
              </div>
              <Switch on={draft.enabled} label="" ariaLabel={t("career.title")} onToggle={() => set({ enabled: !draft.enabled })} />
            </div>
            <label>
              <span className={label}>{t("career.subdomain")}</span>
              <div className="flex items-center gap-2">
                <Input
                  value={draft.subdomain}
                  maxLength={63}
                  placeholder="example"
                  aria-invalid={!subOk}
                  className={subOk ? "" : "border-danger"}
                  onChange={(e) => set({ subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                />
                <span className="shrink-0 text-sm text-fg-muted">.{CAREER_DOMAIN}</span>
              </div>
              <small className={hint}>{t("career.subdomainHint")}</small>
            </label>
          </section>

          <Section icon={PaletteIcon} title={t("career.branding")}>
            <label>
              <span className={label}>{t("career.name")}</span>
              {text("title", t("career.namePh"))}
              <small className={hint}>{t("career.nameHint")}</small>
            </label>
            <label>
              <span className={label}>{t("career.description")}</span>
              {long("seo_description", 2)}
              <small className={hint}>{t("career.descriptionHint")}</small>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField title={t("career.primary")} value={draft.primary_color} onChange={(v) => set({ primary_color: v })} />
              <ColorField title={t("career.accent")} value={draft.accent_color} onChange={(v) => set({ accent_color: v })} />
            </div>
            <ImageField title={t("career.logo")} note={t("career.logoHint")} icon={ImageIcon} value={draft.logo} upload={data.upload} onChange={(v) => set({ logo: v })} />
            <ImageField title={t("career.favicon")} note={t("career.faviconHint")} icon={AppWindowIcon} value={draft.favicon} upload={data.upload} onChange={(v) => set({ favicon: v })} />
            <ImageField title={t("career.background")} note={t("career.backgroundHint")} icon={ImageIcon} value={draft.background} upload={data.upload} onChange={(v) => set({ background: v })} />
          </Section>

          <Section icon={LayoutTemplateIcon} title={t("career.hero")}>
            <label>
              <span className={label}>{t("career.heroTitle")}</span>
              {text("hero_title", t("career.heroTitlePh"))}
            </label>
            <label>
              <span className={label}>{t("career.heroSubtitle")}</span>
              {long("hero_subtitle", 2)}
            </label>
            <label>
              <span className={label}>{t("career.about")}</span>
              {long("about", 4)}
            </label>
          </Section>

          <Section icon={ContactIcon} title={t("career.contacts")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={label}>{t("career.email")}</span>
                <Input value={draft.contact_email} placeholder="hr@company.com" className={emailOk ? "" : "border-danger"} onChange={(e) => set({ contact_email: e.target.value })} />
              </label>
              <label>
                <span className={label}>{t("career.website")}</span>
                {text("website", "https://company.com")}
              </label>
            </div>
          </Section>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-surface py-3">
            <span className={`text-xs ${dirty ? "text-warning" : "text-fg-subtle"}`}>{t(dirty ? "career.dirty" : "career.clean")}</span>
            <span className="flex-1" />
            <Button disabled={!dirty || data.saving || data.uploading} onClick={save}>
              {t("action.save")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:sticky xl:top-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">{t("career.preview")}</span>
            <Tabs
              variant="segment"
              activeId={mobile ? "m" : "d"}
              onSelect={(id) => setMobile(id === "m")}
              tabs={[
                { id: "d", label: "", icon: MonitorIcon },
                { id: "m", label: "", icon: SmartphoneIcon },
              ]}
            />
          </div>
          <Preview site={draft} vacancies={data.published} mobile={mobile} />
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon as={icon} size={15} className="text-fg-muted" />
        {title}
      </h3>
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">{children}</div>
    </section>
  );
}

/** Цвет: образец с системным выбором и поле HEX. Неверный HEX не применяется. */
function ColorField({ title, value, onChange }: { title: string; value: string; onChange: (hex: string) => void }) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => setHex(value.toUpperCase()), [value]);
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex items-center gap-2">
        <label className="relative size-(--spacing-input) shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-strong" style={{ background: value }}>
          <input type="color" value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0" />
        </label>
        <Input
          value={hex}
          maxLength={7}
          className={HEX.test(hex) ? "" : "border-danger"}
          onChange={(e) => {
            const v = e.target.value.trim();
            const next = v && !v.startsWith("#") ? `#${v}` : v;
            setHex(next.toUpperCase());
            if (HEX.test(next)) onChange(next);
          }}
        />
      </div>
    </div>
  );
}

function ImageField({
  title,
  note,
  icon,
  value,
  upload,
  onChange,
}: {
  title: string;
  note: string;
  icon: LucideIcon;
  value: string;
  upload: (file: File) => Promise<string>;
  onChange: (url: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE) return void toast.error(t("career.tooBig"));
    setBusy(true);
    upload(file)
      .then((url) => url && onChange(url), () => {})
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <small className="block text-xs text-fg-subtle">{note}</small>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <Icon as={ImagePlusIcon} size={13} />
            {t("career.upload")}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange("")}>
              <Icon as={Trash2Icon} size={13} />
              {t("action.delete")}
            </Button>
          )}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
      </div>
      <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-hover text-fg-subtle">
        {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <Icon as={icon} size={18} />}
      </div>
    </div>
  );
}

/**
 * Страница кандидата — по `draft`, а не по сохранённому: правка видна сразу.
 * Цвета бренда — данные компании, поэтому inline, а не токены темы.
 */
function Preview({ site, vacancies, mobile }: { site: Site; vacancies: PreviewVacancy[]; mobile: boolean }) {
  const { t } = useTranslation();
  const url = `https://${site.subdomain || "example"}.${CAREER_DOMAIN}`;
  const hero = site.background
    ? `linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.55)),url("${site.background}") center/cover`
    : `linear-gradient(135deg,${site.primary_color},${site.accent_color})`;
  const initial = (site.title.trim()[0] ?? "C").toUpperCase();
  return (
    <div className={`mx-auto w-full overflow-hidden rounded-xl border border-border bg-surface shadow-popover ${mobile ? "max-w-[380px]" : ""}`}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-hover px-3 py-2 text-xs text-fg-muted">
        {site.favicon ? <img src={site.favicon} alt="" className="size-3.5 rounded-sm" /> : <span className="size-3.5 rounded-sm" style={{ background: site.primary_color }} />}
        <span className="truncate">{site.title || t("career.untitled")}</span>
      </div>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs text-fg-subtle">
        <Icon as={LockIcon} size={11} />
        <span className="truncate">{url}</span>
      </div>
      {/* Цвета бренда — из настроек, остальное — токены темы. */}
      <div className="relative bg-surface text-fg">
        <div className="flex items-center gap-2 px-4 py-3">
          {site.logo ? (
            <img src={site.logo} alt="" className="h-7 max-w-24 object-contain" />
          ) : (
            <span className="grid size-7 place-items-center rounded-md text-sm font-bold text-white" style={{ background: site.primary_color }}>
              {initial}
            </span>
          )}
          <b className="truncate text-sm">{site.title}</b>
          <span className="flex-1" />
          {!mobile && <span className="text-xs text-fg-muted">{t("career.pVacancies")}</span>}
        </div>
        <div className="px-5 py-8 text-white" style={{ background: hero }}>
          <h3 className="text-xl leading-tight font-bold">{site.hero_title || t("career.heroTitlePh")}</h3>
          {site.hero_subtitle && <p className="mt-2 text-sm opacity-90">{site.hero_subtitle}</p>}
          <span className="mt-4 inline-block rounded-md bg-white px-3 py-1.5 text-xs font-semibold" style={{ color: site.primary_color }}>
            {t("career.pCta")}
          </span>
        </div>
        <div className="flex flex-col gap-2 px-4 py-4">
          <b className="text-sm">
            {t("career.pOpen")} <span style={{ color: site.accent_color }}>{vacancies.length}</span>
          </b>
          {vacancies.slice(0, 5).map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm">{v.title}</b>
                <small className="block truncate text-xs text-fg-muted">{[v.department, v.location].filter(Boolean).join(" · ")}</small>
              </div>
              <span className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ background: site.accent_color }}>
                {t("career.pApply")}
              </span>
            </div>
          ))}
          {!vacancies.length && <p className="text-xs text-fg-muted">{t("career.pNoVacancies")}</p>}
          {site.about && (
            <>
              <b className="mt-2 text-sm">{t("career.pAbout")}</b>
              <p className="text-xs whitespace-pre-line text-fg-muted">{site.about}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-fg-muted" style={{ borderTop: `3px solid ${site.primary_color}` }}>
          {site.contact_email && (
            <span className="inline-flex items-center gap-1">
              <Icon as={MailIcon} size={12} />
              {site.contact_email}
            </span>
          )}
          {site.website && (
            <span className="inline-flex items-center gap-1">
              <Icon as={GlobeIcon} size={12} />
              {site.website.replace(/^https?:\/\//, "")}
            </span>
          )}
        </div>
        {!site.enabled && (
          <div className="absolute inset-0 grid place-items-center bg-surface/85 text-center">
            <div>
              <Icon as={EyeOffIcon} size={22} className="mx-auto text-fg-muted" />
              <b className="mt-1 block text-sm">{t("career.pOff")}</b>
              <small className="text-xs text-fg-muted">{t("career.pOffHint")}</small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
