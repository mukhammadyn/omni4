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
   Строку DEFAULT ADMIN заводить не нужно (added 2026-10-26): фронт
   создаёт её сам при первом выборе пояса — с `from_auth_service`,
   своим `guid`, `role_id` и `client_type_id` админа.
6. **`hr_shift_kinds`** — виды смен (added 2026-10-16, в v2 нет). Поля:
   `name`, `color` (COLOR), `icon` (ICON), `default_start`/`default_end`
   (TIME), `is_remote` (CHECKBOX), `sort_order` (NUMBER). Many2One на неё
   из `hr_shifts`, `hr_work_schedule_days`, `hr_work_schedules` —
   колонка `hr_shift_kinds_id` у всех трёх, подпись «Вид смены» («Вид
   смены цикла» у шаблона). Заменяет PICK_LIST `shift_kind` /
   `cycle_shift_kind` с зашитыми `day`/`night`/`remote`: экран читает
   только связь. Пункт меню не нужен — справочник в настройках HRMS.
7. **`core_business_units`** — бизнес-юниты (added 2026-10-23, в v2 нет;
   CONTEXT.md, Business unit). Поля: `name`, `color` (COLOR),
   `description` (MULTI_LINE), `is_active` (SWITCH). Many2One с неё:
   `hr_employees` («Руководитель» — любой сотрудник, не только с
   учёткой), `crm_legal_entities` («Юрлицо»).
   Many2One на саму себя (added 2026-10-23) — `core_business_units_id`,
   «Родительский юнит»: дерево юнитов, читает только «Оргструктура →
   Организация». Пусто — корень.
   Many2One на неё — колонка `core_business_units_id`, подпись
   «Бизнес-юнит»: `hr_projects`, `crm_pipelines`. У `hr_locations` —
   Many2Many `core_business_units_ids` («Бизнес-юниты»): какие юниты
   работают в офисе.
   У `hr_employees` — **Many2Many** (`core_business_units_ids`,
   «Бизнес-юниты»): человек бывает в нескольких юнитах. Список читается
   и пишется только со стороны сотрудника (backend-notes, Many2Many).
   Такой же Many2Many у `hr_job_history` (`core_business_units_ids`):
   текущая запись истории копирует непустой список в сотрудника.
8. **Поля-копии назначения у `hr_employees` — `attributes.disabled: true`**
   (added 2026-10-23): `core_business_units_ids`, `hr_departments_id`,
   `hr_positions_id`, `hr_grades_id`, `hr_locations_id`,
   `hr_work_schedules_id`, `employment_type`, `work_format`. Источник —
   `hr_job_history` (вкладка «Работа»), сотрудник держит копию текущей
   записи (`api/job-history.ts`, SNAP). Правка копии в таблице терялась
   при следующем сохранении истории, поэтому копия только читается;
   при заведении сотрудника поля заполняются.
   Исключение — «Рабочие данные» на странице сотрудника: правка там
   исправляет текущую запись истории (`isAssignment`, EmployeePage), а не
   поле сотрудника; копия приезжает следом.
9. **`core_regions`** — регионы деревом (added 2026-10-23, в v2 нет).
   Поля: `name`, `code`, `type` (PICK_LIST `country`/`region`/`city`/
   `district`), `is_active` (SWITCH); Many2One на себя — `core_regions_id`
   («Входит в»). У `hr_locations` Many2One `core_regions_id` («Регион»)
   вместо PICK_LIST `region`: варианты старого поля заведены строками
   под «Узбекистан», значения локаций перенесены, старое поле `region`
   удалено (2026-10-23). Пункт меню — в «Ядре»; справочник — Настройки →
   Организация → Регионы.
10. **`hr_positions.hr_grades_id`** — «Группа грейдов» (added 2026-10-23):
   Many2One на корень дерева `hr_grades` (PM, DEV). В модалке «Добавить
   должность» грейд выбирается только из группы должности или ближайшей
   вышестоящей, где она задана; нигде нет — из всех.
   Так же у вакансии: Many2One `hr_vacancies.hr_grades_id` («Грейд»),
   форма вакансии фильтрует его по должности (`useGradesFor`).
   И у кандидата: Many2One `hr_candidates.hr_grades_id` («Грейд») вместо
   PICK_LIST `level` в форме — по должности вакансии кандидата.
11. **`hr_vacancies.hr_shift_kinds_id`** — «Формат» (added 2026-10-23):
   Many2One на «Виды смен» вместо PICK_LIST `work_format` в форме и на
   странице вакансии; `office` перенесён в «Дневная». У сделок колонки нет — юнит у воронки. Пункт меню —
   в «Ядре» (§3.4); справочник — Настройки → Организация.
12. **Личные данные `hr_employees`** (added 2026-10-27, в v2 нет) —
   карточки «Личного» по прототипу. SINGLE_LINE: `employee_code`
   («Код»), `nationality`, `birth_place`, `inn`, `inps`,
   `id_doc_series`, `id_doc_issued_by`, `military_record`, `foreign_inn`.
   DATE: `id_doc_issued_on`, `id_doc_valid_until`, `id_doc_valid_from`,
   `citizenship_from`. PICK_LIST: `id_doc_kind` (`uz_passport`,
   `uz_id_card`, `foreign_travel`, `residence_permit`,
   `foreign_passport`), `citizenship_status` (`citizen`, `stateless`),
   `citizenship_country` (`uz`, `kz`, `kg`, `tj`, `ru`, `tr`, `us`) —
   экран сравнивает `stateless` и `uz` строкой. PHOTO `signature`,
   CHECKBOX `no_inps`, MULTI_LINE `note`. Номер документа — прежний
   `passport_number`, подпись «Номер документа».
