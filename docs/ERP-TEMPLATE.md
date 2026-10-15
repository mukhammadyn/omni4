# Шаблон ERP: что заводить в новом проекте

Спецификация для шаблона, из которого создаётся компания omni4. Цель:
новый проект (как omni5 под `Omni5test1@`) открывается в omni4 сразу
готовым ERP — с модулями в сайдбаре, нашими экранами и настройками,
без ручной донастройки через API.

Составлено 2026-10-15. Источники:

- живой проект omni4 — дерево меню и view сняты по API-ключу
  (`GET /v3/menus`, `GET /v3/menus/{id}/views`, `GET /v2/fields`,
  `GET /v2/relations`) — только чтение;
- код omni4 (ветка `feat/schema-v2`) — какие слаги, типы и атрибуты он читает;
- [STATUS.md](STATUS.md) — что заводилось руками и зачем;
- `FRONTEND_RU.md` (схема v2 от 2026-10-14) — имена таблиц и колонок.

Все слаги ниже — **схемы v2**. В omni4 они пока старые (таблица
соответствий — `FRONTEND_RU.md`, §3–4).

## 0. Главное правило: всё по слагам, ни одного id

Id меню, view, полей и связей в каждом проекте свои. Шаблон описывает
всё слагами и разрешает их в id **после** того, как таблицы созданы:

| Где в ucode лежит id | Как описывать в шаблоне |
|---|---|
| `view.group_fields[]`, `view.columns[]` | слаг поля; для связи — слаг её колонки (`crm_stages_id`), id связи искать по `GET /v2/relations/{table}` |
| `view.attributes.chips_by_id` | то же: слаг колонки-связи или поля |
| `view.relation_table_slug` + `relation_id` | слаг чужой таблицы + колонка, по которой она ссылается сюда |
| `menu.table_id` | слаг таблицы |
| `menu.parent_id` | путь папок от корня («HRMS / Люди») |

Фронт сам не хранит ни одного id проекта (правило 7 в `FRONTEND_RU.md`):
таблицы, пункт меню сотрудников, хранилище дашбордов он находит
по слагу и по `attributes.screen`.

## 1. Схема данных

1. **Все таблицы и поля — по `omni4-v2/erp.dbml`**, как в omni5.
   Модуль, которого у клиента нет, не заводится целиком (§5.5
   `FRONTEND_RU.md`).
2. **`attributes.protected: true`** — у каждой таблицы модулей
   (`core_*`, `crm_*`, `hr_*`). Структура заперта, записи правятся
   (CONTEXT.md, Protected). Исключение — `core_users`: таблица входа
   флаг не держит (backend-notes), её запирает пункт меню.
3. **Подписи LOOKUP-полей** (`attributes.label`) — **у всех**. Фронт
   берёт подпись LOOKUP только оттуда (`table/api/normalize.ts`,
   `pickLabel`): колонка `label` у связи обычно служебная («FROM x TO y»).
   Нет `attributes.label` — колонка подписывается именем таблицы-цели
   («Пользователи» вместо «Рекрутер»). В omni5 подписи лежат в `label`,
   а `attributes.label` пуст у всех 214 LOOKUP — скопировать `label`
   в `attributes.label`. В omni4 подписаны руками только эти:

   | Таблица | Колонка | `attributes.label` |
   |---|---|---|
   | `hr_vacancies` | `hr_positions_id` | Должность |
   | | `hr_departments_id` | Отдел |
   | | `hr_locations_id` | Филиал |
   | | `core_users_id` | Рекрутер |
   | | `core_users_id_2` | Нанимающий менеджер |
   | | `hr_recruiting_pipelines_id` | Воронка найма |
   | `hr_candidates` | `hr_vacancies_id` | Вакансия |
   | | `hr_recruiting_stages_id` | Этап |
   | | `core_users_id` | Рекрутер |
   | | `hr_candidate_sources_id` | Источник |
   | | `hr_rejection_reasons_id` | Причина отказа / резерва |

   (В omni5 у `hr_candidates.core_users_id` подпись «Ответственный
   рекрутер» — тоже годится.)
