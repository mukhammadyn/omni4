import { useMemo, useState, type ReactNode } from "react";
import {
  AwardIcon,
  BriefcaseBusinessIcon,
  BriefcaseIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  HeartIcon,
  IdCardIcon,
  KeyRoundIcon,
  LanguagesIcon,
  MapIcon,
  NetworkIcon,
  PencilIcon,
  PhoneIcon,
  PlaneIcon,
  SendIcon,
  ArrowLeftRightIcon,
  UserIcon,
  UserRoundCheckIcon,
  UserXIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActiveCell, Avatar, Cell } from "@/features/item";
import { localized, type Field } from "@/features/table";
import { RelationView } from "@/features/view";
import type { DataLanguage } from "@/features/workspace";
import { formatDate } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { toProfile, useEmployee, useNeighbours, useReports } from "../api/employee";
import { JOB_HISTORY } from "../api/job-history";
import { toPerson } from "../api/org";
import { monthsBetween, toDay } from "../model/job-history";
import { WorkHistory, spanText } from "./WorkHistory";

/** Вкладка «Личное» — своя, остальные — вкладки связей пункта меню. */
const PERSONAL = "personal";

/*
 * Карточки «Личного» — `TABS.personal` прототипа (employee.html).
 * Поля — слагами схемы ERP; чего в схеме нет или роли не видно,
 * того и в карточке нет.
 */
const CARDS: { icon: LucideIcon; title: TranslationKey; slugs: string[] }[] = [
  {
    icon: UserIcon,
    title: "employee.card.personal",
    slugs: ["last_name", "first_name", "middle_name", "birth_date", "gender", "hikvision_id", "status"],
  },
  {
    icon: PhoneIcon,
    title: "employee.card.contacts",
    slugs: ["email", "personal_email", "phone", "work_phone", "telegram_username"],
  },
  {
    icon: IdCardIcon,
    title: "employee.card.identity",
    slugs: ["pinfl", "passport_number", "address", "emergency_contact"],
  },
];

/** Метки — каждая своей карточкой со счётчиком, как «Интересы» и «Навыки» прототипа. */
const TAGS: { icon: LucideIcon; slug: string }[] = [
  { icon: HeartIcon, slug: "interests" },
  { icon: AwardIcon, slug: "skills" },
  { icon: LanguagesIcon, slug: "languages" },
];

/**
 * Сколько вкладок видно, остальные — в «Больше» (`MORE` прототипа:
 * «Личное» и семь разделов). Число, а не замер ширины: см. shared/ui/tabs.
 */
const VISIBLE_TABS = 8;

/**
 * Пункты «Действия», которые ведут в раздел: перевод — новая строка
 * истории работы, отпуск — заявка. Нет у пункта меню такой вкладки —
 * нет и пункта. Приглашения в бот и справки нет: им нечем работать.
 */
const TAB_ACTIONS: { table: string; icon: LucideIcon; label: TranslationKey }[] = [
  { table: "hr_job_history", icon: ArrowLeftRightIcon, label: "employee.action.transfer" },
  { table: "hr_requests", icon: PlaneIcon, label: "employee.action.leave" },
];

/** «Рабочие данные» сбоку — `.side-props` прототипа. */
const WORK = [
  "hire_date",
  "employment_type",
  "work_format",
  "positions_id",
  "grades_id",
  "departments_id",
  "locations_id",
  "legal_entities_id",
  "hr_work_schedules_id",
  "probation_end_date",
  "role_id",
];

/**
 * Страница сотрудника — `employee.html` прототипа: обложка, шапка
 * с аватаром и должностью, вкладки, на «Личном» — карточки полей
 * и колонка с рабочими данными, руководителем и подчинёнными.
 *
 * Сотрудника открывают страницей, а не карточкой сбоку: у него десяток
 * разделов (работа, начисления, отсутствия, документы…), и в drawer
 * они не помещаются. Разделы — вкладки связей пункта меню, рисует их
 * тот же RelationView, что и вкладки карточки.
 *
 * Поле правится щелчком по значению, тем же редактором, что в таблице
 * (ActiveCell): у поля один способ правки, где бы его ни открыли.
 */
