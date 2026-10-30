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
  BookUserIcon,
  GlobeIcon,
  MessageSquareIcon,
  ScanSearchIcon,
  SplitIcon,
  BadgeCheckIcon,
  CameraIcon,
  BriefcaseIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  HeartIcon,
  LanguagesIcon,
  MapIcon,
  MapPinIcon,
  NetworkIcon,
  PencilIcon,
  PlaneIcon,
  SendIcon,
  ArrowLeftRightIcon,
  ArrowDownUpIcon,
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
import { PasswordDialog, UserDialog } from "@/features/settings";
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
import { parsePinfl, splitFullName } from "../model/personal";
import { applyOrder } from "../model/tab-order";
import { MORE, TabOrder } from "./TabOrder";
import { useUi } from "@/shared/lib/ui-store";
import { toast } from "@/shared/lib/toast";
import { isAssignment, JOB_HISTORY, useJobHistory } from "../api/job-history";
import { PAYROLL_LINES } from "../api/payroll";
import { SHIFTS } from "../api/schedule";

import { firstText, text, toPerson } from "../api/org";
import { monthsBetween, toDay } from "../model/job-history";
import { Card, Meta, Row, SideProp } from "./page-parts";
import { ABSENCES_TAB, ASSETS_TAB, ATTENDANCE_TAB, DOCS_TAB, SCHEDULE_TAB, SURVEYS_TAB, TRAININGS_TAB, KPI_TAB, CONTACTS_TAB, FAMILY_TAB, EDUCATION_TAB } from "./employee-tabs";
import { CONTACTS_GRID, EDUCATION_GRID, EmployeeGrid, FAMILY_GRID } from "./EmployeeGrid";
import { CONTACTS, FAMILY, QUALIFICATIONS, useEmployeeRows } from "../api/employee-rows";
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
  [CONTACTS_TAB]: CONTACTS,
  [FAMILY_TAB]: FAMILY,
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
  [CONTACTS_TAB]: "employee.tab.contacts",
  [FAMILY_TAB]: "employee.tab.family",
};
/** Вкладки-таблицы (`gridTab` прототипа). «Образование» — без места в OWN_TABLES, см. allTabs. */
const GRIDS: Record<string, typeof CONTACTS_GRID> = {
  [CONTACTS_TAB]: CONTACTS_GRID,
  [FAMILY_TAB]: FAMILY_GRID,
  [EDUCATION_TAB]: EDUCATION_GRID,
};
const CERTIFICATES = { type: "certificate" };
const OWN_TABS = new Set([...Object.keys(OWN_TABLES), EDUCATION_TAB]);

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
  [CONTACTS]: MapPinIcon,
  [FAMILY]: UsersIcon,
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
    slugs: [
      "full_name",
      "last_name",
      "first_name",
      "middle_name",
      "employee_code",
      "birth_date",
      "gender",
      "nationality",
      "birth_place",
      "inn",
      "inps",
      "pinfl",
      "hikvision_id",
      "status",
    ],
  },
  {
    icon: BookUserIcon,
    title: "employee.card.idDocument",
    slugs: [
      "id_doc_kind",
      "id_doc_series",
      "passport_number",
      "id_doc_issued_by",
      "id_doc_issued_on",
      "id_doc_valid_until",
      "id_doc_valid_from",
      "military_record",
    ],
  },
  {
    icon: GlobeIcon,
    title: "employee.card.citizenship",
    slugs: ["citizenship_status", "citizenship_country", "foreign_inn", "no_inps", "citizenship_from"],
  },
];

/**
 * Строки гражданства, которые к человеку не относятся (`cit()` прототипа):
 * у лица без гражданства нет страны, у гражданина Узбекистана — иностранного ИНН.
 */