4. **Варианты PICK_LIST**, которые экраны читают по ключам:
   `hr_vacancies.channels`, `hr_vacancies.languages` (заведены
   2026-10-08), статусы `hr_candidates.status` (`active`, `hired`,
   `rejected`, `reserve`), `hr_requests.status` (`pending`, `approved`,
   `rejected`, `cancelled`), `hr_employees.status` (`active`, `dismissed`),
   `hr_vacancies.status` (`closed` и др.), `hr_attendance_days.status`
   (`on_time`, `late`, `absent`, `excused`, `remote`, `day_off`,
   `holiday`, `not_employed`), `hr_attendance_days.review` (`pending`).
   Берутся из dbml как есть — ключи менять нельзя, экраны сравнивают
   с ними строкой.
5. **`core_users.timezone_id`** (SINGLE_LINE) — личный часовой пояс
   (ADR-0014). В v2 его нет; без колонки пояс не сохраняется.

## 2. Вход и права

| Что | Значение |
|---|---|
| Тип клиента «Сотрудник» | таблица входа `core_users` (`table_slug: "core_users"`) |
| Роли | под этот тип; новая роль рождается со всеми правами (справочник ucode, §4.9) — сразу сузить |
| «Мои записи» (если нужен автофильтр) | `automatic_filters.read: [{custom_field: "user_id", object_field: "core_users"}]` — работает только в списках |
| Связи (`connections`) | не нужны: «своя строка» `core_users` — `user_id` токена |
| Первый пользователь | строка `core_users` **с `login`** (иначе привяжется к чужой учётке по почте — §2 `FRONTEND_RU.md`) |

## 3. Меню

Корень — папка админки `c57eedc3-…a284`. Порядок пунктов — как ниже.
У всех папок и пунктов модулей — `attributes.protected: true`.
Иконки пунктов — emoji Apple из
`https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/<код>.png`
(в таблице — сам знак и код).

Что фронт читает в меню:

| Атрибут | Значение | Что делает |
|---|---|---|
| `is_tab: true` | у папки в корне | папка — **модуль**: плитка в переключателе сайдбара (ADR-0010) |
| `screen: "dashboards-entry"` | `LINK` | вход в дашборды модуля → `/dashboards` |
| `screen: "settings"` | `LINK` | вход в настройки проекта → `/settings` |
| `screen: "dashboards"` | `LINK` в корне | хранилище всех дашбордов (`attributes.dashboards`), в сайдбаре не виден; фронт заводит его сам при первой записи |
| `protected: true` | папки и пункты | перенос и удаление заперты |

Подпись модуля задаёт цвет в дашбордах: «CRM» и «HRMS» узнаются по имени
(`DashNav`, `MODULE_TINTS`). Не переименовывать.

**Три уровня меню модуля:**

```
CRM                    FOLDER в корне, is_tab: true, protected   ← модуль
└─ Продажи             FOLDER, protected, без is_tab             ← группа
   └─ Сделки           TABLE (или LINK), protected, иконка        ← пункт
```

Группы — это колонка «Группа» в таблицах ниже: «Основное», «Продажи»,
«Задачи», «Списки», «Система» в CRM; «Основное», «Люди», «Рекрутинг»,
«Время», «Обучение», «Финансы», «Система» в HRMS. Каждая группа —
отдельная папка внутри папки модуля:

- `type: "FOLDER"`, `parent_id` — папка модуля;
- `attributes.protected: true`, `is_tab` **нет** (иначе группа станет
  модулем);
- иконки нет — в omni4 группам иконки не ставились;
- порядок групп и пунктов внутри них — как в таблицах, сверху вниз;
- в сайдбаре группы раскрыты по умолчанию (свёрнутые помнит браузер,
  `collapsedMenus`);