export function EmployeePage({
  menuId,
  guid,
  tabId,
  locale,
  language,
  languages,
  onLanguage,
  onTab,
  onOpenEmployee,
  onBack,
  onOrgChart,
}: {
  menuId: string;
  guid: string;
  /** Открытая вкладка: id вкладки связи. Пусто — «Личное». */
  tabId: string | undefined;
  locale: string;
  language: string;
  languages: DataLanguage[];
  onLanguage: (code: string) => void;
  onTab: (id: string | undefined) => void;
  onOpenEmployee: (guid: string) => void;
  /** К списку сотрудников — крошка «назад» во вкладке связи. */
  onBack: () => void;
  /** Открыть вкладку оргструктуры пункта меню (id view). */
  onOrgChart: (viewId: string) => void;
}) {
  const { t } = useTranslation();
  const employee = useEmployee(menuId, guid, language);
  const reports = useReports(guid);
  const neighbours = useNeighbours(guid);
  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  /** «Изменить»: поля правятся, только пока режим включён, — как в прототипе. */
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const bySlug = useMemo(
    () => new Map(employee.fields.map((field) => [field.slug, field])),
    [employee.fields],
  );
  const relations = useMemo(
    () => new Map(employee.relations.map((relation) => [relation.id, relation])),
    [employee.relations],
  );

  const row = employee.row;
  if (!row) {
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">
        {employee.isLoading ? t("common.loading") : (employee.error ?? t("employee.notFound"))}
      </p>
    );
  }

  const person = toProfile(row);
  const tab = employee.tabs.find((item) => item.id === tabId);
  const status = bySlug.get("status");
  const activeField = active ? bySlug.get(active.slug) : undefined;

  const cell = (field: Field) => (
    <Cell
      field={field}
      row={row}
      tableSlug="employees"
      relations={relations}
      locale={locale}
      language={language}
      wrap
    />
  );

  /** Значение поля; в режиме правки — щелчок открывает редактор. */
  const value = (field: Field) =>
    editing ? (
      <button
        type="button"
        onClick={(event) =>
          setActive({ slug: field.slug, anchor: event.currentTarget.getBoundingClientRect() })
        }
        className="-mx-1.5 flex min-h-7 w-full min-w-0 items-center rounded-[5px] bg-input px-1.5 text-left shadow-[inset_0_0_0_1px_var(--color-border-strong)] transition-colors hover:bg-surface-hover"
      >
        {cell(field)}
      </button>
    ) : (
      <div className="flex min-h-7 min-w-0 items-center">{cell(field)}</div>
    );

  const label = (field: Field) => localized(field.labels, language, field.label);
  const allTabs = [
    { id: PERSONAL, label: t("employee.tab.personal") },
    ...employee.tabs.map((item) => ({ id: item.id, label: item.label })),
  ];
  const activeTab = tab?.id ?? PERSONAL;
  const lastSeen = formatDate(person.lastActivity, "datetime", locale);
  const password = employee.can.write ? bySlug.get("password") : undefined;
  const tabActions = TAB_ACTIONS.flatMap((action) => {
    const target = employee.tabs.find((item) => item.tableSlug === action.table);
    return target ? [{ ...action, id: target.id }] : [];
  });
  const canDismiss = employee.can.write && row.status !== "dismissed";
  const fieldsOf = (slugs: string[]) =>
    slugs.map((slug) => bySlug.get(slug)).filter((field): field is Field => Boolean(field));

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* `.page.wide`: во всю ширину, отступ 24px по бокам. */}
      <div className="px-6 pb-20 max-md:px-3">
        {/* Обложка — `.emp-cover`: мягкий градиент из оттенков палитры
            поверх сетки точек. Токены, а не цвета: в тёмной теме — свои. */}
        <div className="-mx-6 h-37.5 bg-surface-soft bg-[image:linear-gradient(135deg,color-mix(in_oklab,var(--color-accent)_14%,transparent),color-mix(in_oklab,var(--color-ai)_12%,transparent)_60%,color-mix(in_oklab,var(--color-module-hrms)_12%,transparent)),radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[auto,16px_16px] max-md:-mx-3 max-md:h-27.5" />

        {/* `.emp-head`: аватар заходит на обложку, имя и кнопки — под ней. */}
        <header className="relative z-1 -mt-13 flex flex-wrap items-start gap-4.5 px-2 pb-3.5">
          <Avatar name={person.name} photo={person.photo} size="2xl" />
          <div className="min-w-60 flex-1 pt-15 max-md:pt-14">
            <h1 className="mb-1 text-3xl font-bold tracking-[-0.01em] max-md:text-2xl">
              {person.name || "—"}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-fg-muted">
              <Meta icon={BriefcaseIcon} text={person.position} />
              <Meta icon={BriefcaseBusinessIcon} text={person.employer} />
              <Meta icon={MapIcon} text={employee.region} />
              <Meta icon={NetworkIcon} text={person.department} />
              <Meta icon={Building2Icon} text={person.location} />
              {status && <span className="flex">{cell(status)}</span>}
              <Chip icon={SendIcon} on={person.bot}>
                {t(person.bot ? "employee.botOn" : "employee.botOff")}
              </Chip>
              <Chip icon={ClockIcon}>{lastSeen ?? t("employee.neverLoggedIn")}</Chip>
            </div>
          </div>
          {/* `.emp-actions`: соседи, «Изменить», «Действие». */}
          <div className="flex items-center gap-1.5 pt-15 max-md:w-full max-md:pt-2.5">
            {neighbours && (
              <>
                <ArrowButton
                  icon={ChevronLeftIcon}
                  label={t("employee.prev")}
                  onClick={() => onOpenEmployee(neighbours.prev)}
                />
                <ArrowButton
                  icon={ChevronRightIcon}
                  label={t("employee.next")}
                  onClick={() => onOpenEmployee(neighbours.next)}
                />
              </>
            )}
            {employee.can.write && (
              /* Правка сохраняется сразу, по полю, поэтому выход
                 из режима — «Готово», а не «Сохранить». */
              <Button
                onClick={() => {
                  setEditing(!editing);
                  setActive(null);
                  if (!editing) onTab(undefined);
                }}
              >
                <Icon as={editing ? CheckIcon : PencilIcon} size={15} />
                {t(editing ? "employee.done" : "employee.edit")}
              </Button>
            )}
            {(password || tabActions.length > 0 || canDismiss) && (
              <Popover
                align="end"
                trigger={({ open, toggle }) => (
                  <Button variant="secondary" onClick={toggle} aria-expanded={open}>
                    {t("employee.actions")}
                    <Icon as={ChevronDownIcon} size={14} />
                  </Button>
                )}
              >
                {(close) => (
                  /* Ширину меню задаёт содержимое: 270px — `#empActPop`. */
                  <div className="w-67.5">
                    {password && (
                      <PopoverItem
                        icon={<Icon as={KeyRoundIcon} size={15} />}
                        onClick={(event) => {
                          /* Пароль — поле таблицы входа: ucode сам
                             переносит его в auth. Редактор — тот же. */
                          setActive({
                            slug: password.slug,
                            anchor: event.currentTarget.getBoundingClientRect(),
                          });
                          close();
                        }}
                      >
                        {t("employee.action.password")}
                      </PopoverItem>
                    )}
                    {tabActions.map((action) => (
                      <PopoverItem
                        key={action.id}
                        icon={<Icon as={action.icon} size={15} />}
                        onClick={() => {
                          onTab(action.id);
                          close();
                        }}
                      >
                        {t(action.label)}
                      </PopoverItem>
                    ))}
                    {canDismiss && (password || tabActions.length > 0) && <PopoverSeparator />}
                    {canDismiss && (
                      <PopoverItem
                        danger
                        icon={<Icon as={UserXIcon} size={15} />}
                        onClick={() => {
                          setDismissing(true);
                          close();
                        }}
                      >
                        {t("employee.action.dismiss")}
                      </PopoverItem>
                    )}
                  </div>
                )}
              </Popover>
            )}
          </div>
        </header>

        <div className="mb-4 flex border-b border-border">
          <Tabs
            activeId={activeTab}
            onSelect={(id) => onTab(id === PERSONAL ? undefined : id)}
            tabs={allTabs.slice(0, VISIBLE_TABS)}
          />
          <MoreTabs
            tabs={allTabs.slice(VISIBLE_TABS)}
            activeId={activeTab}
            label={t("employee.more")}
            onSelect={onTab}
          />
        </div>

        {tab?.tableSlug === JOB_HISTORY && tab.direction === "incoming" ? (
          <WorkHistory
            key={tab.id}
            employee={guid}
            link={tab.fieldSlug}
            menuId={menuId}
            locale={locale}
            language={language}
            languages={languages}
            onLanguage={onLanguage}
          />
        ) : tab ? (
          <div className="flex h-[70vh] min-h-105 flex-col">
            <RelationView
              key={tab.id}
              tab={tab}
              parentGuid={guid}
              {...(tab.direction === "outgoing"
                ? { parentValue: String(row[tab.fieldSlug] ?? "") }
                : {})}
              menuId={menuId}
              locale={locale}
              language={language}
              languages={languages}
              onLanguage={onLanguage}
              trail={[
                { label: t("employee.back"), onClick: onBack },
                { label: person.name, onClick: () => onTab(undefined) },
              ]}
            />
          </div>
        ) : (
          /* `.emp-grid`: поля слева, рабочие данные справа; узко — столбиком. */
          <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              {CARDS.map((card) => {
                const fields = fieldsOf(card.slugs);
                if (!fields.length) return null;
                return (
                  <Card key={card.title} icon={card.icon} title={t(card.title)}>
                    {card.title === "employee.card.personal" && (
                      <Row label={t("employee.id")}>
                        <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[12.5px]">
                          {guid}
                        </code>
                      </Row>
                    )}
                    {fields.map((field) => (
                      <Row key={field.id} label={label(field)}>
                        {value(field)}
                      </Row>
                    ))}
                  </Card>
                );
              })}
              {TAGS.map(({ icon, slug }) => {
                const field = bySlug.get(slug);
                if (!field) return null;
                const count = Array.isArray(row[slug]) ? (row[slug] as unknown[]).length : 0;
                return (
                  <Card key={slug} icon={icon} title={label(field)} count={count}>
                    {value(field)}
                  </Card>
                );
              })}
            </div>

            <aside>
              <Card icon={BriefcaseIcon} title={t("employee.card.work")}>
                <div className="flex flex-col gap-3 pt-1">
                  {fieldsOf(WORK).map((field) => (
                    <SideProp key={field.id} label={label(field)}>
                      {value(field)}
                    </SideProp>
                  ))}
                  <Tenure since={row.hire_date} />
                </div>
              </Card>

              <Card icon={UserRoundCheckIcon} title={t("employee.card.manager")}>
                {person.managerId && person.managerName ? (
                  <PersonLink
                    name={person.managerName}
                    photo={person.managerPhoto}
                    onClick={() => onOpenEmployee(person.managerId)}
                  />
                ) : (
                  <p className="py-1.5 text-sm text-fg-subtle">{t("employee.noManager")}</p>
                )}
              </Card>

              {reports.length > 0 && (
                <Card icon={UsersIcon} title={t("employee.card.reports")} count={reports.length}>
                  {reports.map(toPerson).map((report) => (
                    <PersonLink
                      key={report.id}
                      name={report.name}
                      photo={report.photo}
                      sub={report.position}
                      onClick={() => onOpenEmployee(report.id)}
                    />
                  ))}
                </Card>
              )}

              {employee.orgViewId && (
              <button
                type="button"
                onClick={() => employee.orgViewId && onOrgChart(employee.orgViewId)}
                className="flex h-10 w-full items-center gap-1.5 rounded-[10px] border border-border-strong px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
              >
                <Icon as={NetworkIcon} size={15} />
                {t("employee.orgChart")}
              </button>
              )}
            </aside>
          </div>
        )}
      </div>

      {dismissing && (
        <ConfirmDialog
          title={t("employee.action.dismiss")}
          description={t("employee.dismissHint", { name: person.name })}
          confirmLabel={t("employee.action.dismiss")}
          busy={false}
          onConfirm={() => {
            employee.dismiss();
            setDismissing(false);
          }}
          onClose={() => setDismissing(false)}
        />
      )}

      {active && activeField && (
        <ActiveCell
          key={active.slug}
          field={activeField}
          row={row}
          guid={guid}
          tableSlug="employees"
          anchor={active.anchor}
          relations={relations}
          locale={locale}
          language={language}
          onEdit={(next) => employee.edit(active.slug, next)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function Meta({ icon, text }: { icon: LucideIcon; text: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.25">
      <Icon as={icon} size={14} className="text-fg-subtle" />
      {text}
    </span>
  );
}

/** `.mchip`: бот и последний вход — тише меты, плашкой. */
function Chip({ icon, on, children }: { icon: LucideIcon; on?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-full px-1.75 text-[11.5px] ${
        on ? "bg-callout-blue text-accent-text" : "bg-surface-hover text-fg-subtle"
      }`}
    >
      <Icon as={icon} size={11} />
      {children}
    </span>
  );
}

/** `.x-btn` прототипа: стрелка к соседу по списку. */
function ArrowButton({ icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-[5px] text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
    >
      <Icon as={icon} size={16} />
    </button>
  );
}

/**
 * «Больше» — разделы за пределами полосы (`#empMore` прототипа). Открыт
 * раздел отсюда — кнопка носит его имя и черту активной вкладки.
 */
function MoreTabs({
  tabs,
  activeId,
  label,
  onSelect,
}: {
  tabs: { id: string; label: string }[];
  activeId: string;
  label: string;
  onSelect: (id: string) => void;
}) {
  if (!tabs.length) return null;
  const active = tabs.find((tab) => tab.id === activeId);
  return (
    <Popover
      className="flex self-stretch"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`group/tab relative inline-flex min-h-9 shrink-0 items-center px-2 text-sm font-medium whitespace-nowrap transition-colors ${
            active
              ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-fg"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.75 transition-colors group-hover/tab:bg-surface-hover">
            {active?.label ?? label}
            <Icon as={ChevronDownIcon} size={14} />
          </span>
        </button>
      )}
    >
      {(close) =>
        tabs.map((tab) => (
          <PopoverItem
            key={tab.id}
            {...(tab.id === activeId
              ? { trailing: <Icon as={CheckIcon} size={14} className="shrink-0" /> }
              : {})}
            onClick={() => {
              onSelect(tab.id);
              close();
            }}
          >
            {tab.label}
          </PopoverItem>
        ))
      }
    </Popover>
  );
}

/** `.erow`: подпись слева, значение справа, волосяная черта между строками. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9.5 items-center border-b border-border text-sm last:border-b-0">
      <span className="w-50 shrink-0 py-1.5 pr-3 text-fg-muted max-md:w-32.5">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** `.side-props`: подпись капсом над значением. */
function SideProp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm font-semibold">
      <small className="block text-[11.5px] font-medium tracking-[0.3px] text-fg-subtle uppercase">
        {label}
      </small>
      {children}
    </div>
  );
}

/** `.ecard` прототипа: рамка, шапка со значком, тело. */
function Card({
  icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-3.5 rounded-[10px] border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon as={icon} size={16} className="text-fg-muted" />
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {count !== undefined && <span className="text-sm text-fg-subtle">{count}</span>}
      </div>
      <div className="px-4 pt-2 pb-3">{children}</div>
    </section>
  );
}

/** Человек ссылкой — `.emp-link`: аватар, имя, должность. */
function PersonLink({
  name,
  photo,
  sub,
  onClick,
}: {
  name: string;
  photo: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-hover"
    >
      <Avatar name={name} photo={photo} />
      <span className="min-w-0">
        <b className="block truncate text-sm font-medium">{name}</b>
        {sub && <small className="block truncate text-xs text-fg-muted">{sub}</small>}
      </span>
    </button>
  );
}

/** «Срок работы» от даты приёма: «2 г. 3 мес.». */
function Tenure({ since }: { since: unknown }) {
  const { t } = useTranslation();
  const start = toDay(since);
  if (!start) return null;

  return (
    <SideProp label={t("employee.tenure")}>
      <div className="flex min-h-7 items-center">{spanText(monthsBetween(start, new Date()), t)}</div>
    </SideProp>
  );
}