13. **`hr_employee_contacts`** — «Адреса и телефоны» сотрудника (added
   2026-10-27, в v2 нет; вкладка `contacts` страницы сотрудника).
   Поля: `kind` (PICK_LIST `address`/`contact`), `name` (PICK_LIST
   `registration_address`, `home_address`, `postal_address`,
   `personal_phone`, `work_phone`, `email`, `telegram`), `value`
   (SINGLE_LINE). Экран делит названия по типу суффиксом `_address` —
   новый адрес заводить с ним. Many2One на `hr_employees`
   (`hr_employees_id`, «Сотрудник»). Пункт меню не нужен; вкладка связи
   у пункта сотрудников — по желанию, своя вкладка встаёт на её место.
14. **`hr_employee_family`** — «Состав семьи» сотрудника (added 2026-10-27,
   в v2 нет; вкладка `family`). Поля: `relation` (PICK_LIST `spouse`,
   `child`, `parent`, `sibling`), `full_name`, `phone` (SINGLE_LINE),
   `birth_date` (DATE). Many2One на `hr_employees` (`hr_employees_id`).
   Пункт меню не нужен.
15. **`hr_timesheets`** — «Табели» (added 2026-10-27, в v2 нет; omni4
   и omni5): документ «табель за месяц по отделу», `timesheets.html`
   прототипа. С 2026-10-28 — табель компании за месяц или неделю,
   `hr_departments_id` у него пуст (у табелей отделов первой версии задан);
   поле не обязательное. Пункт меню — HRMS → Время, после «Графика работы».
   Поля: `title`, `period` (DATE, первое число месяца), `people`,
   `work_days`, `absence_days` (NUMBER), `worked_hours`,
   `overtime_hours` (FLOAT), `status` (PICK_LIST `draft`/`review`/
   `approved` — экран сравнивает `approved` строкой: утверждённый
   «Заполнить из посещаемости» не трогает), `comment` (MULTI_LINE).
   Many2One: `hr_departments_id` («Подразделение»), `core_users_id`
   («Ответственный»). Доска по статусу — view BOARD, заводится в UI.
   Колонки видов — в порядке прототипа, `title` первым: «Список» берёт
   заголовком строки первую колонку. Список — `title`,
   `hr_departments_id`, `worked_hours`, `status`; доска — `title`,
   `hr_departments_id`, `people`, `worked_hours`.
16. **`hr_timesheet_events`** — история табеля (added 2026-10-27, omni4
   и omni5; вкладка «История» страницы табеля). Поля: `action` (PICK_LIST
   `filled`, `approved`, `returned`, `edited`, `comment` — экран
   сравнивает строкой), `field`, `before`, `after` (SINGLE_LINE, для
   `edited` — подпись поля и значения текстом), `comment` (MULTI_LINE).
   Many2One: `hr_timesheets_id` («Табель»), `core_users_id` («Кто»).
   Пункт меню не нужен. Пишут только наши экраны — правка через общую
   таблицу в историю не попадает.
   Many2One `hr_timesheet_days_id` («День», added 2026-10-27, пока только
   omni5) — у события `edited`: какой день правили.
17. **`hr_timesheet_days`** — строки дня табеля, «сотрудник × день»
   (added 2026-10-27, пока только omni5; ADR-0018). Копия табеля
   посещаемости в момент «Заполнить», вход функции расчёта. Поля:
   `date` (DATE), `outside_period` (CHECKBOX, «вне месяца» — день
   соседнего месяца в неделе на стыке), `check_in`, `check_out`
   (DATE_TIME, только чтение); ставка дня — `salary` (FLOAT), `currency`,
   `pay_unit` (PICK_LIST `month`/`week`/`day`/`hour`); `plan_minutes`;
   хранимые CHECKBOX `is_holiday`, `has_shift`, `is_remote`, `is_excused`,
   `has_absence`, `absence_paid`, `off_schedule`, `outside_employment`,
   `unconfirmed`; правимые `late_minutes`, `early_minutes`,
   `worked_minutes` (NUMBER), `no_checkout` (CHECKBOX), `day_kind`
   (PICK_LIST `worked`, `late`, `absent`, `leave`, `day_off`, `holiday`,
   `missing_mark`, `empty`, `future`), `reason` (SINGLE_LINE); исходные
   значения — `orig_late_minutes`, `orig_early_minutes`,
   `orig_worked_minutes`, `orig_no_checkout`, `orig_day_kind`.
   Many2One: `hr_timesheets_id`, `hr_employees_id`, `hr_absence_types_id`.
   Пункт меню не нужен.
18. **`hr_timesheet_norms`** — норма месяца по сотруднику для табеля
   (added 2026-10-27, пока только omni5): `month` (DATE, первое число),
   `shifts_in_month`, `minutes_per_day` (NUMBER). Many2One:
   `hr_timesheets_id`, `hr_employees_id`. По строке на каждый задетый
   периодом месяц.