- «Основное» — первой, «Система» — последней (в ней только LINK
  «Настройки»).

### 3.1 CRM — `FOLDER`, `is_tab`, иконка `lucide:handshake`

| Группа | Пункт | Тип | Таблица / атрибуты | Иконка |
|---|---|---|---|---|
| Основное | Дашборды | LINK | `screen: "dashboards-entry"` | 📊 `1f4ca` |
| Продажи | Сделки | TABLE | `crm_deals` | 🎯 `1f3af` |
| | Счета | TABLE | `crm_invoices` | 🧾 `1f9fe` |
| | План продаж | TABLE | `crm_sales_plans` | 📈 `1f4c8` |
| | Коммерческие предложения | TABLE | `crm_quotes` | 💼 `1f4bc` |
| Задачи | Чаты | TABLE | `crm_conversations` | 💬 `1f4ac` |
| | Задачи | TABLE | `crm_tasks` (в v2 своя таблица, §5.1) | ✅ `2705` |
| | Звонки | TABLE | `crm_calls` | 📞 `1f4de` |
| Списки | Контакты | TABLE | `crm_contacts` | 👤 `1f464` |
| | Компании | TABLE | `crm_companies` | 🏢 `1f3e2` |
| | Товары и услуги | TABLE | `crm_products` | 📦 `1f4e6` |
| Система | Настройки | LINK | `screen: "settings"` | ⚙️ `2699-fe0f` |

### 3.2 HRMS — `FOLDER`, `is_tab`, иконка `lucide:users-round`

| Группа | Пункт | Тип | Таблица / атрибуты | Иконка |
|---|---|---|---|---|
| Основное | Дашборды | LINK | `screen: "dashboards-entry"` | 📊 `1f4ca` |
| Люди | Сотрудники | TABLE | `hr_employees` | 🧑‍💼 `1f9d1-200d-1f4bc` |
| | История назначений | TABLE | `hr_job_history` | ⏳ `23f3` |
| | Образование и сертификаты | TABLE | `hr_qualifications` | 🎓 `1f393` |
| Рекрутинг | Вакансии | TABLE | `hr_vacancies` | 💼 `1f4bc` |
| | Кандидаты | TABLE | `hr_candidates` | 🧾 `1f9fe` |
| | Карьерный сайт | TABLE | `hr_career_site` | 📋 `1f4cb` |
| Время | Отметки | TABLE | `hr_attendance_events` | ✅ `2705` |
| | Посещаемость | TABLE | `hr_attendance_days` | 📅 `1f4c5` |
| | График работы | TABLE | `hr_shifts` | 🔁 `1f501` |
| | Заявки | TABLE | `hr_requests` | 📥 `1f4e5` |
| | Баланс отсутствий | TABLE | `hr_absence_balance` | ⚖️ `2696-fe0f` |
| | Назначения штрафов | TABLE | `hr_penalty_assignments` | 🚨 `1f6a8` |
| Обучение | Тренинги | TABLE | `hr_trainings` | 🧠 `1f9e0` |
| | База знаний | TABLE | `hr_kb_articles` | 📚 `1f4da` |
| | Опросы | TABLE | `hr_surveys` | 🗳️ `1f5f3-fe0f` |
| Финансы | Начисления | TABLE | `hr_payroll_lines` | 💰 `1f4b0` |
| | Строки бюджета | TABLE | `hr_budget_lines` | 📊 `1f4ca` |
| | Оценки KPI | TABLE | `hr_kpi_scorecards` | 💯 `1f4af` |
| Система | Настройки | LINK | `screen: "settings"` | ⚙️ `2699-fe0f` |

**Пункт «Сотрудники» обязателен:** страница сотрудника берёт вкладки
из view этого пункта (находит его по таблице, `useTableMenuId`).

### 3.3 Проекты — `FOLDER`, **без** `is_tab` (пока не модуль)

