import { Suspense, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  CalendarOffIcon,
  ClipboardListIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  PackageIcon,
  TargetIcon,
  WalletIcon,
  KeyRoundIcon,
  AwardIcon,
  BriefcaseBusinessIcon,
  CameraIcon,
  BriefcaseIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  HeartIcon,
  IdCardIcon,
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
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ActiveCell, Avatar, Cell, editorKind, PEOPLE, uploadFolder, useUploadFiles } from "@/features/item";
import { session } from "@/shared/api/session";
import { localized, type Field } from "@/features/table";
import { UserDialog } from "@/features/settings";
import { RelationView } from "@/features/view";
import type { DataLanguage } from "@/features/workspace";
import { formatDate } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Chip as Tag, hexToChipColor } from "@/shared/ui/chip";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { EMPLOYEES, toProfile, useEmployee, useNeighbours, useReports } from "../api/employee";
import { isAssignment, JOB_HISTORY, useJobHistory } from "../api/job-history";
import { PAYROLL_LINES } from "../api/payroll";
import { SHIFTS } from "../api/schedule";

import { text, toPerson } from "../api/org";
import { monthsBetween, toDay } from "../model/job-history";
import { Card, Meta, Row, SideProp } from "./page-parts";
import { ABSENCES_TAB, ASSETS_TAB, ATTENDANCE_TAB, DOCS_TAB, SCHEDULE_TAB, SURVEYS_TAB, TRAININGS_TAB, KPI_TAB } from "./employee-tabs";
import { EmployeeKpi } from "./EmployeeKpi";
import { SCORECARDS } from "../api/kpi";
import { EmployeeTrainings } from "./EmployeeTrainings";
import { PARTICIPANTS as TRAINING_PARTICIPANTS } from "../api/training";
import { DocumentBrowser } from "./DocumentBrowser";
import { DOCUMENTS } from "../api/document";
import { EmployeeAssets } from "./EmployeeAssets";
import { ASSETS } from "../api/asset";
import { EmployeeSurveys } from "./EmployeeSurveys";
import { SURVEY_PARTICIPANTS } from "../api/survey";
import { DismissDialog } from "./DismissDialog";
import { EmployeeCompensation } from "./EmployeeCompensation";
import { EmployeeAbsences } from "./EmployeeAbsences";
import { EmployeeAttendance } from "./EmployeeAttendance";
import { EmployeeSchedule } from "./EmployeeSchedule";
import { WorkHistory, spanText } from "./WorkHistory";

/** Свои вкладки — «Личное» и employee-tabs; остальные — вкладки связей пункта меню. */
const PERSONAL = "personal";
/** Своя вкладка → таблица вкладки связи, место которой она занимает. */
const OWN_TABLES: Record<string, string> = {
  [ABSENCES_TAB]: "hr_requests",
  [ATTENDANCE_TAB]: "hr_attendance_days",
  [SCHEDULE_TAB]: SHIFTS,
  [TRAININGS_TAB]: TRAINING_PARTICIPANTS,
  [KPI_TAB]: SCORECARDS,
  [SURVEYS_TAB]: SURVEY_PARTICIPANTS,
  [ASSETS_TAB]: ASSETS,
  [DOCS_TAB]: DOCUMENTS,
};
const OWN_TITLES: Record<string, TranslationKey> = {
  [ABSENCES_TAB]: "employeeAbsences.title",
  [ATTENDANCE_TAB]: "employeeAttendance.title",
  [SCHEDULE_TAB]: "employeeSchedule.title",
  [TRAININGS_TAB]: "training.back",
  [KPI_TAB]: "kpi.title",
  [SURVEYS_TAB]: "survey.take.title",
  [ASSETS_TAB]: "asset.tab.title",
  [DOCS_TAB]: "doc.title",
};
const OWN_TABS = new Set(Object.keys(OWN_TABLES));