19. **Табель → «Зарплата»** (added 2026-10-27, пока только omni5):
   у `hr_timesheets` — `period_kind` (PICK_LIST `month`/`week`; `period`
   — первое число месяца или понедельник). У `hr_payroll_lines` —
   вариант `timesheet` в `source`; Many2One `hr_timesheets_id`
   («Табель»), `hr_penalty_policies_id` («Политика штрафов»); из чего
   строка: `salary_rate`, `norm`, `worked`, `lateness_coefficient`
   (FLOAT), `lateness_grace_minutes` (NUMBER), `pay_unit`, `calc_mode`
   (PICK_LIST `daily`/`hourly`), `period_from`, `period_to` (DATE).
   Оклад — строка на кусок периода с одной ставкой.

## 2. Вход и права

| Что | Значение |
|---|---|
| Тип клиента «Сотрудник» | таблица входа `core_users` (`table_slug: "core_users"`) |
| Роли | под этот тип; новая роль рождается со всеми правами (справочник ucode, §4.9) — сразу сузить |
| «Мои записи» (если нужен автофильтр) | `automatic_filters.read: [{custom_field: "user_id", object_field: "core_users"}]` — работает только в списках |
| Связи (`connections`) | не нужны: «своя строка» `core_users` — `user_id` токена |
| Первый пользователь | строка `core_users` с логином и паролем; логин — почта (ниже, «Как дать вход») |

### Сотрудник, таблица входа, учётка (added 2026-10-19)

```
hr_employees ──hr_employees_id── core_users ──user_id_auth── user (auth)
карточка в HR                    доступ к проекту            логин, почта, пароль
```

- `hr_employees` — карточка отдела кадров, о входе не знает.
- `core_users` — таблица входа проекта: кто работает в omni4, с какой
  ролью, какой сотрудник (`hr_employees_id`). Своя у каждого проекта.
- `user` в auth — учётка: логин, почта, хеш пароля. **Одна на весь
  ucode**, на все проекты и компании. Строка `core_users` ссылается
  на неё `user_id_auth`; есть `user_id_auth` — есть вход. `login`
  пуст и у тех, кто входит по почте.

**Как дать вход.** Сначала сотрудник в «Сотрудниках» (с почтой), потом:

- страница сотрудника → «Дать вход» (видна, пока строки `core_users`
  у него нет), или
- Настройки → Пользователи → «+ Новый пользователь» → «Сотрудник»
  (в списке только те, у кого строки нет).

Имя, почта, телефон подставляются из сотрудника, логин — почта. Выбрать
роль, задать пароль (заглавная, цифра, спецсимвол). Уходит
`POST /v2/items/core_users` с `hr_employees_id`, `client_type_id`,
`role_id`, `login`, `password` — object builder сам заводит учётку
(`items.go:406`). Строку можно завести и без входа (галочка снята,
`from_auth_service: true`) и дать вход позже в правке: PUT строки
с логином и паролем заводит учётку (`UpdateLoginStrategy` в auth).
Код — `features/settings/api/users.ts`, `ui/UserSettings.tsx`; раздел
настроек «Пользователи» читает `core_users`, а не `/v2/user`.

**Подвохи бэкенда** (подробно — `docs/backend-notes.md`, «прилипает
к чужой учётке»):

- **Занятый логин или почта.** Учётка с таким логином/почтой уже есть
  в ucode — бэкенд молча привязывает к ней строку, а пароль и почту
  из запроса в неё не пишет (`sync_user_service.go:70-101`, проверка
  «already exists» закомментирована) и добавляет ей доступ в проект.
  Короткий логин (`Test`) почти наверняка занят — поэтому логин —
  почта. Если и почта уже есть, человек входит своим старым паролем.
- **Вход по строке с `@` ищет по `email`**, не по `login`
  (`auth/storage/postgres/user.go:332`). Учётка без почты почтой
  не войдёт, даже если почта есть в строке `core_users`.
- **Почта в учётку уходит, только если изменилась** относительно строки.
  Починить привязанную учётку без почты: PUT строки
  `{email: null, from_auth_service: true}`, затем PUT
  `{email, password}` — синхронизация допишет почту и пароль
  (так чинили `tetsbek1@gmail.com`, 2026-10-19).
- **Не удалять строку, чтобы переделать.** Удаление строки таблицы
  входа удаляет учётку из auth целиком, во всех проектах
  (`sync_user_service.go:212` → `DELETE FROM "user"`, `user.go:299`).

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
| | Журнал звонков | TABLE | `pbx_calls` (added 2026-10-30) | ☎️ `260e-fe0f` |
| Списки | Контакты | TABLE | `crm_contacts` | 👤 `1f464` |
| | Компании | TABLE | `crm_companies` | 🏢 `1f3e2` |
| | Товары и услуги | TABLE | `crm_products` | 📦 `1f4e6` |
| Система | Настройки | LINK | `screen: "settings"` | ⚙️ `2699-fe0f` |

### 3.2 HRMS — `FOLDER`, `is_tab`, иконка `lucide:users-round`