`is_tab` снят намеренно (STATUS, «Решено 2026-10-05»); вернуть —
`is_tab: true`. В v2 таблицы Проектов — часть HRMS (`hr_*`).

| Группа | Пункт | Таблица |
|---|---|---|
| Основное | Проекты | `hr_projects` |
| | Все задачи | `hr_tasks` |
| | Спринты | `hr_sprints` |
| | План ресурсов | `hr_resource_plans` |
| Настройки | Листы задач | `hr_task_lists` |
| | Статусы задач | `hr_task_statuses` |
| Служебные | Листы проекта | `hr_project_lists` |
| | Участники проекта | `hr_project_members` |
| | План по проекту | `hr_project_plans` |
| | Оценки задач | `hr_task_estimates` |

### 3.4 Скрытые папки (без `is_tab`, в сайдбаре не видны)

У таблиц должен быть пункт меню, иначе у них нет view, а настройки
открывают справочник через его view.

**«Ядро»** — общие таблицы: `core_settings` (Настройки организации),
`core_currency_rates` (Курсы валют), `core_notifications` (Уведомления),
`core_audit_log` (Журнал аудита), `core_users` (Пользователи).
Плюс дочерние таблицы модулей, которые в omni4 лежат здесь:
`crm_legal_entities`, `crm_product_categories`, `crm_units`,
`crm_invoice_items`, `crm_payments`, `hr_locations`, `hr_departments`,
`hr_positions`, `hr_grades`, `hr_task_assignees`,
`hr_task_checklist_items`, `hr_time_entries`, `hr_timeline`.
Новые таблицы v2 без пункта: `crm_timeline` — сюда же.

**«Интеграции»** (в v2 префиксов `int_` нет): `crm_webhook_events`,
`hr_ai_conversations`, `hr_ai_audit`, `crm_ai_conversations`,
`crm_ai_audit`. Показываются в «Логах» настроек, а не в сайдбаре.

**«Настройки модулей»** — справочники, которые открываются из настроек:

- `CRM / Система`: `crm_pipelines`, `crm_stages`, `crm_lost_reasons`,
  `crm_sources`, `crm_lead_forms`, `crm_call_quality_versions`,
  `crm_reply_templates`, `crm_ad_spend`;
- `CRM / Служебные`: `crm_deal_items`, `crm_deal_stage_history`,
  `crm_messages`;
- `HRMS` (прямо в папке): `hr_work_schedules` (Шаблоны графиков, 📐 `1f4d0`);
- `HRMS / Система`: `hr_documents`, `hr_assets`, `hr_salary_bands`,
  `hr_dismissal_reasons`, `hr_document_folders`, `hr_document_templates`,
  `hr_holidays`, `hr_absence_types`, `hr_approval_routes`,
  `hr_penalty_policies`, `hr_penalty_rules`, `hr_recruiting_pipelines`,
  `hr_recruiting_stages`, `hr_candidate_sources`, `hr_rejection_reasons`,
  `hr_pay_types`, `hr_kpi_metrics`;
- `HRMS / Служебные`: `hr_asset_movements`, `hr_work_schedule_days`,
  `hr_approval_route_steps`, `hr_request_approvals`,
  `hr_candidate_stage_history`, `hr_candidate_evaluations`,
  `hr_training_materials`, `hr_training_participants`,
  `hr_survey_participants`, `hr_survey_responses`, `hr_budget_amounts`,
  `hr_kpi_results`.

Какие из них где во вкладках настроек — `src/features/settings/ui/directories.ts`.

## 4. View

У **каждого** пункта TABLE — два стандартных view: `SECTION` (раскладка
карточки, порядок −1) и `TABLE` (порядок 0). Их даёт `create_table`
с `menu_id`. Ниже — только то, что **сверх** стандартного.

Имя вкладки — `name` и `attributes.name_ru` (как в omni4). Порядок
вкладок — `PUT /v2/views/{slug}/update-order`, как в таблице.

### 4.1 Наши типы view

