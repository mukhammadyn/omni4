/**
 * Свои вкладки страницы сотрудника — «Отсутствия», «Посещаемость»,
 * «График работы», «Тренинги», «Опросы», «Имущество», «Документы», «Адреса и телефоны», «Состав семьи» и «Образование» (`#abs`, `#att`,
 * `#sched`, `#train`, `#surveys`, `#assets`, `#docs`, `contacts`, `family`, `edu` прототипа). Имена — в адресе (`?tab=attendance`):
 * по ним экраны посещаемости открывают нужную вкладку.
 */
export const ABSENCES_TAB = "absences";
export const ATTENDANCE_TAB = "attendance";
export const SCHEDULE_TAB = "schedule";
export const SURVEYS_TAB = "surveys";
export const ASSETS_TAB = "assets";
export const DOCS_TAB = "docs";
export const TRAININGS_TAB = "trainings";
export const KPI_TAB = "kpi";
export const CONTACTS_TAB = "contacts";
export const FAMILY_TAB = "family";
export const EDUCATION_TAB = "edu";
export type EmployeeTab = typeof ABSENCES_TAB | typeof ATTENDANCE_TAB | typeof SCHEDULE_TAB | typeof SURVEYS_TAB | typeof ASSETS_TAB | typeof DOCS_TAB | typeof TRAININGS_TAB | typeof KPI_TAB | typeof CONTACTS_TAB | typeof FAMILY_TAB | typeof EDUCATION_TAB;