| Группа | Пункт | Тип | Таблица / атрибуты | Иконка |
|---|---|---|---|---|
| Основное | Дашборды | LINK | `screen: "dashboards-entry"` | 📊 `1f4ca` |
| Люди | Сотрудники | TABLE | `hr_employees` | 🧑‍💼 `1f9d1-200d-1f4bc` |
| | Образование и сертификаты | TABLE | `hr_qualifications` | 🎓 `1f393` |
| Рекрутинг | Вакансии | TABLE | `hr_vacancies` | 💼 `1f4bc` |
| | Кандидаты | TABLE | `hr_candidates` | 🧾 `1f9fe` |
| Время | Посещаемость | TABLE | `hr_attendance_days` | 📅 `1f4c5` |
| | График работы | TABLE | `hr_shifts` | 🔁 `1f501` |
| Обучение | Тренинги | TABLE | `hr_trainings` | 🎓 `1f393` |
| | База знаний | TABLE | `hr_kb_articles` | 📚 `1f4da` |
| | Опросы | TABLE | `hr_surveys` | 📋 `1f4cb` |
| Финансы | Зарплата | TABLE | `hr_payroll_lines` | 💵 `1f4b5` |
| | Бюджет | TABLE | `hr_budget_lines` | 💰 `1f4b0` |
| | KPI | TABLE | `hr_kpi_scorecards` | 🎯 `1f3af` |
| Система | Имущество | TABLE | `hr_assets` | 📦 `1f4e6` |
| Система | Документы | TABLE | `hr_documents` | 🗂️ `1f5c2-fe0f`; view `DOCUMENTS` |
| | Настройки | LINK | `screen: "settings"` | ⚙️ `2699-fe0f` |

Таблицы без пункта меню (`hr_job_history`, `hr_career_site`,
`hr_attendance_events`, `hr_requests`, `hr_absence_balance`,
`hr_penalty_assignments`) остаются в схеме: их
показывают вкладки сотрудника, «Отсутствия» в «Посещаемости» и функции.
Пунктов для них нет с 2026-10-16 — omni4 выровнен по omni5.
`hr_kpi_scorecards` вернулся пунктом «KPI» в «Финансы» 2026-10-21 —
в omni4 и omni5 сразу; карта сотрудника — его вкладка «KPI».

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
`core_audit_log` (Журнал аудита), `core_users` (Пользователи),
`core_business_units` (Бизнес-юниты).
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
- `HRMS / Система`: `hr_documents`, `hr_assets`, `hr_grade_matrices`,
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
  `hr_kpi_results`, `hr_grade_matrix_columns`, `hr_grade_matrix_rows`,
  `hr_grade_matrix_cells`.

**Матрица грейдов (2026-10-22, только omni4).** Четыре таблицы вместо
`hr_salary_bands`, которая матрицу не выражала (SYSTEM-TABLES-AUDIT):

- `hr_grade_matrices` — версия: `name`, `is_active` (опубликована;
  черновик в сверке не участвует), `effective_from`, `usd_rate`
  (USD-потолок считается по курсу, не хранится), `sort_order`;
- `hr_grade_matrix_columns` — ступень: → матрица, `label`,
  `min_tenure_months`, `max_salary` (UZS), `sort_order`;
- `hr_grade_matrix_rows` — направление или должность: → матрица,
  → `hr_grade_matrix_rows` (родитель; есть — строка должности),
  → `hr_departments` (у направления), `name` (своё название
  направления, пусто — отдела), → `hr_positions` (у должности),
  `sort_order`;
- `hr_grade_matrix_cells` — строка × ступень: → строка, → ступень,
  → `hr_grades` (грейд должности), → `hr_positions` (рост в должность),
  `text` (критерий направления). Объединения не хранятся — экран сливает
  соседние ячейки с одной должностью роста.

Каскада у ucode нет — удаляет фронт (`features/hrms/api/grade-matrix`).
`hr_salary_bands` в omni4 осталась с 6 строками и не читается; удалить
после проверки матрицы.

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
| `GALLERY` | любая | `card: "person"` / `"asset"` (только `hr_assets`) | «Сетка» людей / имущества |
| `ORG` | `hr_employees` | — | «Оргструктура» |
| `VACANCIES` | `hr_vacancies` | — | «Карточки» вакансий |
| `VACANCY_PLAN` | `hr_vacancies` | — | «Планирование» найма |
| `CANDIDATES` | `hr_candidates` | — | таблица кандидатов |
| `ATTENDANCE` | `hr_attendance_days` | `layout`: нет / `"list"` / `"sheet"` | Календарь / Список / Табель |
| `ABSENCES` | `hr_requests` | — | «Отсутствия» и согласование |
| `SCHEDULE` | `hr_shifts` | — | «Календарь» графика |
| `WORK_SCHEDULES` | `hr_work_schedules` | — | «Шаблоны» графика |
| `KNOWLEDGE` | `hr_kb_articles` | — | «База знаний»: дерево и страница |
| `SURVEY_TEMPLATES` | `hr_surveys` | — | «Шаблоны» опросов: карточки, «Использовать» — форма нового опроса с вопросами шаблона |
| `PAYROLL` | `hr_payroll_lines` | — | «Сводная по месяцам»: сотрудник × вид за месяц (`period`) или неделю (`date`, added 2026-10-28), начисления и удержания группами, «К выплате»; «…» — шаблон Excel по табелю из окна выбора (любой период и статус) или по посещаемости открытого периода (added 2026-10-28); загрузка — всегда в открытый период |
| `PIVOT` | любая | `pivot` — см. ниже | обычная сводная |
| `BUDGET` | `hr_budget_lines` (+ `hr_budget_amounts`) | — | «Бюджет» ФОТ: отделы → строки, план и факт по месяцам/кварталам года, правка в ячейке |
| `KPI` | `hr_kpi_scorecards` (+ `hr_kpi_results`, `hr_kpi_metrics`) | — | «KPI»: отделы → сотрудники → показатели, вид неделя/месяц/квартал/год, «Цель · Факт · %» по периодам, правка факта; «Создать» — «Добавить KPI». Подробно — §4.2 «HRMS / KPI» |
| `PBX_CALLS` | `pbx_calls` | — | «Журнал» onlinePBX: когда, сотрудник, телефон, статус, длительность, запись в строке (added 2026-10-30) |
| `LIST` | любая | — | список |