Бэкенд тип не проверяет (ADR-0006) — пишется строкой. Фиксированные
типы рисуют свой экран и работают **только на своей таблице**.

| Тип | Таблица | Атрибуты | Экран |
|---|---|---|---|
| `GALLERY` | любая | `card: "person"` | «Сетка» людей |
| `ORG` | `hr_employees` | — | «Оргструктура» |
| `VACANCIES` | `hr_vacancies` | — | «Карточки» вакансий |
| `VACANCY_PLAN` | `hr_vacancies` | — | «Планирование» найма |
| `CANDIDATES` | `hr_candidates` | — | таблица кандидатов |
| `ATTENDANCE` | `hr_attendance_days` | `layout`: нет / `"list"` / `"sheet"` | Календарь / Список / Табель |
| `ABSENCES` | `hr_requests` | — | «Отсутствия» и согласование |
| `SCHEDULE` | `hr_shifts` | — | «Календарь» графика |
| `WORK_SCHEDULES` | `hr_work_schedules` | — | «Шаблоны» графика |
| `LIST` | любая | — | список |

Общий атрибут `chips_by_id` — полоса значений над таблицей (TABLE,
LIST, GALLERY); значение — поле или колонка-связь (см. §0).

**View может стоять на чужой таблице:** у view своя `table_slug`,
и экран берёт схему, права и карточку по ней, а не по таблице пункта.
Так «Отсутствия» стоит в пункте «Посещаемость», а «Шаблоны» — в пункте
«График работы».

### 4.2 По пунктам

**HRMS / Сотрудники** (`hr_employees`)

| # | Тип | Имя | Таблица | Атрибуты и настройки |
|---|---|---|---|---|
| 1 | TABLE | — | | |
| 2 | GALLERY | Сетка | | `card: "person"`; колонки: `full_name`, `photo`, `hr_positions_id`, `hr_departments_id`, `hr_locations_id`, `status`, `email`, `phone`, `telegram_username` |
| 3 | ORG | Оргструктура | | |

Плюс **вкладки связей** — view с `is_relation_view: true`,
`relation_table_slug` и связью. Они становятся вкладками страницы
сотрудника, часть — нашими экранами:

| Вкладка | `relation_table_slug` | Колонка в чужой таблице | Внутри |
|---|---|---|---|
| Работа | `hr_job_history` | `hr_employees_id` | история работы (свой экран) |
| Компенсация | `hr_payroll_lines` | `hr_employees_id` | таблица |
| Отсутствия | `hr_requests` | `hr_employees_id` | `EmployeeAbsences` |
| Посещаемость | `hr_attendance_days` | `hr_employees_id` | `EmployeeAttendance` |
| График работы | `hr_shifts` | `hr_employees_id` | `EmployeeSchedule` |
| Документы | `hr_documents` | `hr_employees_id` | таблица |
| Имущество | `hr_assets` | `hr_employees_id` | таблица |
| KPI | `hr_kpi_scorecards` | `hr_employees_id` | таблица |
| Тренинги | `hr_training_participants` | `hr_employees_id` | таблица |
| Опросы | `hr_survey_participants` | `hr_employees_id` | таблица |
| Задачи | `hr_tasks` | `core_users_id` — **связь с `core_users`**, не с сотрудником | таблица задач его пользователя |

Вкладка «Задачи» ведётся через пользователя: в v2 у `hr_tasks` нет связи
с `hr_employees`. View заводится на пункте «Сотрудники», как остальные,
но `relation_id` — связь `hr_tasks.core_users_id → core_users`
(«Исполнитель»; не `core_users_id_2` — это автор). Страница не нашла
связь у сотрудника — ищет у `core_users` и отбирает строки по guid его
пользователя (`core_users.hr_employees_id` = сотрудник). Пользователя
нет — вкладка пишет об этом. Так же можно завести любую вкладку
«кто»-таблицы: сделки, звонки, оценки кандидатов.

**HRMS / Вакансии** (`hr_vacancies`)