/** Значок вкладки в «Больше» — `MORE_IC` прототипа, по таблице вкладки. */
const TAB_ICONS: Record<string, LucideIcon> = {
  [JOB_HISTORY]: BriefcaseIcon,
  [PAYROLL_LINES]: WalletIcon,
  hr_requests: CalendarOffIcon,
  hr_attendance_days: ClockIcon,
  [SHIFTS]: CalendarDaysIcon,
  hr_documents: FileTextIcon,
  hr_assets: PackageIcon,
  [SCORECARDS]: TargetIcon,
  hr_training_participants: GraduationCapIcon,
  hr_survey_participants: ClipboardListIcon,
  hr_qualifications: AwardIcon,
};

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
  "hr_positions_id",
  "hr_grades_id",
  "core_business_units_ids",
  "hr_departments_id",
  "hr_locations_id",
  "hr_work_schedules_id",
  "probation_end_date",
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
  const navigate = useNavigate();
  const employee = useEmployee(menuId, guid, language);
  const reports = useReports(guid);
  const neighbours = useNeighbours(guid);
  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  /** «Изменить»: поля правятся, только пока режим включён, — как в прототипе. */
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [granting, setGranting] = useState(false);
  // Выше раннего return: хуки — до любого выхода из рендера.
  const upload = useUploadFiles();
  /*
   * Поля назначения (отдел, должность, юниты…) — копия текущей записи
   * истории. Их правка здесь — ИСПРАВЛЕНИЕ этой записи, а не новое
   * назначение: пишется в историю, оттуда копируется в карточку.
   * Повышение и перевод — новой записью во вкладке «Работа».
   */
  const jobLink = employee.tabs.find((tab) => tab.tableSlug === JOB_HISTORY)?.fieldSlug ?? "hr_employees_id";
  const job = useJobHistory({ employee: guid, link: jobLink, menuId, language });
  const currentJob = job.entries.find((entry) => entry.current);
  /** Поле, которое тут правится: своё — как есть, назначение — в обход «только чтения». */
  const editable = (field: Field) =>
    isAssignment(field.slug) && !field.locked ? { ...field, editable: true } : field;
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

  const person = toProfile(row, employee.user);
  const tab = employee.tabs.find((item) => item.id === tabId);
  const status = bySlug.get("status");
  const units = bySlug.get("core_business_units_ids");
  const ownUnits = Array.isArray(row.core_business_units_ids) && row.core_business_units_ids.length > 0;
  const photoField = bySlug.get("photo");
  /* Новое фото — файлом в хранилище, в поле уходит его адрес. */
  const changePhoto = (file: File | undefined) => {
    if (!file || !photoField) return;
    upload
      .mutateAsync({ files: [file], folder: uploadFolder(photoField.attributes) })
      .then((urls) => urls[0] && employee.edit("photo", urls[0]), () => undefined);
  };
  const activeField = active ? bySlug.get(active.slug) : undefined;

  const cell = (field: Field) => (
    <Cell
      field={field}
      row={row}
      tableSlug={EMPLOYEES}
      relations={relations}
      locale={locale}
      language={language}
      wrap
    />
  );

  /**
   * Значение поля; в режиме правки — щелчок открывает редактор. Поле,
   * которое править нельзя, полем ввода не рисуется: пустой список по
   * щелчку читался как поломка.
   */
  const value = (field: Field) =>
    editing && editorKind(editable(field)) ? (
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
  /*
   * Свои вкладки встают НА МЕСТО вкладок связей своей таблицы: имя
   * и порядок по-прежнему задаёт админ, внутри — наш экран вместо таблицы
   * связи. Нет такой вкладки у пункта — своя встаёт после «Работы»
   * (истории назначений), как в прототипе.
   */
  const ownOf = (tableSlug: string) => Object.entries(OWN_TABLES).find(([, slug]) => slug === tableSlug)?.[0];
  /* «Задачи» сотрудника в карточке не нужны — их место в модуле задач. */
  const linked = employee.tabs.filter((item) => item.tableSlug !== "hr_tasks");
  const relationTabs = linked.map((item) => {
    const ownId = ownOf(item.tableSlug);
    return { id: ownId ?? item.id, label: item.label, icon: TAB_ICONS[item.tableSlug] ?? FolderIcon };
  });
  const missing = Object.keys(OWN_TABLES)
    .filter((id) => !relationTabs.some((item) => item.id === id))
    .map((id) => ({ id, label: t(OWN_TITLES[id]!), icon: TAB_ICONS[OWN_TABLES[id]!] ?? FolderIcon }));
  const work = linked.findIndex((item) => item.tableSlug === JOB_HISTORY);
  const allTabs = [
    { id: PERSONAL, label: t("employee.tab.personal") },
    ...relationTabs.slice(0, work + 1),
    ...missing,
    ...relationTabs.slice(work + 1),
  ];
  const own = tabId && OWN_TABS.has(tabId) ? tabId : undefined;
  const activeTab = own ?? tab?.id ?? PERSONAL;
  const lastSeen = formatDate(person.lastActivity, "datetime", locale);
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
          {employee.can.write && photoField && !photoField.locked ? (
            <label
              title={t("employee.changePhoto")}
              className="group/avatar relative shrink-0 cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-accent"
            >
              <Avatar name={person.name} photo={person.photo} size="2xl" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-overlay text-accent-fg opacity-0 transition-opacity group-hover/avatar:opacity-100">
                <Icon as={CameraIcon} size={22} />
              </span>
              <input
                type="file"
                accept="image/*"
                aria-label={t("employee.changePhoto")}
                disabled={upload.isPending}
                className="sr-only"
                onChange={(event) => {
                  changePhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          ) : (
            <Avatar name={person.name} photo={person.photo} size="2xl" />
          )}
          <div className="min-w-60 flex-1 pt-15 max-md:pt-14">
            <h1 className="mb-1 text-3xl font-bold tracking-[-0.01em] max-md:text-2xl">
              {person.name || "—"}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-fg-muted">
              <Meta icon={BriefcaseIcon} text={person.position} />
              {/* Юнитов бывает несколько — ячейкой связи, она и подписи берёт (Many2Many без `_data`). */}
              {units && ownUnits ? (
                <span className="inline-flex min-w-0 items-center gap-1.25">
                  <Icon as={BriefcaseBusinessIcon} size={14} className="text-fg-subtle" />
                  {cell(units)}
                </span>
              ) : (
                employee.defaultUnit && (
                  <span className="inline-flex min-w-0 items-center gap-1.25">
                    <Icon as={BriefcaseBusinessIcon} size={14} className="text-fg-subtle" />
                    <OwnerUnit unit={employee.defaultUnit} />
                  </span>
                )
              )}
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
            {/* Нет строки в `core_users` — нет и входа: заводим её отсюда. */}
            {employee.can.write && !employee.user && (
              <Button variant="secondary" onClick={() => setGranting(true)}>
                <Icon as={KeyRoundIcon} size={15} />
                {t("employee.grantAccess")}
              </Button>
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
            {(tabActions.length > 0 || canDismiss) && (
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
                    {canDismiss && tabActions.length > 0 && <PopoverSeparator />}
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

        {own === ATTENDANCE_TAB ? (
          <EmployeeAttendance employeeId={guid} />
        ) : own === SCHEDULE_TAB ? (
          <EmployeeSchedule employeeId={guid} />
        ) : own === DOCS_TAB ? (
          <section className="mb-3.5 rounded-[10px] border border-border bg-surface p-4">
            <DocumentBrowser employeeId={guid} locale={locale} />
          </section>
        ) : own === ASSETS_TAB ? (
          <EmployeeAssets
            employeeId={guid}
            locale={locale}
            language={language}
            onOpenAsset={(asset) => void navigate({ to: "/assets/$itemId", params: { itemId: asset }, search: { menu: "" } })}
          />
        ) : own === KPI_TAB ? (
          <EmployeeKpi
            employeeId={guid}
            positionId={String(row.hr_positions_id ?? "")}
            departmentId={String(row.hr_departments_id ?? "")}
            language={language}
          />
        ) : own === TRAININGS_TAB ? (
          <EmployeeTrainings
            employeeId={guid}
            locale={locale}
            language={language}
            onOpenTraining={(training) => void navigate({ to: "/trainings/$itemId", params: { itemId: training }, search: { menu: "" } })}
          />
        ) : own === SURVEYS_TAB ? (
          <EmployeeSurveys
            employeeId={guid}
            /* Своя карточка — вошедший и есть этот сотрудник: тогда «Пройти». */
            own={Boolean(employee.user?.guid) && employee.user?.guid === session.getObjectIds()[PEOPLE]}
            locale={locale}
            language={language}
            onOpenSurvey={(survey) => void navigate({ to: "/surveys/$itemId", params: { itemId: survey }, search: { menu: "" } })}
          />
        ) : own === ABSENCES_TAB ? (
          <EmployeeAbsences employeeId={guid} hireDate={String(row.hire_date ?? "").slice(0, 10)} />
        ) : tab?.tableSlug === PAYROLL_LINES && tab.direction === "incoming" ? (
          <EmployeeCompensation employeeId={guid} departmentId={String(row.hr_departments_id ?? "")} />
        ) : tab?.tableSlug === JOB_HISTORY && tab.direction === "incoming" ? (
          <WorkHistory
            key={tab.id}
            employee={guid}
            link={tab.fieldSlug}
            menuId={menuId}
            locale={locale}
            language={language}
          />
        ) : tab?.viaUser && !employee.user ? (
          <p className="p-8 text-center text-sm text-fg-subtle">{t("employee.noUser")}</p>
        ) : tab ? (
          <div className="flex h-[70vh] min-h-105 flex-col">
            <RelationView
              key={tab.id}
              tab={tab}
              parentGuid={tab.viaUser ? String(employee.user?.guid ?? "") : guid}
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
                      {field.slug === "core_business_units_ids" && !ownUnits && !editing && employee.defaultUnit ? (
                        <OwnerUnit unit={employee.defaultUnit} />
                      ) : (
                        value(field)
                      )}
                      {/* В локации несколько юнитов — свой не угадать, его нужно указать. */}
                      {field.slug === "core_business_units_ids" && !ownUnits && employee.locationUnits > 1 && (
                        <p className="mt-1 text-xs text-fg-subtle">{t("employee.unitPickOwn")}</p>
                      )}
                    </SideProp>
                  ))}
                  <Tenure since={row.hire_date} />
                  {editing && currentJob && <p className="text-xs text-fg-subtle">{t("employee.fixesCurrent")}</p>}
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

      {granting && (
        <Suspense>
          <UserDialog
            employee={{ id: guid, name: person.name, email: text(row.email), phone: text(row.phone) }}
            onClose={() => setGranting(false)}
          />
        </Suspense>
      )}

      {dismissing && (
        <DismissDialog
          name={person.name}
          language={language}
          onConfirm={(date, reasonId) => {
            employee.dismiss(date, reasonId);
            setDismissing(false);
          }}
          onClose={() => setDismissing(false)}
        />
      )}

      {active && activeField && (
        <ActiveCell
          key={active.slug}
          field={editable(activeField)}
          row={row}
          guid={guid}
          tableSlug={EMPLOYEES}
          anchor={active.anchor}
          relations={relations}
          locale={locale}
          language={language}
          onEdit={(next) =>
            /* Нет действующей записи истории — правим карточку, как раньше. */
            isAssignment(active.slug) && currentJob
              ? job.edit(currentJob.id, active.slug, next)
              : employee.edit(active.slug, next)
          }
          onClose={() => setActive(null)}
        />
      )}
    </div>
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
  tabs: { id: string; label: string; icon?: LucideIcon }[];
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
            {...(tab.icon ? { icon: <Icon as={tab.icon} size={16} className="shrink-0 text-fg-muted" /> } : {})}
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

/** Юнит по умолчанию — единственный юнит локации: тот же чип, с пометкой, откуда он. */
function OwnerUnit({ unit }: { unit: { name: string; color: string } }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={t("employee.unitByLocationHint")}>
      <Tag color={unit.color ? hexToChipColor(unit.color) : "gray"}>{unit.name}</Tag>
      <span className="text-xs text-fg-subtle">{t("employee.unitByLocation")}</span>
    </span>
  );
}