`attributes.pivot` у `PIVOT` — раскладка, с которой сводная открывается
(ключ наш, бэкенд про него не знает): `row` — слаги полей строк через
запятую, `col` — слаг поля колонок, `value` — поле значения, `agg` —
`count` / `sum` / `avg` / `min` / `max`, `sort`, `skipEmpty: true` — не
считать строки без значения. Параметры адреса (`pivotRow`, `pivotCol`…)
главнее: человек крутит раскладку сам, во view она из интерфейса пока
не сохраняется — только через API.

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
| 2 | GALLERY | Сетка | | `card: "person"`; колонки: `full_name`, `photo`, `hr_positions_id`, `hr_departments_id`, `hr_locations_id`, `status`, `email`, `phone`, `telegram_username` — ровно эти 9 и в этом порядке: имя — первая колонка, всё прочее (кроме фото, статуса, контактов) уходит строкой под имя. Лишние поля ломают карточку (omni5, исправлено 2026-10-30) |

Плюс **вкладки связей** — view с `is_relation_view: true`,
`relation_table_slug` и связью. Они становятся вкладками страницы
сотрудника, часть — нашими экранами:

| Вкладка | `relation_table_slug` | Колонка в чужой таблице | Внутри |
|---|---|---|---|
| Работа | `hr_job_history` | `hr_employees_id` | история работы (свой экран); после правки текущее назначение копируется в `hr_employees` ([snap], фронт вместо функции) |
| Компенсация | `hr_payroll_lines` | `hr_employees_id` | таблица |
| Отсутствия | `hr_requests` | `hr_employees_id` | `EmployeeAbsences` |
| Посещаемость | `hr_attendance_days` | `hr_employees_id` | `EmployeeAttendance` |
| График работы | `hr_shifts` | `hr_employees_id` | `EmployeeSchedule` |
| Документы | `hr_documents` | `hr_employees_id` | `DocumentBrowser` по сотруднику |
| Имущество | `hr_assets` | `hr_employees_id` | `EmployeeAssets`: что на руках, выдать со склада, вернуть |
| KPI | `hr_kpi_scorecards` | `hr_employees_id` | `EmployeeKpi`: карта за период, итог, рейтинг, бонус, шаги статуса |
| Тренинги | `hr_training_participants` | `hr_employees_id` | `EmployeeTrainings`: KPI, фильтр по статусу, карточки, «Назначить тренинг» |
| Опросы | `hr_survey_participants` | `hr_employees_id` | `EmployeeSurveys`: участие, «Пройти» на своей карточке |
| Задачи | `hr_tasks` | `core_users_id` — **связь с `core_users`**, не с сотрудником | **скрыта в коде** с 2026-10-21 (EmployeePage): view можно не заводить |

Вкладка «Задачи» ведётся через пользователя: в v2 у `hr_tasks` нет связи
с `hr_employees`. View заводится на пункте «Сотрудники», как остальные,
но `relation_id` — связь `hr_tasks.core_users_id → core_users`
(«Исполнитель»; не `core_users_id_2` — это автор). Страница не нашла
связь у сотрудника — ищет у `core_users` и отбирает строки по guid его
пользователя (`core_users.hr_employees_id` = сотрудник). Пользователя
нет — вкладка пишет об этом. Так же можно завести любую вкладку
«кто»-таблицы: сделки, звонки, оценки кандидатов.

**HRMS / Оргструктура** (`hr_employees`, пункт рядом с «Сотрудниками»)

| # | Тип | Имя | Таблица | Атрибуты и настройки |
|---|---|---|---|---|
| 1 | ORG | Оргструктура | | |

Бэкенд заводит пункту TABLE-view сам — его удалить, остаётся один ORG
(и SECTION карточки). Руководитель в дереве — `hr_employees_id`, а не
указан — держатель вышестоящей должности (`hr_positions.hr_positions_id`).

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

**HRMS / Тренинги** (`hr_trainings`)

| # | Тип | Имя | Настройки |
|---|---|---|---|
| 1 | TABLE | Список | колонки: `title`, `category`, `starts_at`, `ends_at`, `core_users_id`, `location`, `status` |
| 2 | CALENDAR | Календарь | `calendar_from_slug: "starts_at"`, `calendar_to_slug: "ends_at"`; колонки: `title` |

**HRMS / Опросы** (`hr_surveys`) — у TABLE сверх колонок свои:
«Вопросы», «Назначено», «Заполняемость» и меню строки
(features/hrms, survey-columns).

| # | Тип | Имя | Настройки |
|---|---|---|---|
| 1 | TABLE | Список | колонки: `title`, `type`, `date_from`, `date_to`, `status`, `core_users_id` |
| 2 | SURVEY_TEMPLATES | Шаблоны | — |

Строка открывается страницей опроса (`/surveys/$id`), «Создать» —
формой (`/surveys/new`, `?tpl=` — шаблон). Вопросы — JSON SurveyJS
строкой в `hr_surveys.definition`.

Цвета вариантов `hr_surveys.status` (STATUS) — в схеме, по ним
плашки в форме и таблице: `draft` `#3B82F6`, `active` `#22A06B`,
`completed` `#8B5CF6`, `archived` `#8B5E34` (2026-10-19).