| # | Тип | Имя | Настройки |
|---|---|---|---|
| 1 | VACANCY_PLAN | Планирование | |
| 2 | TABLE | Таблица | колонки: `title`, `status`, `priority`, `hr_departments_id`, `core_users_id`, `core_users_id_2`, `hr_locations_id`, `work_format` |
| 3 | VACANCIES | Карточки | |

**HRMS / Кандидаты** (`hr_candidates`) — стандартного TABLE нет, вместо
него один view:

| Тип | Настройки |
|---|---|
| CANDIDATES | `group_fields: ["status"]` (вкладки Активные · Нанятые · Отказ · Резерв); `chips_by_id` → `hr_recruiting_stages_id`; колонки: `full_name`, `level`, `hr_vacancies_id`, `hr_recruiting_stages_id`, `score`, `hr_candidate_sources_id`, `salary_expectation`, `stage_changed_at`, `applied_at`, `hr_rejection_reasons_id` |

**HRMS / Посещаемость** (`hr_attendance_days`)

| # | Тип | Имя | Таблица | Атрибуты |
|---|---|---|---|---|
| 1 | ATTENDANCE | Календарь | | (без `layout`) |
| 2 | ATTENDANCE | Список | | `layout: "list"` |
| 3 | ATTENDANCE | Табель | | `layout: "sheet"` |
| 4 | ABSENCES | Отсутствия | `hr_requests` | |
| 5 | TABLE | — | | |

**HRMS / График работы** (`hr_shifts`)

| # | Тип | Имя | Таблица |
|---|---|---|---|
| 1 | SCHEDULE | Календарь | |
| 2 | WORK_SCHEDULES | Шаблоны | `hr_work_schedules` |
| 3 | TABLE | — | |

**HRMS / Заявки** (`hr_requests`)

| # | Тип | Имя |
|---|---|---|
| 1 | ABSENCES | Отсутствия |
| 2 | TABLE | — |

**CRM / Сделки** (`crm_deals`)

| # | Тип | Настройки |
|---|---|---|
| 1 | TABLE | |
| 2 | BOARD | `group_fields` → `crm_stages_id` (колонки доски — этапы) |

**Настройки модулей / CRM / Воронки** (`crm_pipelines`) — в omni4 у TABLE
группировка по `business_units_id`. В v2 этой колонки нет: группировку
не ставить.

Остальные пункты — только стандартные SECTION + TABLE.
(У `hr_holidays` в omni4 есть ещё LIST и BOARD без настроек — похоже
на пробу, в шаблон не нужны.)

## 5. Справочные данные

Без этих строк экраны открываются, но работать не могут:

| Таблица | Что нужно | Кто читает |
|---|---|---|
| `core_settings` | одна строка: формат даты, базовая валюта, НДС, налоги и нормы HR | «Локализация», «Налоги и нормы» |
| `crm_legal_entities` | одна строка с `is_default: true` (только при CRM) | «Профиль компании» |
| `hr_recruiting_pipelines` | одна воронка с `is_default: true` | новая вакансия берёт её |
| `hr_recruiting_stages` | этапы этой воронки с `sort_order` | воронка, «Следующий этап» |
| `hr_absence_types` | типы с `name`, `icon`, `color`, `limit_days`, `limit_period`, `sort_order` | табель, баланс, заявки |
| `hr_rejection_reasons`, `hr_candidate_sources` | несколько активных | отказ / резерв, источник кандидата |
| `crm_pipelines` + `crm_stages` | воронка с этапами (при CRM) | доска сделок |
| `hr_task_lists` + `hr_task_statuses` | лист с статусами (при Проектах) | трекер задач |

Демо-строки (сотрудники, сделки) в шаблон не входят.

## 6. Порядок применения

