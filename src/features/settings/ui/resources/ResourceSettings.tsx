import { useState } from "react";
import {
  ChartColumnIcon,
  CodeXmlIcon,
  DatabaseIcon,
  PlugIcon,
  PuzzleIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import {
  CREATABLE,
  RESOURCE_GROUPS,
  RESOURCE_LABELS,
  RESOURCE_SPECS,
  useDeleteResource,
  useResources,
  type Resource,
  type ResourceGroup,
} from "../../api/resources";
import { CAPS_LABEL, SectionHeader } from "../parts";
import { CreateResourceDialog, EditResourceDialog } from "./ResourceDialog";
import { ResourceLogo } from "./ResourceIcon";

/**
 * Интеграции — `#s-integrations` прототипа: сверху подключённое,
 * ниже каталог того, что можно подключить, по категориям.
 *
 * В ucode это РЕСУРСЫ проекта — чужие службы, которыми он пользуется:
 * отправка кодов, репозиторий, аналитика, базы. Секреты интеграций
 * модулей (Payme, Telegram, Didox…) по PRD тоже лежат в ресурсах
 * (PRD §7.5), так что каталог один. Папка меню «Интеграции» в проекте —
 * другое: в ней журналы (входящие вебхуки, аудит AI), а не настройки.
 *
 * Логотипы — настоящие, из ugen (ResourceLogo), а не цветные плашки
 * с буквами прототипа: те держатся на захардкоженных цветах.
 *
 * Ресурс принадлежит ОКРУЖЕНИЮ: заведённый в dev в prod не появится.
 * Переключатель окружения — в шапке приложения, своего здесь нет.
 */
export function ResourceSettings() {
  const { t } = useTranslation();
  const { resources, isLoading } = useResources();
  const remove = useDeleteResource();

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ResourceGroup | "">("");

  /** Выбранный тип. Пусто — форма подключения закрыта. */
  const [creating, setCreating] = useState("");
  const [editing, setEditing] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);

  const clashing = duplicatedSenders(resources);
  const needle = query.trim().toLowerCase();
  const groupLabel = (value: ResourceGroup) => t(`resources.group.${value}` as TranslationKey);

  /** Подходит ли тип под поиск и категорию. Имя ресурса — тоже в поиске. */
  const fits = (kind: string, name = "") => {
    const spec = RESOURCE_SPECS[kind];
    if (group && spec?.group !== group) return false;
    const label = RESOURCE_LABELS[kind] ?? kind;
    const about = spec ? t(`resources.about.${kind}` as TranslationKey) : "";
    return !needle || `${name} ${label} ${about}`.toLowerCase().includes(needle);
  };

  const connected = resources.filter((resource) => fits(resource.kind, resource.name));
  const available = CREATABLE.map(({ group: id, kinds }) => ({
    id,
    kinds: kinds.filter((kind) => fits(kind)),
  })).filter((item) => item.kinds.length);

  return (
    /* Прокрутка своя: раздел широкий, и страница настроек её не даёт. */
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <SectionHeader title={t("resources.title")} hint={t("resources.hint")} />

      {/* `.ig-bar`: поиск во всю ширину и категория рядом. */}
      <div className="mb-4.5 flex flex-wrap gap-2.5">
        <div className="relative min-w-50 flex-1">
          <Icon
            as={SearchIcon}
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("resources.search")}
            aria-label={t("resources.search")}
            className="pl-9"
          />
        </div>

        <div className="w-full sm:w-48">
          <Dropdown
            value={group}
            ariaLabel={t("resources.category")}
            items={[
              { value: "", label: t("resources.allCategories") },
              ...RESOURCE_GROUPS.map((value) => ({ value, label: groupLabel(value) })),
            ]}
            onChange={(value) => setGroup(value as ResourceGroup | "")}
          />
        </div>
      </div>

      {clashing.length > 0 && (
        <p className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
          {t("resources.duplicate", { kinds: clashing.join(", ") })}
        </p>
      )}

      {isLoading && <p className="text-sm text-fg-subtle">{t("common.loading")}</p>}

      {connected.length > 0 && (
        <>
          <Heading label={t("resources.connected")} count={connected.length} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connected.map((resource) => {
              const spec = RESOURCE_SPECS[resource.kind];
              const label = RESOURCE_LABELS[resource.kind] ?? resource.kind;
              const info = spec?.fields?.find(
                (field) => field.kind === "text" && resource.settings[field.key],
              );

              return (
                /* `.ig-card.on`: полоса слева — признак подключённого.
                   Карточка открывает настройки ресурса целиком; удаление —
                   отдельной кнопкой, чтобы не попасть в него случайно. */
                <div
                  key={resource.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(resource)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditing(resource);
                    }
                  }}
                  className="group/card flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-[10px] border border-border border-l-3 border-l-success bg-surface p-3.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ResourceLogo kind={resource.kind} />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] font-semibold text-fg">
                        {resource.name}
                      </b>
                      <small className="block truncate text-xs text-fg-subtle">{label}</small>
                    </div>

                    {/* Удаления нет там, где оно не сработает: строку
                        проекта эта ручка не найдёт, а Telegram отклонит
                        со ссылкой на свою. */}
                    {!spec?.system && !spec?.noDelete ? (
                      <button
                        type="button"
                        aria-label={t("action.delete")}
                        title={t("action.delete")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleting(resource);
                        }}
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-fg-subtle opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-danger-subtle hover:text-danger focus-visible:opacity-100"
                      >
                        <Icon as={Trash2Icon} size={14} />
                      </button>
                    ) : null}

                    <span className="shrink-0 rounded-[5px] bg-chip-green-bg px-1.75 py-0.75 text-[10.5px] font-bold tracking-[.05em] text-chip-green-fg uppercase">
                      {t("resources.badgeConnected")}
                    </span>
                  </div>

                  {/* Главная настройка — как «Мерчант: udevs_crm» у
                      прототипа: первое заполненное текстовое поле типа.
                      Секретов здесь не бывает — пароли и токены не текст. */}
                  <p className="text-[13px] leading-snug text-fg-muted">
                    {info ? (
                      <>
                        {t(`resources.field.${info.key}` as TranslationKey)}:{" "}
                        <b className="font-semibold text-fg">{resource.settings[info.key]}</b>
                      </>
                    ) : spec?.system ? (
                      t("resources.systemShort")
                    ) : spec ? (
                      t(`resources.about.${resource.kind}` as TranslationKey)
                    ) : (
                      t("resources.managedShort")
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {available.length > 0 && (
        <>
          <Heading
            label={t("resources.available")}
            count={available.reduce((sum, item) => sum + item.kinds.length, 0)}
          />

          {available.map(({ id, kinds }) => (
            <section key={id} className="mt-5 first-of-type:mt-0">
              {/* `.ig-cat`: значок категории в рамке, имя и сколько в ней. */}
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid size-7.5 shrink-0 place-items-center rounded-lg border border-border text-fg-muted">
                  <Icon as={GROUP_ICONS[id]} size={15} />
                </span>
                <div>
                  <b className="block text-[14.5px] font-semibold text-fg">{groupLabel(id)}</b>
                  <small className="text-xs text-fg-subtle">
                    {t("resources.availableCount", { count: kinds.length })}
                  </small>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {kinds.map((kind) => (
                  <div
                    key={kind}
                    className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-border bg-surface p-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ResourceLogo kind={kind} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[14.5px] font-semibold text-fg">
                          {RESOURCE_LABELS[kind]}
                        </b>
                        <small className="block truncate text-xs text-fg-subtle">
                          {groupLabel(id)}
                        </small>
                      </div>
                    </div>

                    <p className="flex-1 text-[13px] leading-snug text-fg-muted">
                      {t(`resources.about.${kind}` as TranslationKey)}
                    </p>

                    <Button variant="secondary" size="sm" onClick={() => setCreating(kind)}>
                      <Icon as={PlugIcon} size={14} />
                      {t("resources.connect")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {!isLoading && !connected.length && !available.length && (
        <p className="p-7 text-center text-[13.5px] text-fg-subtle">{t("resources.notFound")}</p>
      )}

      {creating && <CreateResourceDialog kind={creating} onClose={() => setCreating("")} />}
      {editing && <EditResourceDialog id={editing.id} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title={t("resources.deleteTitle", { name: deleting.name })}
          description={t("resources.deleteDescription")}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </div>
  );
}

const GROUP_ICONS: Record<ResourceGroup, typeof PlugIcon> = {
  otp: ShieldCheckIcon,
  code: CodeXmlIcon,
  bi: ChartColumnIcon,
  db: DatabaseIcon,
  other: PuzzleIcon,
};

/** `.ig-h`: подпись капителью и число справа. */
function Heading({ label, count }: { label: string; count: number }) {
  return (
    <div className={`mt-5.5 mb-2.5 flex items-center justify-between first:mt-0 ${CAPS_LABEL}`}>
      {label}
      <span className="text-[12.5px] font-medium tracking-normal normal-case">{count}</span>
    </div>
  );
}


/**
 * Отправители кодов, заведённые дважды.
 *
 * Код берётся из ПЕРВОГО ресурса типа (`session_service_v2.go:1104`),
 * а порядка у списка нет вовсе — в запросе нет ORDER BY. То есть при
 * двух ресурсах одного типа неизвестно не только «какой лишний»,
 * но и «какой из них сейчас работает». Молчать об этом нельзя.
 */
function duplicatedSenders(resources: Resource[]): string[] {
  const counts = new Map<string, number>();

  for (const resource of resources) {
    if (RESOURCE_SPECS[resource.kind]?.group !== "otp") continue;
    counts.set(resource.kind, (counts.get(resource.kind) ?? 0) + 1);
  }

  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([kind]) => RESOURCE_LABELS[kind] ?? kind);
}