Роли «Сотрудник» для прохождения из своей карточки:
`hr_survey_participants` — чтение и изменение, `hr_surveys` — чтение,
`hr_survey_responses` — чтение и создание. Свои строки — автофильтром
`hr_employees_id` на чтение (только списки, не защита — §2). Пункт меню
«Опросы» роли не нужен. Назначение и прохождение пока пишутся
с клиента; облачной функции (как `survey_assign_employees` и
`survey_submit` в udevs-hrms-reports) в omni4 нет.

**HRMS / Имущество** (`hr_assets`, журнал — `hr_asset_movements`) —
у TABLE сверх колонок меню строки (features/hrms, asset-columns).

| # | Тип | Имя | Настройки |
|---|---|---|---|
| 1 | TABLE | Таблица | колонки: `photos`, `name`, `inventory_number`, `category`, `serial_number`, `cost`, `currency`, `hr_employees_id`, `status` |
| 2 | GALLERY | Сетка | `attributes.card: "asset"` — карточка имущества (`AssetGallery`, поля по слагам, колонки view не читает) |

Строка открывается страницей (`/assets/$id`), «Создать» — формой
(`/assets/new`). Статус и владелец меняются только движением со
страницы: запись в журнал (`action`) и новое состояние вещи; владелец
остаётся только у «Выдано». Цвета `hr_assets.status` (PICK_LIST):
`in_stock` `#9E9E9E`, `assigned` `#22A06B`, `repair` `#E3C11F`,
`written_off` `#E5484D` (2026-10-19). Облачной функции движения (как
`move_property` в udevs-hrms-reports) в omni4 нет — пишется с клиента.

**HRMS / База знаний** (`hr_kb_articles`)

| # | Тип | Имя |
|---|---|---|
| 1 | KNOWLEDGE | База знаний |
| 2 | TABLE | — |

**HRMS / Зарплата** (`hr_payroll_lines`) — колонки сводной — виды
из `hr_pay_types` (`kind` — начисление или удержание, порядок —
`sort_order`). `PAYROLL` и `PIVOT` стоят оба, пока их сравнивают
(2026-10-16, в omni4 и omni5); потом один уберут.

| # | Тип | Имя | Атрибуты |
|---|---|---|---|
| 1 | TABLE | Таблица | |
| 2 | PAYROLL | Сводная | |
| 3 | PIVOT | Сводная (PIVOT) | `pivot: {row: "hr_employees_id", col: "hr_pay_types_id", value: "amount", agg: "sum", skipEmpty: true}` |

**HRMS / Бюджет** (`hr_budget_lines`) — суммы лежат
в `hr_budget_amounts`: строка на месяц, `month` — первое число,
`amount_key` = «guid строки:ГГГГ-ММ». Нет строки суммы — экран заводит её
при первой правке. Строка без `hr_employees_id` — вакансия, подпись —
должность или `title`.

| # | Тип | Имя |
|---|---|---|
| 1 | BUDGET | Сводная таблица |
| 2 | TABLE | — |

**HRMS / KPI** (`hr_kpi_scorecards`) — пункт в «Финансах» с 2026-10-21,
в omni4 и omni5.

| # | Тип | Имя |
|---|---|---|
| 1 | KPI | Сводная таблица |
| 2 | SECTION | — |

TABLE у пункта удалён: карты правятся сводной и вкладкой сотрудника.
Модель (`erp.dbml`):

- `hr_kpi_metrics` — шаблон показателя. `hr_positions_id` пуст — разовый
  показатель, не шаблон. `period_type`: `weekly` / `monthly` /
  `quarterly` / `yearly` (`weekly` добавлен 2026-10-21); новая карта
  берёт шаблоны должности (нет — отдела) **своего** вида.
- `hr_kpi_scorecards` — карта сотрудника за период. Вида у карты нет:
  он по датам (1 день — день, ≤7 — неделя, ≤31 — месяц, ≤92 — квартал,
  иначе год). Неделя — пн–пт; день — только дочерний вид.
  `status`: `draft` → `self_review` → `manager_review` → `approved`;
  «Вернуть в работу» — снова `draft`. При утверждении фронт пишет
  `total_score`, `bonus_coefficient`, `rating`, `approved_at`,
  `core_users_id` — в схеме это [fn], функции нет.
- `hr_kpi_results` — строка карты: цель, факт, вес. Разбивка на дочерние
  периоды (год → кварталы → месяцы → недели → дни): у детей
  `parent_result_id` = guid строки родителя (SINGLE_LINE, не LOOKUP —
  связь таблицы на себя), у родителя `aggregation` (`sum` / `min` /
  `max` / `avg`). Оба поля добавлены 2026-10-21. Факт родителя
  пересчитывает фронт при вводе факта ребёнка.

Расчёт: выполнение = факт / цель (у `direction: down` — наоборот), баллы
= вес × min(120, выполнение) / 100, итог карты — сумма баллов; рейтинг и
коэффициент бонуса: ≥110 → ×1.2, ≥100 → ×1.0 «Превышает», ≥85 → ×0.8
«Соответствует», ≥70 → ×0.5 «Частично», иначе 0 «Ниже ожиданий».

**CRM / Сделки** (`crm_deals`)

