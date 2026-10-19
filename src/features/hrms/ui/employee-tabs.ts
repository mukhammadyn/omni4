/**
 * Свои вкладки страницы сотрудника — «Отсутствия», «Посещаемость»,
 * «График работы», «Опросы» и «Имущество» (`#abs`, `#att`, `#sched`,
 * `#surveys`, `#assets` прототипа). Имена — в адресе (`?tab=attendance`):
 * по ним экраны посещаемости открывают нужную вкладку.
 */
export const ABSENCES_TAB = "absences";
export const ATTENDANCE_TAB = "attendance";
export const SCHEDULE_TAB = "schedule";
export const SURVEYS_TAB = "surveys";
export const ASSETS_TAB = "assets";
export type EmployeeTab = typeof ABSENCES_TAB | typeof ATTENDANCE_TAB | typeof SCHEDULE_TAB | typeof SURVEYS_TAB | typeof ASSETS_TAB;