const offRow = (slug: string, row: Record<string, unknown>) => {
  const status = firstText(row.citizenship_status);
  if (slug === "citizenship_country") return status === "stateless";
  if (slug === "foreign_inn") return status !== "stateless" && firstText(row.citizenship_country) === "uz";
  return false;
};

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
  /* «Лицензии и сертификаты» на «Личном»: образование из той же таблицы — своей вкладкой. */
  const certificates = useEmployeeRows(QUALIFICATIONS, guid, CERTIFICATES).rows;
  /* Почта и телефон для «Дать вход» — из «Адресов и телефонов», первое заполненное по названию. */
  const contacts = useEmployeeRows(CONTACTS, guid).rows;
  const contactOf = (name: string) => text(contacts.find((row) => firstText(row.name) === name && text(row.value))?.value);
  const [active, setActive] = useState<{ slug: string; anchor: DOMRect } | null>(null);
  /** «Изменить»: поля правятся, только пока режим включён, — как в прототипе. */
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [granting, setGranting] = useState(false);
  const [resetting, setResetting] = useState(false);
  /* «Порядок вкладок»: окно, порядок и граница «Больше» — свои у каждого, в ui-store. */
  const [arranging, setArranging] = useState(false);
  const orderKey = `employee-tab-order:${menuId}`;
  const savedOrder = useUi((s) => s.viewState[orderKey]);
  const setViewState = useUi((s) => s.setViewState);
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
  const label = (field: Field) => localized(field.labels, language, field.label);
  /* Новое фото или подпись — файлом в хранилище, в поле уходит его адрес. */
  const changeImage = (slug: string, file: File | undefined) => {
    const field = bySlug.get(slug);
    if (!file || !field) return;
    upload
      .mutateAsync({ files: [file], folder: uploadFolder(field.attributes) })
      .then((urls) => urls[0] && employee.edit(slug, urls[0]), () => undefined);
  };
  const changePhoto = (file: File | undefined) => changeImage("photo", file);
  /* «Разобрать» и «Заполнить по ПИНФЛ» — только в режиме правки, как прочие правки. */
  const tools = editing && employee.can.write;
  const splitName = () => employee.editMany(splitFullName(text(row.full_name)));
  const fillByPinfl = () => {
    const parsed = parsePinfl(text(row.pinfl));
    if (!parsed) return void toast.error(t("employee.pinflInvalid"));
    employee.editMany({
      birth_date: parsed.birth,
      gender: parsed.gender,
      ...(text(row.inps) ? {} : { inps: text(row.pinfl).replace(/\D/g, "") }),
    }, () => toast.success(t("employee.pinflFilled")));
  };
  const toolFor: Record<string, ReactNode> = {
    full_name: (
      <Button type="button" size="sm" variant="secondary" onClick={splitName} title={t("employee.splitHint")}>
        <Icon as={SplitIcon} size={14} />
        {t("employee.split")}
      </Button>
    ),
    pinfl: (
      <Button type="button" size="sm" variant="secondary" onClick={fillByPinfl}>
        <Icon as={ScanSearchIcon} size={14} />
        {t("employee.fillByPinfl")}
      </Button>
    ),
  };
  /** Фото и подпись — маленькими плитками над полями, а не отдельной карточкой. */
  const media = (["photo", "signature"] as const).flatMap((slug) => {
    const field = bySlug.get(slug);
    if (!field) return [];
    const url = firstText(row[slug]);
    const canEdit = employee.can.write && !field.locked;
    const tile = (
      <span className="grid size-14 place-items-center overflow-hidden rounded-lg border border-border bg-surface-soft text-fg-subtle">
        {url ? (
          <img src={url} alt="" className={`size-full ${slug === "photo" ? "object-cover" : "object-contain p-1"}`} />
        ) : (
          <Icon as={CameraIcon} size={16} />
        )}
      </span>
    );
    return [
      <div key={slug} className="flex flex-col items-center gap-1 text-xs text-fg-muted">
        {canEdit ? (
          <label title={label(field)} className="cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-accent hover:opacity-80">
            {tile}
            <input
              type="file"
              accept="image/*"
              aria-label={label(field)}
              disabled={upload.isPending}
              className="sr-only"
              onChange={(event) => {
                changeImage(slug, event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        ) : (
          tile
        )}
        {label(field)}
      </div>,
    ];
  });
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
  /*
   * «Адреса и телефоны», «Состав семьи» и «Образование» — сразу за «Личным»,
   * как в прототипе. «Образование» не встаёт на место вкладки связи
   * `hr_qualifications`: там же и сертификаты, и её админ оставляет как есть.
   */
  const notContacts = (item: { id: string }) => item.id !== CONTACTS_TAB && item.id !== FAMILY_TAB;
  const defaultTabs = [
    { id: CONTACTS_TAB, label: t("employee.tab.contacts"), icon: MapPinIcon },
    { id: FAMILY_TAB, label: t("employee.tab.family"), icon: UsersIcon },
    { id: EDUCATION_TAB, label: t("employee.tab.education"), icon: GraduationCapIcon },
    ...relationTabs.slice(0, work + 1).filter(notContacts),
    ...missing.filter(notContacts),
    ...relationTabs.slice(work + 1).filter(notContacts),
  ];
  /* «Личное» всегда первое: это сама карточка, а не раздел. */
  const order = Array.isArray(savedOrder) ? savedOrder.filter((id): id is string => typeof id === "string") : [];
  /* Граница «Больше» — элемент порядка; в старом сохранённом её нет — встаёт на прежнее место. */
  const ordered = applyOrder(defaultTabs, order);
  const withMore = order.includes(MORE) ? order : [...ordered.map((tab) => tab.id)];
  if (!order.includes(MORE)) withMore.splice(VISIBLE_TABS - 1, 0, MORE);
  const arranged = applyOrder([...defaultTabs, { id: MORE, label: "" }], withMore);
  const cut = arranged.findIndex((tab) => tab.id === MORE);
  const barTabs = [{ id: PERSONAL, label: t("employee.tab.personal") }, ...arranged.slice(0, cut)];
  const moreTabs = arranged.slice(cut + 1);

  const own = tabId && OWN_TABS.has(tabId) ? tabId : undefined;
  const activeTab = own ?? tab?.id ?? PERSONAL;
  const lastSeen = formatDate(person.lastActivity, "datetime", locale);
  const tabActions = TAB_ACTIONS.flatMap((action) => {
    const target = employee.tabs.find((item) => item.tableSlug === action.table);
    return target ? [{ ...action, id: target.id }] : [];
  });
  const canDismiss = employee.can.write && row.status !== "dismissed";
  /* Пароль есть только у того, кому дан вход: `user_id_auth` ставит синхронизация с auth. */
  /*
   * Вход есть, когда есть и учётка, и логин. Импорт из старого HRMS оставил
   * строки с `user_id_auth` на несуществующую учётку и без логина — им тоже
   * «Дать вход»: правкой строки бэкенд заведёт учётку заново
   * (`auth/storage/postgres/sync_user.go:114`).
   */
  const hasLogin = Boolean(employee.user?.user_id_auth && employee.user?.login);
  const canResetPassword = employee.can.write && hasLogin;
  const renderCard = (card: (typeof CARDS)[number]) => {
                const fields = fieldsOf(card.slugs).filter((field) => !offRow(field.slug, row));
                if (!fields.length) return null;
                return (
                  <Card key={card.title} icon={card.icon} title={t(card.title)}>
                    {card.title === "employee.card.personal" && media.length > 0 && (
                      <div className="flex gap-4 border-b border-border pt-1 pb-3">{media}</div>
                    )}
                    {card.title === "employee.card.personal" && (
                      <Row label={t("employee.id")}>
                        <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[12.5px]">
                          {guid}
                        </code>
                      </Row>
                    )}
                    {/* Логин — из учётки (`core_users`), не из карточки: правится через «Сгенерировать пароль» / настройки пользователей. */}
                    {card.title === "employee.card.personal" && (
                      <Row label={t("auth.login")}>
                        {hasLogin ? (
                          <span className="text-sm">{text(employee.user?.login)}</span>
                        ) : employee.can.write ? (
                          <button
                            type="button"
                            onClick={() => setGranting(true)}
                            className="cursor-pointer text-sm text-accent-text hover:underline"
                          >
                            {t("employee.grantAccess")}
                          </button>
                        ) : (
                          <span className="text-sm text-fg-subtle">—</span>
                        )}
                      </Row>
                    )}
                    {fields.map((field) => (
                      <Row key={field.id} label={label(field)}>
                        {tools && toolFor[field.slug] ? (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">{value(field)}</div>
                            {toolFor[field.slug]}
                          </div>
                        ) : (
                          value(field)
                        )}
                      </Row>
                    ))}
                  </Card>
                );
              };
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
            {employee.can.write && !hasLogin && (
              <Button variant="secondary" onClick={() => setGranting(true)}>
                <Icon as={KeyRoundIcon} size={15} />
                {t("employee.grantAccess")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setArranging(true)}>
              <Icon as={ArrowDownUpIcon} size={15} />
              {t("employee.arrangeTabs")}
            </Button>
            {employee.can.write && (
              /* Правка сохраняется сразу, по полю, поэтому выход
                 из режима — «Готово», а не «Сохранить». */
              <Button
                onClick={() => {
                  setEditing(!editing);
                  setActive(null);
                  /* Правятся поля карточки, а они в «Личном». */
                  if (!editing) onTab(undefined);
                }}
              >
                <Icon as={editing ? CheckIcon : PencilIcon} size={15} />
                {t(editing ? "employee.done" : "employee.edit")}
              </Button>
            )}
            {(tabActions.length > 0 || canDismiss || canResetPassword) && (
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
                    {canResetPassword && (
                      <PopoverItem
                        icon={<Icon as={KeyRoundIcon} size={15} />}
                        onClick={() => {
                          setResetting(true);
                          close();
                        }}
                      >
                        {t("employee.action.resetPassword")}
                      </PopoverItem>
                    )}
                    {canDismiss && (tabActions.length > 0 || canResetPassword) && <PopoverSeparator />}
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
            tabs={barTabs}
          />
          <MoreTabs tabs={moreTabs} activeId={activeTab} label={t("employee.more")} onSelect={onTab} />
        </div>

        {own && GRIDS[own] ? (
          <>
            <EmployeeGrid key={own} grid={GRIDS[own]} employeeId={guid} language={language} />
          </>
        ) : own === ATTENDANCE_TAB ? (
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
              {CARDS.map(renderCard)}
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
              <Card icon={BadgeCheckIcon} title={t("employee.card.certificates")} count={certificates.length}>
                {certificates.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {certificates.map((item) => (
                      <li key={text(item.guid)} className="py-2">
                        <b className="font-medium">{text(item.title) || "—"}</b>
                        {text(item.institution) && <div className="text-fg-muted">{text(item.institution)}</div>}
                        {(text(item.date_from) || text(item.valid_until)) && (
                          <small className="text-fg-subtle">
                            {[
                              text(item.date_from) && formatDate(text(item.date_from), "date", locale),
                              text(item.valid_until) &&
                                t("employee.validUntil", { date: formatDate(text(item.valid_until), "date", locale) }),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-fg-subtle">{t("employee.noCertificates")}</p>
                )}
              </Card>
              {bySlug.get("note") && (
                <Card icon={MessageSquareIcon} title={label(bySlug.get("note")!)}>
                  {value(bySlug.get("note")!)}
                </Card>
              )}
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

      {arranging && (
        <TabOrder
          tabs={defaultTabs}
          ids={arranged.map((tab) => tab.id)}
          onOrder={(ids) => setViewState(orderKey, ids)}
          onReset={order.length > 0 ? () => setViewState(orderKey, []) : undefined}
          onClose={() => setArranging(false)}
        />
      )}

      {resetting && employee.user && (
        <Suspense>
          <PasswordDialog
            user={{
              id: text(employee.user.guid),
              clientTypeId: text(employee.user.client_type_id),
              login: text(employee.user.login),
              name: person.name,
            }}
            onClose={() => setResetting(false)}
          />
        </Suspense>
      )}

      {granting && (
        <Suspense>
          <UserDialog
            employee={{ id: guid, name: person.name, email: contactOf("email"), phone: contactOf("work_phone") || contactOf("personal_phone") }}
            /* Строка в `core_users` уже есть — вход даётся её правкой, а не второй строкой. */
            {...(employee.user
              ? {
                  user: {
                    id: text(employee.user.guid),
                    name: text(employee.user.full_name) || person.name,
                    login: "",
                    email: text(employee.user.email),
                    phone: text(employee.user.phone),
                    roleId: text(employee.user.role_id),
                    hasLogin: false,
                  },
                }
              : {})}
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