| # | Тип | Настройки |
|---|---|---|
| 1 | TABLE | `attributes.quick_filters` (чипы-фильтры, по порядку): `crm_stages_id`, `core_users_id`, `priority`, `crm_sources_id`, `expected_close_date` — поля целиком с `is_checked: true` (заведено в omni4 и omni5 2026-10-29) |
| 2 | BOARD | `group_fields` → `crm_stages_id` (колонки доски — этапы); `columns` (карточка, по порядку): `title`, `amount`, `crm_companies_id`, `core_users_id`, `expected_close_date` — как в прототипе; `attributes.chips_by_id` → id поля `crm_pipelines_id` (у доски — выпадающий список воронок в панели); `attributes.chips_default` → guid воронки Udevs (открыта при первом входе, как `pipelineDefault` прототипа) (заведено в omni4 и omni5 2026-10-29) |
| 3 | LIST «Список» | `columns`: `title`, `crm_stages_id`, `amount`, `crm_companies_id`, `core_users_id`, `expected_close_date` (2026-10-29) |
| 4 | CALENDAR «Календарь» | `calendar_from_slug` = `expected_close_date`; `columns`: `title`, `crm_stages_id`, `amount` (2026-10-29) |
| 5 | TIMELINE «Таймлайн» | `calendar_from_slug` = `created_at` (системная колонка, полем не заводится), `calendar_to_slug` = `expected_close_date`; `columns`: `title`, `crm_stages_id`, `amount`; колонки — отдельным PUT, POST их не берёт (2026-10-29) |

У всех пяти: `attributes.chips_by_id` → `crm_pipelines_id`,
`attributes.chips_menu: true`, `attributes.chips_default` → guid воронки
Udevs. Воронка — выпадающий список в панели, выбор общий для всех view
таблицы (как в прототипе) (2026-10-29).

Вкладки карточки сделки (view-связи того же пункта меню, `is_relation_view`)
(2026-10-29):

| Вкладка | Тип | Таблица и связь | Колонки |
|---|---|---|---|
| Задачи | TABLE | `crm_tasks.crm_deals_id` | `title`, `status`, `priority`, `due_date`, `core_users_id` (отдельным PUT) |
| Комментарии | COMMENTS (наш тип, только вкладка) | `crm_timeline.crm_deals_id` | — ; пишет `kind: comment`, `body` |

Раскладка карточки сделки (`PUT /v2/collections/crm_deals/layout` с
`menu_id`; читать и писать — токеном пользователя: с API-ключом поля
раскладки приходят пустыми `{}`, и записать такую — стереть поля)
(2026-10-29): `layout_heading` = `title`; поля по порядку — `crm_stages_id`,
`amount`, `crm_companies_id`, `crm_contacts_id`, `core_users_id`,
`crm_pipelines_id`, `probability`, `priority`, `crm_sources_id`, `tags`,
`expected_close_date`; остальные `field_hide_layout: true`. `title` НЕ
скрывать: карточка ищет заголовок среди видимых полей, скрытый —
«Без заголовка».

**CRM / Контакты** (`crm_contacts`) — по прототипу «Контакты» (заведено
в omni4 и omni5 2026-10-29). Статусы и цвета уже как в прототипе.

| # | Тип | Настройки |
|---|---|---|
| 1 | TABLE «Все контакты» | `columns`: `full_name`, `crm_companies_id`, `job_title`, `phone`, `email`, `status`, `crm_sources_id`, `core_users_id`; `attributes.quick_filters`: `status`, `crm_sources_id`, `core_users_id`, `crm_companies_id` (`is_checked: true`) |
| 2 | BOARD «По статусу» | `group_fields` → `status`; `columns`: `full_name`, `crm_companies_id`, `job_title`, `phone`, `core_users_id` |
| 3 | LIST «Список» | `columns`: `full_name`, `crm_companies_id`, `status`, `phone` |
| 4 | CALENDAR «Календарь» | `calendar_from_slug` = `created_at`; `columns`: `full_name`, `status` |

Вкладка карточки: «Сделки» — TABLE, `crm_deals.crm_contacts_id`,
колонки `title`, `crm_stages_id`, `amount`, `core_users_id`,
`expected_close_date`. Заголовок карточки — `full_name` (раскладка,
токеном пользователя, как у сделок).

**CRM / Компании** (`crm_companies`) — по прототипу «Компании» (заведено
в omni4 и omni5 2026-10-29).

| # | Тип | Настройки |
|---|---|---|
| 1 | TABLE «Все компании» | `columns`: `name`, `industry`, `status`, `city`, `core_users_id`, `inn`; `attributes.quick_filters`: `status`, `industry`, `city`, `core_users_id` (`is_checked: true`) |
| 2 | BOARD «По отрасли» | `group_fields` → `industry`; `columns`: `name`, `status`, `city`, `core_users_id` |
| 3 | LIST «Список» | `columns`: `name`, `industry`, `city`, `core_users_id` |

Вкладки карточки: «Контакты» — `crm_contacts.crm_companies_id`
(`full_name`, `job_title`, `phone`, `email`, `status`); «Сделки» —
`crm_deals.crm_companies_id` (`title`, `crm_stages_id`, `amount`,
`core_users_id`, `expected_close_date`). Заголовок карточки — `name`.

Цвета вариантов (`attributes.options[].color`, `has_color: true`), как
в прототипе: `industry` — Логистика `#3B82F6`, Ритейл `#F97316`, Финансы
`#22A06B`, Производство `#A16207`, Медицина `#EF4444`, Образование
`#8B5CF6`, HoReCa `#EC4899`, Госсектор `#9E9E9E`, Агро `#EAB308`, IT
`#3B82F6`; `city` — Ташкент `#3B82F6`, Самарканд `#F97316`, Бухара
`#A16207`, Наманган `#22A06B`, Андижан `#EAB308`, Фергана `#EC4899`, Нукус
`#8B5CF6`, Карши `#EF4444`; `size` — 1–10 `#9E9E9E`, 11–50 `#3B82F6`,
51–200 `#22A06B`, 201–500 `#F97316`, 500+ `#8B5CF6`.