1. Таблицы, поля, связи — по `erp.dbml`, только нужных модулей.
2. `protected` у таблиц; подписи LOOKUP (§1.3); `core_users.timezone_id`.
3. Тип клиента «Сотрудник» на `core_users`, роли, права.
4. Меню: папки модулей → группы → пункты (§3), с иконками и `protected`.
5. View: стандартные создаются с пунктом; затем свои (§4) — с id полей
   и связей, найденными по слагам **этого** проекта; затем порядок.
6. Справочные данные (§5).
7. Первый пользователь с `login`.

**Проверка** после применения: в omni4 под новым пользователем —
переключатель показывает CRM и HRMS; у «Сотрудников» есть «Сетка»
и «Оргструктура», страница сотрудника — с вкладками; у «Вакансий» —
«Планирование» и «Карточки»; у «Посещаемости» — Календарь, Список,
Табель, Отсутствия; у «Графика» — Календарь и Шаблоны; «Настройки» в
меню открывают `/settings` со справочниками модулей; «Дашборды» —
`/dashboards`.

## 7. omni5 против этого списка

**2026-10-15, после применения шаблона.** Сверено скриптом по API
(ключ omni5, только чтение) и глазами в omni4 (`feat/schema-v2`,
localhost) под ADMIN.

| § | Что | Итог |
|---|---|---|
| 1.1 | Таблицы v2 | все 103 |
| 1.2 | `protected` у таблиц | у всех, кроме `core_users` — как и задумано |
| 1.3 | `attributes.label` у LOOKUP | 220 из 222. Нет у `core_users.client_type_id` и `core_users.role_id` — их заводит сам ucode, на экранах подпишутся слагом |
| 1.5 | `core_users.timezone_id` | есть, SINGLE_LINE |
| 2 | Тип клиента «Сотрудник» | есть, таблица входа `core_users` |
| 3 | Меню | совпадает полностью: модули, группы, пункты, порядок, иконки, `protected`, LINK — 304 проверки, 0 расхождений, дублей нет |
| 4 | View | совпадают — 131 проверка. Вкладки связей сотрудника — все 11, связи верные, «Задачи» — через `hr_tasks.core_users_id`. Имена «Кандидаты» и «Доска» у двух view вместо пустых — лучше, чем в спецификации |
| 5 | Справочные данные | на месте, кроме **`crm_legal_entities` — 0 строк**: «Профиль компании» пуст |

В браузере открыты и работают: сайдбар с модулями CRM и HRMS
и группами; «Сотрудники» — таблица, «Сетка», «Оргструктура» (оба
дерева; клик по отделу открывает страницу руководителя через
`core_users.hr_employees_id`); страница сотрудника со всеми вкладками,
«Задачи» показывают задачи его пользователя; «Вакансии» —
Планирование, Таблица, Карточки; «Кандидаты» — вкладки статусов;
«Посещаемость» — Календарь, Список, Табель, Отсутствия; «График работы»
— Календарь и Шаблоны; доска сделок по этапам; настройки со
справочниками модулей; «Дашборды». Ошибок в консоли нет.

Не проверено:

- **«Я» и «Все | Мои»** — вход был под ADMIN, своей строки `core_users`
  у него нет. Нужен вход пользователем `core_users` (`Omni5test1@`).
- Запись: создание и правка ничего не делались.

Данные, не шаблон: у всех сотрудников пуст руководитель (дерево
«Сотрудники» плоское; в omni4 так же), у вакансий пусты рекрутер
и нанимающий менеджер, у шаблонов графика перерыв 300 минут (в omni4
исправлен на 60). Дашборды omni4 в omni5 не переносились.

## 8. Открыто

- **Как шаблон применяется** — механизм на стороне ucode (копия
  проекта, функция при создании компании, скрипт) не выбран. От него
  зависит, нужен ли машиночитаемый вариант этого файла (JSON-манифест
  со слагами).
- «Склад» и «Финансы» — в прототипе только плитки, папок в omni4 нет.
- Функции и события (бот, расчёт зарплаты, импорт) в этот список
  не входят — их заводит бэкенд.
