import {
  AlarmClockIcon,
  AudioLinesIcon,
  BanknoteIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalendarClockIcon,
  CalendarHeartIcon,
  ChartColumnIcon,
  CircleDotIcon,
  CoinsIcon,
  PercentIcon,
  CircleXIcon,
  FileTextIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  GitBranchIcon,
  HandshakeIcon,
  IdCardIcon,
  LayersIcon,
  ListOrderedIcon,
  ListTodoIcon,
  LogOutIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  NetworkIcon,
  PackageIcon,
  PlaneIcon,
  RadioTowerIcon,
  RulerIcon,
  ScaleIcon,
  SignalIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { TranslationKey } from "@/shared/lib/i18n";

/**
 * Справочники модулей — вкладки «Организация», «CRM», «HRMS»,
 * «Проекты» настроек, как `MODS` прототипа (`settings.html`).
 *
 * Каждый раздел — таблица проекта: «Ядро» и папка «Настройки модулей»
 * (docs/STATUS.md). Экран у всех один (DirectorySettings), разделы
 * отличаются только таблицей и колонками, поэтому здесь данные,
 * а не компоненты.
 *
 * Разделы прототипа без таблицы (Регионы, Атрибуты, Группы товаров,
 * Файлы, Типы занятости, Навыки, вкладки Склад и Финансы) не заведены:
 * пункт, который ничего не открывает, — обещание. Что чем закрыто
 * и что нет — docs/SYSTEM-TABLES-AUDIT.md.
 *
 * Слаги колонок сверены с живой схемой (`GET /v2/fields/{slug}`)
 * 2026-10-06. Колонка, которой в схеме не нашлось, просто не рисуется.
 */
export type Directory = {
  /** Раздел в адресе (`?section=`). Уникален среди всех вкладок. */
  id: string;
  table: string;
  titleKey: TranslationKey;
  hintKey: TranslationKey;
  icon: typeof BriefcaseIcon;
  /** Поле-название: первая колонка, по нему поиск. Нет — `name`. */
  title?: string;
  /** Колонки после названия, слагами. */
  columns: string[];
  /** Ссылка на себя — справочник рисуется деревом (`.ot` прототипа). */
  parent?: string;
  /**
   * Порядок строк, слагами по приоритету; «-» впереди — по убыванию.
   * Этапы сначала по воронке: иначе этапы разных воронок идут
   * вперемешку. Нет — как отдаёт сервер.
   */
  sort?: string[];
};

/**
 * Настройка из одной строки таблицы (RecordSettings): строки «подпись —
 * значение», а не список.
 */
export type RecordSection = {
  id: string;
  table: string;
  titleKey: TranslationKey;
  hintKey: TranslationKey;
  icon: typeof BriefcaseIcon;
  /** Поля по порядку показа, слагами. */
  fields: string[];
  /** Флажок, которым помечена нужная строка. Нет — первая строка. */
  pick?: string;
};

/**
 * «Налоги и нормы» — константы `org_settings`, которые читают функции
 * расчёта зарплаты и посещаемости (dbml: settings). Вкладка HRMS:
 * в прототипе налоги и нормы живут в модульных настройках, а не в
 * «Общих». Пояс, формат даты, валюта и НДС той же строки — в «Локализации».
 */
const NORMS: RecordSection = {
  id: "hr-norms",
  table: "org_settings",
  titleKey: "core.norms",
  hintKey: "core.normsHint",
  icon: PercentIcon,
  fields: [
    "ndfl_percent",
    "social_tax_percent",
    "weekly_hours_norm",
    "min_overtime_minutes",
    "default_geofence_m",
    "default_probation_months",
  ],
};

/**
 * Курсы валют. По DBML их пишет ежедневная функция, но её пока нет
 * (таблица пуста на 2026-10-06), — поэтому раздел даёт и завести курс руками.
 */
export const CURRENCY_RATES: Directory = {
  id: "rates",
  table: "currency_rates",
  titleKey: "core.rates",
  hintKey: "core.ratesHint",
  icon: CoinsIcon,
  title: "date",
  columns: ["currency", "rate", "source"],
  sort: ["-date", "currency"],
};

/** Справочник или одна запись: различаются полем `fields` у записи. */
export type DirectoryGroup = { titleKey: TranslationKey; items: (Directory | RecordSection)[] };

export type DirectoryTab = {
  id: string;
  labelKey: TranslationKey;
  icon: typeof BriefcaseIcon;
  /** Плашка иконки — цвет модуля (`--color-module-*`). Класс целиком: Tailwind не видит собранных имён. */
  tint: string;
  groups: DirectoryGroup[];
};

export const DIRECTORY_TABS: DirectoryTab[] = [
  {
    id: "org",
    tint: "bg-module-org",
    labelKey: "settings.tabOrg",
    icon: BuildingIcon,
    groups: [
      {
        titleKey: "dir.groupOrg",
        items: [
          {
            id: "org-bu",
            table: "business_units",
            titleKey: "dir.bu",
            hintKey: "dir.buHint",
            icon: BriefcaseIcon,
            columns: ["employees_id", "legal_entities_id", "is_active"],
          },
          {
            id: "org-locations",
            table: "locations",
            titleKey: "dir.locations",
            hintKey: "dir.locationsHint",
            icon: MapPinIcon,
            columns: ["type", "region", "address", "business_units_id", "is_active"],
          },
          {
            id: "org-legal",
            table: "legal_entities",
            titleKey: "dir.legal",
            hintKey: "dir.legalHint",
            icon: ScaleIcon,
            columns: ["inn", "tax_regime", "vat_percent", "is_default"],
          },
        ],
      },
      {
        titleKey: "dir.groupProducts",
        items: [
          {
            id: "org-cats",
            table: "product_categories",
            titleKey: "dir.categories",
            hintKey: "dir.categoriesHint",
            icon: LayersIcon,
            parent: "product_categories_id",
            columns: ["code", "is_active"],
          },
          {
            id: "org-products",
            table: "products",
            titleKey: "dir.products",
            hintKey: "dir.productsHint",
            icon: PackageIcon,
            columns: ["sku", "product_categories_id", "units_id", "price", "currency", "is_active"],
          },
          {
            id: "org-units",
            table: "units",
            titleKey: "dir.units",
            hintKey: "dir.unitsHint",
            icon: RulerIcon,
            columns: ["short_name", "type", "okei_code"],
          },
        ],
      },
    ],
  },
  {
    id: "crm",
    tint: "bg-module-crm",
    labelKey: "settings.tabCrm",
    icon: HandshakeIcon,
    groups: [
      {
        titleKey: "dir.groupSales",
        items: [
          {
            id: "crm-pipelines",
            table: "crm_pipelines",
            titleKey: "dir.pipelines",
            hintKey: "dir.pipelinesHint",
            icon: GitBranchIcon,
            columns: ["business_units_id", "is_default", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "crm-stages",
            table: "crm_stages",
            titleKey: "dir.stages",
            hintKey: "dir.stagesHint",
            icon: ListOrderedIcon,
            columns: ["crm_pipelines_id", "container", "probability", "term_days", "is_active"],
            sort: ["crm_pipelines_id", "sort_order"],
          },
          {
            id: "crm-sources",
            table: "crm_sources",
            titleKey: "dir.sources",
            hintKey: "dir.sourcesHint",
            icon: RadioTowerIcon,
            columns: ["channel", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "crm-lost",
            table: "crm_lost_reasons",
            titleKey: "dir.lost",
            hintKey: "dir.lostHint",
            icon: CircleXIcon,
            columns: ["is_disqualification", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "crm-replies",
            table: "crm_reply_templates",
            titleKey: "dir.replies",
            hintKey: "dir.repliesHint",
            icon: MessageSquareTextIcon,
            columns: ["shortcut", "is_active"],
            sort: ["sort_order"],
          },
        ],
      },
      {
        titleKey: "dir.groupAi",
        items: [
          {
            id: "crm-call-quality",
            table: "crm_call_quality_versions",
            titleKey: "dir.callQuality",
            hintKey: "dir.callQualityHint",
            icon: AudioLinesIcon,
            columns: ["auto_evaluate", "is_active"],
          },
        ],
      },
    ],
  },
  {
    id: "hrms",
    tint: "bg-module-hrms",
    labelKey: "settings.tabHrms",
    icon: UsersRoundIcon,
    groups: [
      {
        titleKey: "dir.groupStructure",
        items: [
          {
            id: "hr-deps",
            table: "departments",
            titleKey: "dir.departments",
            hintKey: "dir.departmentsHint",
            icon: NetworkIcon,
            parent: "departments_id",
            columns: ["employees_id", "business_units_id", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "hr-positions",
            table: "positions",
            titleKey: "dir.positions",
            hintKey: "dir.positionsHint",
            icon: IdCardIcon,
            parent: "positions_id",
            columns: ["departments_id", "level", "is_active"],
          },
        ],
      },
      {
        titleKey: "dir.groupHr",
        items: [
          {
            id: "hr-grades",
            table: "grades",
            titleKey: "dir.grades",
            hintKey: "dir.gradesHint",
            icon: SignalIcon,
            columns: ["level", "min_tenure_months", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "hr-term",
            table: "hr_dismissal_reasons",
            titleKey: "dir.dismissal",
            hintKey: "dir.dismissalHint",
            icon: LogOutIcon,
            columns: ["dismissal_type", "rehire_allowed", "is_active"],
          },
          {
            id: "hr-doc-folders",
            table: "hr_document_folders",
            titleKey: "dir.docFolders",
            hintKey: "dir.docFoldersHint",
            icon: FolderOpenIcon,
            columns: [],
            sort: ["sort_order"],
          },
          {
            id: "hr-doc-templates",
            table: "hr_document_templates",
            titleKey: "dir.docTemplates",
            hintKey: "dir.docTemplatesHint",
            icon: FileTextIcon,
            columns: ["category", "hr_document_folders_id", "requires_signature", "is_active"],
          },
        ],
      },
      {
        titleKey: "dir.groupPay",
        items: [
          NORMS,
          {
            id: "hr-comp",
            table: "hr_pay_types",
            titleKey: "dir.payTypes",
            hintKey: "dir.payTypesHint",
            icon: BanknoteIcon,
            columns: ["kind", "code", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "hr-fines",
            table: "hr_penalty_policies",
            titleKey: "dir.penalties",
            hintKey: "dir.penaltiesHint",
            icon: AlarmClockIcon,
            columns: ["description", "is_active"],
          },
          {
            id: "hr-salary",
            table: "hr_salary_bands",
            titleKey: "dir.salaryBands",
            hintKey: "dir.salaryBandsHint",
            icon: ChartColumnIcon,
            /* Названия у вилки нет: строка — это должность × грейд. */
            title: "positions_id",
            columns: ["grades_id", "salary_min", "salary_max", "currency", "effective_from", "is_active"],
          },
        ],
      },
      {
        titleKey: "dir.groupAttendance",
        items: [
          {
            id: "hr-holidays",
            table: "hr_holidays",
            titleKey: "dir.holidays",
            hintKey: "dir.holidaysHint",
            icon: CalendarHeartIcon,
            columns: ["date", "type", "locations_id"],
            sort: ["date"],
          },
          {
            id: "hr-absence",
            table: "hr_absence_types",
            titleKey: "dir.absence",
            hintKey: "dir.absenceHint",
            icon: PlaneIcon,
            columns: ["code", "is_paid", "limit_days", "limit_period", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "hr-sched",
            table: "hr_work_schedules",
            titleKey: "dir.schedules",
            hintKey: "dir.schedulesHint",
            icon: CalendarClockIcon,
            columns: ["type", "is_active"],
          },
        ],
      },
      {
        titleKey: "dir.groupRecruiting",
        items: [
          {
            id: "hr-rec-pipe",
            table: "hr_recruiting_pipelines",
            titleKey: "dir.recPipelines",
            hintKey: "dir.recPipelinesHint",
            icon: GitBranchIcon,
            columns: ["sla_days", "is_default", "is_active"],
          },
          {
            id: "hr-rec-stages",
            table: "hr_recruiting_stages",
            titleKey: "dir.recStages",
            hintKey: "dir.recStagesHint",
            icon: ListOrderedIcon,
            columns: ["hr_recruiting_pipelines_id", "container", "sla_days", "notify_candidate"],
            sort: ["hr_recruiting_pipelines_id", "sort_order"],
          },
          {
            id: "hr-rec-reject",
            table: "hr_rejection_reasons",
            titleKey: "dir.rejection",
            hintKey: "dir.rejectionHint",
            icon: CircleXIcon,
            columns: ["side", "add_to_reserve", "is_active"],
          },
          {
            id: "hr-rec-src",
            table: "hr_candidate_sources",
            titleKey: "dir.candidateSources",
            hintKey: "dir.candidateSourcesHint",
            icon: RadioTowerIcon,
            columns: ["type", "monthly_cost", "currency", "is_active"],
          },
        ],
      },
    ],
  },
  {
    id: "pm",
    tint: "bg-module-pm",
    labelKey: "settings.tabPm",
    icon: FolderKanbanIcon,
    groups: [
      {
        titleKey: "dir.groupTasks",
        items: [
          {
            id: "pm-lists",
            table: "task_lists",
            titleKey: "dir.taskLists",
            hintKey: "dir.taskListsHint",
            icon: ListTodoIcon,
            columns: ["description", "is_system", "is_active"],
            sort: ["sort_order"],
          },
          {
            id: "pm-statuses",
            table: "task_statuses",
            titleKey: "dir.taskStatuses",
            hintKey: "dir.taskStatusesHint",
            icon: CircleDotIcon,
            columns: ["task_lists_id", "status_group"],
            sort: ["task_lists_id", "sort_order"],
          },
        ],
      },
    ],
  },
];