«Сделок», «В воронке», «Выручка» прототипа — суммы по сделкам, полей нет
(нужна формула или функция).

**Телефония onlinePBX** (заведено в omni4 и omni5 2026-10-29) — три
таблицы без пунктов меню, `attributes.protected: true`, ровно с этими
слагами: их читает общая функция `professional-crm-pbx-integration-call`
(репозиторий pbx-fn, ходит только в эти имена — `pbx_runtime_items.go:27`).

| Таблица | Поля |
|---|---|
| `pbx_settings` «Настройки PBX», одна строка | `domain`, `api_key`, `phone_number` (SINGLE_LINE), `enable` (SWITCH), `verto_host`, `auth_key_id`, `auth_key`, `auth_expires_at` (SINGLE_LINE, пишет функция) |
| `pbx_operators` «Операторы PBX» | `users_id` (SINGLE_LINE — guid `core_users`: функция ищет по этому слагу, а связь дала бы `core_users_id`), `pbx_extension` (SINGLE_LINE), `enabled` (SWITCH) |
| `pbx_calls` «Звонки PBX» | `call_uuid`, `client_phone`, `pbx_from`, `status`, `error_code`, `idempotency_key`, `users_id`, `direction`, `recording_url`, `stereo_recording_url` (SINGLE_LINE), `duration` (NUMBER), `transcript` (MULTI_LINE) |

Запись функции в проекте заводит экран onlinePBX при первом сохранении
(WORKFLOW → PUT KNATIVE, `max_scale = former_max_scale = 3`).

**CRM / Журнал звонков** (`pbx_calls`) — заведено в omni4 и omni5
2026-10-30 (`POST /v3/menus` с `table_id`, затем `POST /v2/views/pbx_calls`).

| # | Тип | Имя |
|---|---|---|
| 1 | PBX_CALLS | Журнал |
| 2 | TABLE | — |
| 3 | SECTION | — |

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
| `core_settings` | одна строка: формат даты, базовая валюта, налоги и нормы HR. `vat_percent` с экрана убран 2026-10-26 (ставка — у юрлица), колонку можно не заводить | «Профиль» → «Язык и регион», «Налоги и нормы» |
| `crm_legal_entities` | одна строка с `is_default: true` (только при CRM) | «Профиль компании» |
| `hr_recruiting_pipelines` | одна воронка с `is_default: true` | новая вакансия берёт её |
| `hr_recruiting_stages` | этапы этой воронки с `sort_order` | воронка, «Следующий этап»; правятся внутри «Настройки модулей / HRMS / Воронки рекрутинга» — отдельного пункта «Этапы» нет |
| `hr_candidate_sources`, `hr_rejection_reasons` | у `type` и `side` цвета вариантов (как в прототипе) — иначе теги серые | «Наймов за год», «Случаев за год» |
| `hr_career_site` | одна строка настроек | «Карьерный сайт»; публичную страницу пока отдаёт старый HRMS |
| `hr_absence_types` | типы с `name`, `icon`, `color`, `limit_days`, `limit_period`, `min_tenure_months`, `sort_order`; у вариантов `limit_period` цвета (год `#3B82F6`, месяц `#8B5CF6`, неделя `#F0842B`, без лимита `#9E9E9E`) — иначе теги «Политики отсутствий» серые | табель, баланс, заявки, «право с» по стажу |
| `hr_pay_types` (added 2026-10-28) | «Оклад» (`code = salary`) и «Опоздания» (`code = late_fine`, `kind = deduction`) | «Утвердить» табеля (функция пишет штрафы в «Опоздания»; без обоих видов отказ), шаблон Excel «Зарплаты» — колонка «Оклад» (её пишет загрузка) и колонка штрафов (только чтение; без политик — старая формула, загружается) |
| `hr_shift_kinds` | «Дневная» (`lucide:sun`), «Ночная» (`lucide:moon`), «Удалённо» (`lucide:house`, `is_remote`) с цветом, временем и `sort_order` | график работы: смены, шаблоны |
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

**2026-10-16, меню omni5 → omni4.** Меню правили в omni5; omni4
выровнен по нему: убраны 7 пунктов HRMS (§3.2) и LINK «Dashboards»
в корне, «Начисления» → «Зарплата», «Строки бюджета» → «Бюджет».
Обход дерева по API — расхождений нет, кроме места системных папок
(Content, Settings, Files, Users) в корне. В omni5 заведены вкладки
`PAYROLL`, `PIVOT` и `BUDGET` (§4.2). В браузере не проверено.
Иконки тоже по omni5: «Тренинги» 🎓, «Опросы» 📋, «Зарплата» 💵,
«Бюджет» 💰. Расходится одна — «Воронки» в настройках CRM: в omni4 🛒,
в omni5 иконки нет; шаблон её не задаёт.

## 8. Открыто

- **Как шаблон применяется** — механизм на стороне ucode (копия
  проекта, функция при создании компании, скрипт) не выбран. От него
  зависит, нужен ли машиночитаемый вариант этого файла (JSON-манифест
  со слагами).
- «Склад» и «Финансы» — в прототипе только плитки, папок в omni4 нет.
- Функции и события (бот, расчёт зарплаты, импорт) в этот список
  не входят — их заводит бэкенд.
