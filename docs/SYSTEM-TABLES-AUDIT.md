# Аудит системных таблиц

Дата: 2026-10-05. Статус: найдено, ничего не исправлено.

Что сверялось: справочники модулей — группы «Система» CRM и HRMS
(лежат в корневой папке «Настройки модулей», см. STATUS.md) и
справочники «Ядра». Живая схема проекта omni4 (`GET /v2/fields/{slug}`)
сравнивалась с тремя источниками:

- **замысел** — `ucode/erp/erp.dbml` и `ucode/erp/PRD.md`;
- **как выглядит** — прототип `omni4_core/prototype/` (`settings.html`,
  массив `MODS`, и страницы модулей);
- **как работает** — эталон CRM `new-crm/professio_app_69f844` и
  HRMS `hrms/udevs_hrms_admin`.

Итог: набор полей с `erp.dbml` совпадает — всё, что есть в DBML,
есть в проекте. Расходятся подписи, несколько настроек полей и,
главное, места, где схема не выражает логику прототипа или рабочих
приложений.

Сокращения в ссылках:

| | Файл |
|---|---|
| **dbml** | `ucode/erp/erp.dbml` |
| **PRD** | `ucode/erp/PRD.md` |
| **set** | `omni4_core/prototype/settings.html` |
| **CRM** | `new-crm/professio_app_69f844/src` |
| **CRM (u-gen)** | то же, ветка `u-gen` (прод), читалось через `git show u-gen:…` |
| **HR** | `hrms/udevs_hrms_admin/src` |

Оговорка по эталону CRM: рабочее дерево стоит на ветке
`fix/drop-stage-groups` (на 28 коммитов впереди `u-gen`). ADR-0001
эталона («исход = контейнер + флаг»), на котором построена схема
omni4, есть только там; в проде (`u-gen`) логика другая. Оценка
звонков — только в ветке `origin/feat/call-quality-scoring`.

---

## 1. Исправить сразу — решений не требует

### 1.1 Подписи полей

84 поля подписаны слагом (`is_active`, `sort_order`, `color`,
`description`, `icon`, `is_default`, `signed_at`, `page_name`,
`comment`), у всех LOOKUP подпись вида «FROM crm_stages TO
crm_pipelines». В интерфейсе это видно как есть.

В подпись попал пример из заметки DBML:

| Поле | Подпись сейчас |
|---|---|
| `org_settings.date_format` | «dd» |
| `org_settings.timezone` | «Asia/Tashkent» |
| `locations.timezone` | «Asia/Tashkent» |
| `currency_rates.rate_key` | ««USD» |
| `crm_call_quality_versions.criteria` | «[{name, max, rules}]» |
| `hr_assets.status` | «Статус [fn» (обрезано) |
| `hr_absence_types.name`, `hr_rejection_reasons.name`, `hr_pay_types.name` | текст примера |
| `hr_candidate_sources.name` | «hh» |
| `hr_candidate_sources.currency` | «PICK_LIST» |

Подписи по таблицам Ядра:

| Таблица | Поля с плохой подписью |
|---|---|
| business_units | `description`, `color`, `employees_id`, `legal_entities_id` |
| locations | `color`, `phone`, `business_units_id`, `timezone` |
| legal_entities | `color` |
| departments | `is_active`, `sort_order`, `color`, все 3 LOOKUP |
| positions | `is_active`, 2 LOOKUP |
| grades | `is_active`, `color` |
| product_categories | `is_active`, `color`, LOOKUP |
| task_lists | `is_active`, `sort_order`, `description`, `color` |
| task_statuses | `sort_order`, `color`, LOOKUP |
| units | — |

### 1.2 Поля

- **`locations.region`** — PICK_LIST без единого варианта: регион
  выбрать нельзя. В прототипе (set:2519) и HRMS (HR
  `modules/Settings/Branches/index.tsx:230-235`) он обязателен.
  Варианты — в заметке dbml:896.
- **`hr_holidays.board_order`** «BOARD ORDER» — в DBML нет, видимо
  завёл ucode под доску. Убрать или скрыть.
- **`org_settings`** — ни у одного поля нет значения по умолчанию;
  в DBML они в заметках: 12 / 12 / 12 / 40 / 15 / 150 (dbml:842-848).
  `date_format` — SINGLE_LINE, в прототипе выбор из трёх форматов
  (set:1588): нужен PICK_LIST.
- **`currency_rates.currency`** — среди вариантов UZS: курс сума
  к суму бессмыслен.
- **`unique`** на обязательные коды: `hr_absence_types.code` (код
  табеля, `attendance.html:2793`), `legal_entities.inn` (dbml:867),
  `units.short_name` (dbml:1066).
- **`locations.timezone`** — свободный текст; HRMS берёт пояс из
  списка IANA (HR `utils/timezones.ts:43-52`). Нужен список или
  проверка в функции.

---

## 2. Схема не выражает логику — нужно решение

### 2.1 CRM

#### Исход сделки: три разные модели

| Где | Выиграна | Проиграна |
|---|---|---|
| omni4 (dbml:1334, PRD FR-R3) | этап в контейнере `done` | флаг `crm_deals.is_lost` |
| эталон, HEAD (CRM `lib/dealState.ts:65-75`, ADR-0001) | так же | так же |
| эталон, `u-gen` — прод (CRM (u-gen) `lib/dealStageGroup.ts:26-31, 89-107`) | `stage_group=won` | `stage_group=lost` + регэксп по имени `/cancel\|lost\|disqualified/`; `is_lost` перебивает |
| прототип | этап «Оплачено» / «Клиент активный» (`deals.html:2822`) | этап «Проиграно» (`deals.html:2786`) |

- В прототипе «Проиграно» и «Неквалифицирован» лежат в контейнере
  `done` (set:3247). Заведённые так в omni4, они посчитаются
  **выигрышем**. Отказных этапов в настройках быть не должно —
  отказ задаётся флагом (PRD D14). Прототип придётся поправить.
- В проде этапы-отказы настоящие: «Клиент отказался», «Closed Lost»
  с `stage_group: lost` (seed в `schema.baseline.json`). При
  переносе их сделки → `is_lost=true` с причиной, этапы удаляются.

#### crm_pipelines — OK

- Прототип: имя и цвет (set:3243-3244); эталон: только `label`
  (CRM (u-gen) `useDealPipelines.ts:138`). Покрыто.
- `is_default` ровно у одной воронки — только функцией.

#### crm_stages — нужны правки

- **Срок на этапе некуда записать.** Эталон при смене этапа пишет
  в сделку `end_date = переход + дни этапа` (CRM (u-gen)
  `dealStageSla.ts:123-143`), по нему — просрочка на карточке
  (`useDealStageMeta.ts:45-55`). У нас `term_days` есть, а в
  `crm_deals` нет ни срока этапа, ни времени входа (dbml:1369-1399);
  `expected_close_date` — другое. Нужно поле, например
  `crm_deals.stage_due_at`, которое ставит функция.
- `field_rules` совпадает с `deal_board_columns` эталона
  (`{field: {visible, required}}`, CRM (u-gen)
  `dealBoardFieldSettings.ts:5-8, 37-54`). Не выражается видимость
  на уровне воронки (`deal_owner_pipeline`, там же :3, 65-76) —
  только копией правила в каждый этап.
- Подписи вариантов `container` расходятся: прототип «Новый лид /
  В процессе / Завершено» (set:3246), эталон «Новые лиды / Сделки
  в работе / Завершенные сделки» (CRM (u-gen) `dealItemType.ts:11-15`),
  DBML «Новые / В работе / Завершено» (dbml:70-72). Выбрать одно.

#### crm_lost_reasons — OK

- Прототип: имя, цвет, порядок, счётчик сделок (set:3282). В эталоне
  причина — PICK_LIST `lost_reason` на сделке, при отказе
  обязательна, этап не меняется (CRM (u-gen) `DealsPage.tsx:3408`,
  `DealFormDrawer.tsx:1301-1315`).
- `is_disqualification` нет ни в прототипе, ни в эталоне; нужен для
  win-rate (PRD FR-R15). Оставить, но показать в настройках.

#### crm_sources — нужны правки

- **`channel` отвечает не на тот вопрос.** В эталоне категория
  источника — `ads | partner | agent | outbound | other`
  (CRM (u-gen) `sourceValues.ts:43`); сайт и соцсети сознательно
  в рекламе: отчёт сравнивает «купленный трафик против сарафана»
  (там же :39-42). У нас `website`, `messenger`, `social` отдельно
  от `ads`, `agent` нет. Либо сменить набор, либо добавить
  `is_paid` (CHECKBOX).
- В прототипе канала нет: имя, цвет, вкл/выкл (set:3281).
- В эталоне источник у сделки — MULTISELECT (`sourceValues.ts:122`),
  у нас один LOOKUP (осознанно, PRD D6). При переносе из нескольких
  источников останется один.
- Справочник «Источники» в настройках эталона — заглушка на
  локальном state (CRM (u-gen) `SettingsSales.tsx:1178-1191`);
  настоящие источники — варианты поля сделки.

#### crm_lead_forms — нужны правки (+ ошибка бэкенда, см. §3)

- Бэкенд воронку и источник формы не читает (§3).
- Нет `status` — шлюз пишет статус формы из Meta
  (`facebook_professional_crm.go:260`).
- Нет этапа входа: в эталоне он задан («Новая заявка», :68). Либо
  `crm_stages_id`, либо правило «первый этап контейнера `new`
  по `sort_order`».
- Сопоставление полей и `provider` не нужны, пока только Meta
  (в прототипе из интеграций только Meta Ads, set:3237; у эталона
  есть Google Ads, CRM (u-gen) `SettingsIntegrations.tsx:159-189`).

#### crm_call_quality_versions — нужны правки

- **Форма `criteria`.** DBML `{name, max, rules}` (dbml:1474),
  прототип `{name, max, rule}` (set:3162-3168), эталон
  `{id, name, instructions, max_score, allowed_scores}`
  (CRM `callQuality.ts:9-15`). Оценка ссылается на `criterion_id`
  (там же :32, 42) — критерию нужен постоянный `id`; ключ правила —
  одно имя.
- Две активные версии (`is_active` «Текущая») ничем не запрещены;
  в эталоне настройка — одна строка, `limit 1` (`callQuality.ts:104`).
  Нужна функция.
- Неизменяемость версии не обеспечена: эталон хэширует критерии,
  чтобы ловить правку на месте (`callQuality.ts:132-140`). У нас
  «новая версия — новая строка», но версию с оценками можно
  отредактировать.
- `auto_evaluate` в прототипе — общий переключатель отдельно от
  версии (set:3184-3185). В версии он будет переключаться при смене
  версии сам. Перенести в `org_settings`.

#### crm_reply_templates — OK

- Прототип: название и текст (`chats.html:2823-2824`), вызов
  через «/» (`chats.html:1825`). В эталоне быстрых ответов нет
  (`ChatComposer.tsx:16` — захардкоженная подсказка).

#### crm_ad_spend — мелкие правки

- Нет ключа уникальности источник × месяц × валюта — по образцу
  `plan_key` у `crm_sales_plans` (dbml:1439).
- `period` — DATE, но означает месяц: первое число ставит форма
  или функция.
- Данные: рекламные каналы прототипа — Meta Ads, Telegram Ads,
  Google Ads, Yandex Direct, Блогеры (`index.html:2979`), источники —
  Сайт, Telegram, Таргет Meta… (`index.html:2956`). Google, Yandex
  и блогеров среди источников нет — расход привязать некуда.
  В эталоне расход Meta идёт из Meta API (CRM (u-gen)
  `MetaAdsDashboard.tsx:674-699`), ручной ввод нужен только для
  остальных каналов.

#### Настройки CRM без таблицы

- **Шаблоны писем** — в эталоне заглушка на state (CRM (u-gen)
  `SettingsSales.tsx:1260-1270`), в прототипе нет. Скорее не нужна.
- **Шаблоны сделок** («Пустая сделка», «Аутстаффинг — шаблон»,
  `deals.html:2813`) — только в прототипе, хранить негде.
- Остальное покрыто: типы задач — `task_type` (dbml:201), свои
  поля — поля ucode. Цвета: в прототипе 9 именованных (set:2505),
  в схеме COLOR в HEX — не ошибка, omni4 переводит HEX в оттенок
  палитры (REDESIGN.md:36-37).

### 2.2 HRMS

#### hr_documents, hr_assets — не справочники

Рабочие списки: у прототипа свои страницы `documents.html` и
`properties.html`, в его сайдбаре HRMS они в группе «Система».
**Вернуть в сайдбар** — сейчас спрятаны вместе со справочниками.

- `hr_assets.category` — фиксированный PICK_LIST (dbml:1754).
  В HRMS категории — редактируемый справочник (HR
  `modules/Settings/PropertyCategories/index.tsx:8`,
  `api/services/property.service.ts:35`), в прототипе у категории
  иконка и цвет (`properties.html:2604`).

#### hr_salary_bands — нужны правки

- **Стаж в двух местах:** `grades.min_tenure_months` (dbml:939) и
  `hr_salary_bands.min_tenure_months` (dbml:1678). Оставить одно —
  логичнее в матрице.
- **Нет ступени матрицы.** В прототипе стаж и потолок — на ступень
  (уровни 1–7), не на ячейку (set:2885-2887); в HRMS так же,
  `MatrixColumn {minMonths, maxSalary}` (HR
  `modules/Settings/GradeMatrix/types.ts:3-8`). У нас они
  повторяются в каждой строке должность × грейд и разъедутся.
- Критерий — один на отдел и ступень (set:2886; HR types.ts:12-19),
  у нас дублируется на каждую должность.
- Нет названия версии матрицы («Основная», «Вариант 2»,
  set:2885/2893); `is_active` и `effective_from` пересекаются.
- Ячейка-должность (PM→CPO, TL→CTO; HR types.ts:16, set:2887)
  не выражается.
- Уникальность (должность, грейд, `effective_from`) — только функцией.
- В HRMS политика `grade_salary_policy` = off / warn / required
  (HR `api/services/mainSettings.service.ts:11-21`); у нас жёстко
  «только помечать» (dbml:1683) — сознательное сужение.

#### hr_dismissal_reasons — нужны правки

- **Тип увольнения — фиксированный PICK_LIST** (dbml:1691). В HRMS
  `dismissal_types` — отдельный справочник, у сотрудника два поля
  (HR `api/services/employee.service.ts:103-117`), отчёт текучки
  фильтрует по обоим (`modules/Reports/StaffTurnover/index.tsx:150-151`).
  В прототипе — дерево «Тип → Причина» с добавлением типов
  (set:2779-2781).
- У типа нет срока уведомления и выходного пособия (set:2780) —
  сейчас только текстом в описании enum (dbml:430-436).
- `rehire_allowed` в прототипе на типе (set:2780), у нас на причине.
- Нет `color` (set:2779).
- Предложение: `hr_dismissal_types` (название, срок уведомления,
  пособие, повторный найм, цвет) + LOOKUP из причины.

#### hr_document_folders — мелкие правки

- Нет иконки (`documents.html:2711`).
- В прототипе папки вложены (set:2673) — если нужно, самосвязь.

#### hr_document_templates — OK

- `variables` скорее не нужно: в HRMS переменные — фиксированный
  каталог `{{user.*}}` (HR
  `modules/Settings/Documents/TemplateCreate/index.tsx:31-51`).
- Нет `color` (set:2776). Формат DOCX/PDF (set:2777) — из
  расширения файла.

#### hr_holidays — нужны правки

- `board_order` — см. §1.2.
- В `type` нет «рабочего праздника» (без выходного): в HRMS
  `is_working_holiday` (HR `api/services/holidayPolicy.service.ts:23`).
- **Календарь не сущность.** В прототипе календари именованные:
  название, год, к чему применяется, «Активен/Черновик», копирование
  на следующий год (set:3108-3109). В HRMS политика привязана
  к региону (HR `api/services/region.service.ts:32`). У нас только
  `locations_id` на строке: календарь региона дублируется на каждую
  локацию, черновик не выразить.
- Уникальность (дата, локация) — только функцией.

#### hr_absence_types — OK

- Покрывает HRMS полностью (HR
  `modules/Settings/AbsencePolicies/index.tsx:246-254`) и прототип
  (set:2797).
- `code` → unique (§1.2).
- Не выражено начало цикла лимита (календарный год или годовщина
  приёма); в HRMS цикл считает бэкенд
  (`api/services/employeeAbsenceSummary.service.ts:16-33`). Открытый
  вопрос для `fn_absence_accrual`.

#### hr_approval_routes — нужны правки

- **Один отдел на маршрут** (`departments_id`, dbml:1928). В HRMS
  процесс покрывает много отделов (`approval_process_departments`,
  HR `modules/Settings/Approvals/mockData.ts:28-35`,
  `api/services/approval.service.ts:128-140`). У нас маршрут с шагами
  копируется на каждый отдел. Нужна связка маршрут↔отдел или
  сознательное дублирование.
- `request_type` — 3 значения (dbml:570), в HRMS 6
  (mockData.ts:7-13). Нет `employee_work_approval` (кадровые
  изменения), `remote_mark_approval`, `manual_time_approval`.
- Нет `description` (approval.service.ts:117).
- Экрана в прототипе нет (в `MODS`, set:2483, маршрутов нет;
  цепочка видна только в `attendance.html:2989`).

#### hr_penalty_policies — OK

- В HRMS у назначения есть «все филиалы» и исключённые сотрудники
  (HR `api/services/reports.service.ts:3308-3316`). В `penalty_scope`
  (dbml:612) нет «вся компания». Исключение — назначение на пустую
  политику (как «Руководители» в прототипе, set:3046).

#### hr_penalty_rules — в целом OK

- Нельзя выключить вид нарушения, не удаляя строки: в HRMS
  `enabled` на каждый вид (HR
  `modules/Settings/AttendancePenalties/index.tsx:43-57`), в прототипе
  `late.on` (set:3042). Нужно — `is_active`.
- `currency` на каждой ступени избыточна: HRMS берёт валюту компании
  (AttendancePenalties:537). Хотя бы умолчание из `base_currency`.
- Обязательность `threshold_minutes` для `late`/`early_leave`
  и уникальность (политика, нарушение, порог) — только функцией.

#### hr_recruiting_pipelines — нужны правки

- **Копии смешаются с шаблонами.** HRMS и прототип копируют этапы
  в вакансию (HR `modules/Recruiting/types.ts:4-6,173`,
  `vacancies.html:2650`); у нас своя последовательность вакансии —
  копия воронки (dbml:2012), и копии попадут в список в настройках.
  Нужен `is_template`.
- Нет `description` (types.ts:26).
- Одна `is_default` — только функцией.

#### hr_recruiting_stages — OK

- `container` совпадает с прототипом (set:2801). «Принят» и «Отказ»
  в прототипе — этапы (set:2802), в DBML — статусы кандидата
  (dbml:2025). Решение, не ошибка.

#### hr_candidate_sources — мелкие правки

- Источник «Карьерный сайт» нужен функции отклика (PRD FR-H21),
  а найти его можно только по названию. Нужен `code` или `is_system`.

#### hr_rejection_reasons — нужны правки

- **Нет причин резерва.** Резерв требует причину (dbml:2105,
  FR-H18); в прототипе это отдельный список («Сильный кандидат, нет
  позиции», `candidates.html:2665`). В `side` (company/candidate)
  места нет. Добавить `reserve` или поле вида причины.

#### hr_pay_types — OK

- `code` — по нему функции ищут вид (`late_fine`). Unique только при
  обязательном поле: обязательный + unique или проверка в функции.
- В HRMS аналог — закрытый `slug === "attendance_penalty"` (HR
  `modules/Settings/Compensation/components/CompensationDirectoryTab.tsx:288`);
  у нас покрыто `code` + `is_system`.

#### hr_kpi_metrics — OK как шаблоны

- Экрана в прототипе нет — решить, где редактировать.
- По сравнению с HRMS (HR `api/services/reports.service.ts:1592-1595,
  1636-1663`) нет: иерархии KPI и агрегации от дочерних, периодов
  `daily`/`weekly`, выплаты пропорционально проценту (у нас таблица
  коэффициентов, dbml:2337), символа значения, привязки сотрудников.

#### Настройки HRMS без своей таблицы

| Сущность | Где есть | Что у нас | Проблема |
|---|---|---|---|
| Типы занятости | set:2767-2769; HR `employment_types` (`employee.service.ts:64`) | PICK_LIST `employment_type` + `work_format` на `employees`, `hr_job_history`, `hr_vacancies` (dbml:980, 1659, 2043) | В прототипе редактируемый список; варианты в трёх полях разойдутся |
| Навыки | set:2770-2772; HR `skills` + `employee_skills` | MULTISELECT `skills` на трёх таблицах (dbml:990, 2050, 2100) | Один список в прототипе — три независимых у нас |
| Причины изменения работы | set:2782-2784; HR `employee_work_reason` | PICK_LIST `change_reason` (dbml:419, 1649) | Фиксированы; если `fn_job_history` ветвится по `hire` — оставить, экран правит варианты |
| Типы увольнения | HR `dismissal_types`; set:2779 | PICK_LIST на причине | см. hr_dismissal_reasons |
| Категории имущества | HR `property_categories` | PICK_LIST `hr_assets.category` | Не редактируются |
| Календари праздников, регионы | HR `holiday_policies`, `regions`; set:3108 | плоский `hr_holidays` + PICK_LIST `locations.region` | см. hr_holidays |
| Испытательный срок | HR `probation_policies` | `settings.default_probation_months` | Одно значение вместо политик |

Нужно решить: превращать их в таблицы или делать экран, который
правит варианты поля сразу на всех таблицах.

### 2.3 Ядро

Из рабочих приложений ядро есть только в HRMS. В CRM отдел и город —
свободный текст (CRM `types.ts:53,55`), валюта — строка без курсов
(CRM `pages/FunnelPage.tsx:452-458`). Юрлиц, бизнес-юнитов,
категорий и единиц нет ни в одном приложении — новые сущности.

#### business_units — OK

- Прототип (set:2513): название, цвет, руководитель, описание,
  «Активен» — есть. Число сотрудников — считать на фронте или функцией.

#### locations — нужны правки

- `region` и `timezone` — §1.2.
- Радиус геозоны по умолчанию: HRMS 200 м (HR
  `components/map/shared.ts:63`), DBML 150 м (dbml:847). Выбрать одно.
- Проверку отметки по геозоне и MAC делает функция; в HRMS — только
  бейдж задним числом (HR `components/map/LocationViewLink.tsx:33-46`).

#### legal_entities — OK

- Поля прототипа (set:2522) есть. `is_default` у одной строки —
  функцией. `inn` → unique (§1.2).

#### departments — OK

- Прототип (set:2525): родитель, руководитель, цвет; остальное —
  по FR-C1 (PRD:222). Запрет циклов (HR
  `modules/Settings/Departments/index.tsx:210-247`) и «всего
  с вложенными» (HR `reports.service.ts:1005-1060`) — не в схеме.

#### positions — OK

- Прототип (set:2528) покрыт. В HRMS вместо отдела группа уровней
  (HR `api/services/position.service.ts:7-24`) — закрывает `level`.
  Запрет циклов — не в схеме.

#### grades — нужна правка

- Стаж в двух местах — см. hr_salary_bands.
- В прототипе грейды — дерево «Группа → Элемент» с добавлением групп
  (set:2773-2775); у нас группа = PICK_LIST `level`, варианты правятся
  только в конструкторе. Решение DBML (dbml:944) — экран прототипа
  упростить.

#### product_categories — мелкая правка

- В прототипе есть «Описание» (set:2531), в схеме нет. Добавить
  `description` или убрать из экрана.

#### units — OK

- `short_name` → unique (§1.2).

#### task_lists — OK

- Прототип (`lists.html:3050-3065, 3191-3195`) покрыт. Запрет удалять
  системный и последний лист (`lists.html:3252`), перенос задач при
  удалении (FR-P2, PRD:385) — функцией.

#### task_statuses — OK, один вопрос

- Нет начального статуса: в HRMS `isInitial`, один на компанию (HR
  `modules/Tasks/types.ts:16-38`). Либо `is_default`, либо правило
  «первый статус группы `todo` по `sort_order`».
- В HRMS группа «завершено» — `completed`
  (HR `modules/Tasks/statusGroups.ts:15`), у нас `done`.
- «В каждой группе хотя бы один статус» (`lists.html:3229, 3237`)
  и перенос задач при удалении (`lists.html:3232`) — функцией.

#### org_settings — нужны правки

- **Слаг расходится с DBML:** там таблица `settings` (dbml:840).
  Системной `settings` у ucode нет. Обновить DBML или переименовать.
- Подписи, умолчания, `date_format` — §1.
- **`base_currency` и курсы.** `base_currency` может быть USD, а
  `currency_rates.rate` — «сумов за единицу» (dbml:858). Либо основная
  всегда UZS (и поле убрать), либо курс в основной валюте.
- **Не хватает полей:**
  - «Учёт времени» (set:2500): обязательный учёт, шаг 15/30/60,
    напоминание, биллинг по часам. FR-P6 называет шаг настройкой
    (PRD:391-396), в DBML полей нет.
  - «Локализация» (set:1587, 1591, 1593): язык интерфейса,
    автообновление курса ЦБ, формат телефона.
  - «Профиль компании» (set:1567-1574): отрасль, сайт, телефон.
    Логотип и название — настройки проекта ucode (PRD:655); юр.
    название, ИНН, адрес — `legal_entities` с `is_default`.
- «Ровно одна строка» — не в схеме.

#### currency_rates — мелкая правка

- Подпись `rate_key`, UZS в вариантах — §1.
- Курсы пока никто не читает: omni4 их не применяет (ADR-0013),
  в CRM и HRMS курсов нет (в HRMS только `fx_rate` в биллинге,
  HR `api/services/billing.service.ts:68`).

#### Разделы настроек прототипа без таблицы

| Раздел | Чем закрывает DBML |
|---|---|
| Регионы (set:2515) — дерево страна → город → район, с кодом | PICK_LIST на `locations` (PRD:224, 685); дерево и код потеряны, вариантов нет |
| Файлы и документы — общий диск (set:2762) | Не закрыт; есть только HR-папки (dbml:1713) |
| Товары и услуги (set:2533) | Таблица `products` есть (dbml:1071); ссылки на группу нет |
| Атрибуты (set:2536), Группы товаров (set:2542) | Сознательно не переносятся (dbml:1086) |
| Статусы проектов (set:2498) | STATUS на `pm_projects`, `project_status` (dbml:387-396, 1556). Список в настройках прототипа («Пресейл, Анализ…») противоречит `projects.html:3039` и DBML — экран переделать |
| Типы задач (set:2499) | PICK_LIST `task_type` (dbml:201-211). Совпадает с `pm-tasks.html:3038`; «Фича» и «Исследование» из настроек — расхождение прототипа с самим собой |
| Учёт времени (set:2500) | Не закрыт; `time_entries.is_billable` (dbml:1240) — на записи, не глобальный |
| Брендинг (set:1577) | Настройки проекта ucode (PRD:655); у эталона CRM своя таблица `branding` (CRM `lib/branding.ts`) — по PRD не нужна |

---

## 3. Ошибка бэкенда

**Шлюз Meta-лидов не читает `crm_lead_forms`.** Воронку, этап
и источник он берёт одни на проект из `crmMapping` в настройках
ресурса (`ucode_go_admin_api_gateway`, `facebook_professional_crm.go:58-76,
80-100`), а не из строки формы. Значения пишет массивами, как для
STATUS/MULTISELECT (`[]string{…}`, :456-458), источник — текстом
«Facebook: <имя формы>» (:22, :446). Поэтому `crm_pipelines_id`
и `crm_sources_id` формы ни на что не влияют, а запись в LOOKUP-поля
omni4 сломается. Перенести в `backend-notes.md`.

---

## 4. Порядок работы

1. §1 — подписи, варианты региона, `board_order`, умолчания
   `org_settings`, `unique`. Правится в проекте, решений не требует.
2. Вернуть Документы и Имущество в сайдбар HRMS.
3. §3 — в `backend-notes.md`.
4. §2 — по одному вопросу: сначала решение, потом правка
   `erp/erp.dbml`, потом проекта. Первыми — те, что ломают данные:
   отказные этапы CRM, стаж в двух местах, `base_currency`, слаг
   `org_settings`.
